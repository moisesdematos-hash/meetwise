# Arquitetura do Sistema de Faturação e Monetização (Fase 6)

## 1. Visão Geral e Filosofia Arquitetural

O subsistema de monetização do **MEETWISE AI** foi concebido como uma camada agnóstica de catálogo, subscrições, pagamentos, quotas e contabilidade analítica. A arquitetura cumpre rigorosamente os princípios de isolamento multi-tenant, separação entre contabilidade operacional e financeira, e independência de fornecedores de pagamento externos.

### Princípios Fundamentais
1. **Multi-Moeda Nativo com Unidades Menores (Minor Units):**
   Todos os valores monetários são estritamente armazenados como inteiros na menor unidade fracionária da moeda (ex.: cêntimos para USD/EUR/BRL, e centavos/cêntimos para AOA). Zero perda de precisão com números de ponto flutuante.
2. **Provider Agnostic Registry:**
   A integração com gateways é desacoplada através do `PaymentProviderRegistry` e da interface `PaymentProviderAdapter`. O sistema suporta simultaneamente ambientes de teste determinísticos (`MockPaymentProvider`), operadores globais (`StripePaymentProvider`), e processamento angolano via proxy bancário local (`MulticaixaProxyPaymentProvider`).
3. **Resolução de Preço Exclusivamente no Servidor:**
   O cliente nunca transmite preços, taxas ou parâmetros financeiros mutáveis. O endpoint de checkout recebe apenas `priceId`, validando a versão do preço no catálogo e gerando sessões com expiração mandatória de 30 minutos.
4. **Livro-Razão Financeiro de Partidas Dobradas (Double-Entry Ledger):**
   Diferente do livro de uso operacional (`usage_ledger`), os eventos monetários (faturação, recebimento, estorno) são escriturados em `financial_ledger_entries` onde a soma dos débitos é estritamente igual à soma dos créditos ($\sum \text{Debits} == \sum \text{Credits}$).
5. **FinOps e Proteção de Margem Bruta:**
   Cada consumo de STT (Deepgram/Whisper) e LLM (Gemini/Claude/OpenAI) é registado em `ai_provider_requests`, permitindo a reconciliação do custo direto por reunião e organização e alertando quando a margem bruta fica abaixo de 60%.

---

## 2. Catálogo Comercial e Planos

O catálogo comercial organiza-se em 5 escalões progressivos:

| Plano | Minutos Incluídos | Membros | Armazenamento | Transcrição / LLM | SLA / Suporte | Preço Base Mensal (USD) | Preço Base Mensal (AOA) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Free** | 45 min/mês | 1 utilizador | 500 MB (30 dias) | Whisper Open Source / Base | Comunitário | Grátis ($0) | Grátis (0 Kz) |
| **Starter** | 180 min/mês | Até 3 utilizadores | 5 GB (180 dias) | Deepgram Nova-2 / Fast LLM | Suporte Email 48h | $19.00 / mês | 16.000 Kz / mês |
| **Pro** | 600 min/mês | Até 10 utilizadores | 25 GB (365 dias) | Deepgram Nova-2 + Whisper / Advanced | Prioritário 24h | $49.00 / mês | 42.000 Kz / mês |
| **Business** | 2.500 min/mês | Até 50 utilizadores | 100 GB (Ilimitado) | Multi-provedor + Fine-tuned | Dedicado 8h | $179.00 / mês | 150.000 Kz / mês |
| **Enterprise** | 10.000+ min | Ilimitado | Personalizado (S3/GCS Dedicado) | Modelos dedicados / On-premise | Suporte 24/7 + SLA 99.9% | Sob Consulta ($599+) | Sob Consulta (500.000+ Kz) |

### Versionamento de Preços (`plan_prices`)
Os preços são desacoplados dos planos lógicos:
```sql
CREATE TABLE public.plan_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    currency VARCHAR(3) NOT NULL, -- AOA, USD, EUR, BRL
    billing_interval VARCHAR(20) NOT NULL, -- monthly, annual
    amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    version INTEGER NOT NULL DEFAULT 1,
    external_price_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (plan_id, currency, billing_interval, version)
);
```

---

## 3. Arquitetura de Componentes e Módulos

```
src/modules/billing/
├── types.ts                     # Modelos de domínio, interfaces e DTOs
├── currency-service.ts          # Conversão, formatação e minor units
├── catalog-service.ts           # Planos, preços versionados e quotas
├── checkout-service.ts          # Resolução de preços e sessões de checkout
├── subscription-service.ts      # Máquina de estados de subscrições
├── webhook-service.ts           # Ingestão e idempotência de webhooks
├── financial-ledger-service.ts  # Livro-razão financeiro de partidas dobradas
├── quota-service.ts             # Reservas atómicas de minutos e controlo de consumo
├── ai-cost-service.ts           # FinOps, telemetria de STT/LLM e margens brutas
├── invoice-service.ts           # Faturação sequencial e recibos proforma
├── refund-service.ts            # Estornos e reversões compensatórias
├── admin-service.ts             # Métricas centrais e intervenções justificadas
├── providers/
│   ├── registry.ts              # Registo central de adaptadores
│   ├── mock-provider.ts         # Adaptador simulado para testes
│   ├── stripe-provider.ts       # Adaptador Stripe com restrições geográficas
│   └── multicaixa-provider.ts   # Adaptador de pagamentos EMIS/Multicaixa Express
└── index.ts                     # Barrel de exportação do módulo
```

---

## 4. Segurança Multi-Tenant e Governação

1. **Separação por RLS no PostgreSQL:**
   Todas as novas tabelas (`checkout_sessions`, `invoices`, `invoice_lines`, `financial_ledger_entries`, `refunds`, `organization_quota_reserves`, `platform_admins`) têm `ROW LEVEL SECURITY` ativado com políticas baseadas em `current_setting('app.current_org_id')` ou no perfil de membro autenticado.
2. **Gatilhos Anti-Adulteração (Append-Only):**
   - As tabelas `financial_ledger_entries` e `payment_events` possuem gatilhos de base de dados que impedem explicitamente `UPDATE` e `DELETE`.
3. **RBAC Integrado:**
   - Adicionado papel `billing_manager` ao nível da organização para gerir cartões, faturas e planos sem direitos de eliminação de dados.
   - Criados papéis de plataforma em `platform_admins`: `super_admin`, `billing_admin` e `support_admin`.
