# Painel de Administração Central e Governação (Fase 6)

## 1. Visão Geral

O Painel de Administração Central do **MEETWISE AI** (`/admin/*`) fornece à equipa de operações, finanças e suporte as ferramentas necessárias para monitorizar métricas de negócio, gerir planos, fiscalizar o consumo de quotas e intervir de forma segura e auditável em contas de clientes.

---

## 2. Mapa de Rotas da Consola de Administração

| Rota | Nome do Módulo | Finalidade e Capacidades |
| :--- | :--- | :--- |
| `/admin` | Visão Geral / Dashboard | KPIs globais (MRR, organizações ativas, quotas consumidas, margem média, uptime). |
| `/admin/organizations` | Organizações | Listagem de todos os tenants, pesquisa por NIF/Nome, modal de intervenção administrativa. |
| `/admin/subscriptions` | Subscrições | Monitorização de subscrições ativas, suspensas, canceladas ou em período de carência. |
| `/admin/payments` | Pagamentos & Webhooks | Registo de eventos de gateway (`payment_events`), status de idempotência e re-tentativas. |
| `/admin/usage` | Quotas & Consumo | Monitorização de reservas ativas, quotas mensais e organizações perto do teto. |
| `/admin/costs` | FinOps & Custos de IA | Telemetria de custos de STT/LLM, margem bruta por tenant e alertas de margem baixa (<60%). |
| `/admin/plans` | Matriz do Catálogo | Visualização dos 5 planos e preços versionados por moeda (`AOA`, `USD`, `EUR`, `BRL`). |
| `/admin/audit` | Auditoria & Logs | Histórico central de `public.audit_logs` com filtro de intervenções administrativas. |
| `/admin/system-health` | Saúde do Sistema | Monitor de latência de APIs externas (Deepgram, Gemini, Stripe, Supabase). |

---

## 3. Protocolo Mandatório de Justificação em Intervenções Administrativas

Para proteger a integridade dos dados dos clientes e cumprir os requisitos de auditoria e conformidade regulamentar (RGPD / Lei de Proteção de Dados Pessoais de Angola), **nenhuma alteração administrativa direta** em contas de clientes (ajuste de plano, concessão manual de minutos, suspensão cautelar de organização) pode ser executada sem justificação explícita.

### Regras de Validação:
1. **Comprimento Mínimo:** A justificação deve conter pelo menos **10 caracteres** explicando o motivo e número de ticket de suporte associado (ex.: `"Ticket #4812 - Compensação por instabilidade temporária no processamento"`).
2. **Escrita Inviolável em `public.audit_logs`:** Toda a intervenção gera um registo em `audit_logs` com:
   - Identificador do administrador operador (`actor_id`).
   - Identificador da organização afetada (`organization_id`).
   - Ação executada (`ADMIN_MANUAL_ADJUSTMENT`, `PLAN_OVERRIDE`, etc.).
   - Justificação em texto claro (`justification`).
   - Metadados do estado anterior e posterior.

```typescript
// Validação no AdminService
if (!justification || justification.trim().length < 10) {
  throw new AppError(
    'A justificativa da intervenção administrativa é obrigatória (mínimo de 10 caracteres).',
    'JUSTIFICATION_REQUIRED',
    400
  );
}
```

---

## 4. Estrutura de Papéis Administrativos da Plataforma (`platform_admins`)

Os privilégios administrativos da plataforma são geridos na tabela `public.platform_admins`:

```sql
CREATE TABLE public.platform_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('super_admin', 'billing_admin', 'support_admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id)
);
```

- **`super_admin`:** Acesso total a todas as configurações, catálogo de preços, intervenções e concessões.
- **`billing_admin`:** Gestão de planos, cancelamentos, estornos e ajustes de faturas.
- **`support_admin`:** Visualização de estado de reuniões e assistência ao cliente em modo só de leitura.
