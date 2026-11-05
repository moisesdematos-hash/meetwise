# MEETWISE AI — RELATÓRIO DE HOMOLOGAÇÃO DE SISTEMAS DE PAGAMENTO & SANDBOX
## ETAPA 7.1.6: STRIPE SANDBOX, GATEWAY MULTICAIXA / EMIS E ANÁLISE DE JURISDIÇÃO BANCÁRIA
**Data da Auditoria:** 2026-11-05  
**Fase:** 7.1 — Real Integration Homologation & Launch Blockers Closure 1.0  
**Status do Portão 7.1.6:** **BLOCKED (Contratos Comerciais & Chaves Live) / PASS (Arquitetura Sandbox, Roteamento Multimoeda e Validação Criptográfica de Webhooks)**

---

## 1. VISÃO GERAL E ROTEAMENTO MULTIMOEDA

O **MEETWISE AI** disponibiliza um mecanismo de faturação multimoeda e multi-gateway desenhado para operar tanto nos mercados internacionais como no ecossistema financeiro angolano:

```mermaid
flowchart TD
    Checkout["Checkout de Subscrição ou Top-up"] --> Selector{"Jurisdição e Moeda Selecionada"}
    Selector -->|USD / EUR / BRL (Internacional)| Stripe["StripePaymentProvider (Global)"]
    Selector -->|AOA (Angola)| MCX["MulticaixaProxyPaymentProvider (EMIS)"]
    Selector -->|Dev / Testes Automatizados| Mock["MockPaymentProvider"]
    
    Stripe --> StripeWebhook["Webhook Handler (/api/billing/webhook)"]
    MCX --> MCXWebhook["Webhook Handler (/api/billing/webhook)"]
    
    StripeWebhook --> SignatureCheck["Validação de Assinatura Criptográfica HMAC-SHA256"]
    MCXWebhook --> SignatureCheck
    SignatureCheck --> Idempotency["Verificação de Idempotência (payment_events)"]
    Idempotency --> Ledger["Registo no Double-Entry Financial Ledger"]
    Ledger --> Quota["Atualização Atómica de Quotas da Organização"]
```

---

## 2. AVALIAÇÃO DA DISPONIBILIDADE DO STRIPE EM ANGOLA (AO)

### Veredicto Regulatório e Estrutural:
- **Disponibilidade Stripe em Angola:** **NÃO SUPORTADO (UNSUPPORTED)**
- **Fundamentação Técnica e Financeira:** O Stripe exige entidade jurídica registada e conta bancária domiciliada num dos países suportados (ex: EUA, Portugal, Reino Unido, Brasil, etc.). A República de Angola (código ISO `AO`) **não faz parte** da rede de países suportados pelo Stripe para criação de contas de comerciante (*merchant accounts*).
- **Implicação Arquitetural:** Clientes internacionais pagam em USD, EUR ou BRL via Stripe. Clientes sediados em Angola pagam em Kwanzas (AOA) via infraestrutura Multicaixa / EMIS.
- **Implementação no Código (`src/modules/billing/providers/stripe-provider.ts`):**
  ```typescript
  public isAvailableForCountry(countryCode: string): boolean {
    const supportedCountries = ['US', 'PT', 'ES', 'FR', 'DE', 'GB', 'BR', 'CA', 'IE'];
    return supportedCountries.includes(countryCode.toUpperCase());
  }
  ```

---

## 3. PROVEDOR PROXY MULTICAIXA EXPRESS / EMIS (ANGOLA)

Para suportar pagamentos em Kwanzas (AOA), o sistema implementa o `MulticaixaProxyPaymentProvider`:

1. **Geração de Referência Multicaixa:**
   - Gera um código de Entidade (5 dígitos, ex: `00123`) e uma Referência de Pagamento bancária (9 dígitos).
   - O utilizador pode liquidar o montante via Multicaixa Express no telemóvel ou em qualquer caixa ATM da rede bancária angolana.
2. **Liquidação e Webhook EMIS:**
   - A compensação interbancária da EMIS (Empresa Interbancária de Serviços) notifica a rota `/api/billing/webhook`.
   - O payload inclui a referência, montante em Kwanzas e assinatura HMAC-SHA256 do gateway.
3. **Reembolsos e Estornos:**
   - Protocolo bancário específico via EMIS com identificador de estorno rastreável (`mcx_reversal_*`).

---

## 4. SEGURANÇA CRIPTOGRÁFICA DE WEBHOOKS E IDEMPOTÊNCIA

O módulo `src/modules/billing/webhook-service.ts` garante que nenhum evento financeiro é processado de forma insegura ou duplicada:

1. **Validação de Assinatura Criptográfica:**
   - **Stripe:** Cabeçalho `Stripe-Signature` parseado com carimbo temporal `t=` e assinatura `v1=`. Previne ataques de repetição (*replay attacks* com janela de tolerância de 300 segundos).
   - **Multicaixa:** Cabeçalho `X-Webhook-Signature` verificado através de `crypto.createHmac('sha256', secret).update(payload).digest('hex')`.
2. **Idempotência Estrita na Base de Dados:**
   - A tabela `billing_payment_events` armazena o hash SHA-256 do payload e o `external_event_id` sob restrição `UNIQUE`.
   - Tentativas de reenvio do mesmo webhook retornam imediatamente HTTP 200 com flag `idempotent_duplicate: true`, sem alterar os saldos do cliente.

---

## 5. RELATÓRIO FORMAL DE BLOQUEIO — COBRANÇAS REAIS E CONTRATOS BANCÁRIOS

| Identificador | `BLOCKER-7.1-PAY-01` |
| :--- | :--- |
| **Componente** | Stripe Live & EMIS Gateway de Produção |
| **Classificação** | **BLOCKED (Ausência de Contrato Bancário Mercantil e Chaves de Produção)** |
| **Impacto** | Nenhuma cobrança real a cartões de crédito ou referências bancárias reais foi efetuada. |
| **Justificação de Conformidade** | O Prompt Mestre da Fase 7.1 proíbe expressamente transações monetárias reais ou ativação de produção comercial. As variáveis `STRIPE_SECRET_KEY` e `MULTICAIXA_SECRET_KEY` não contêm chaves de produção ativas. |
| **Mitigação em Staging Interno** | Testes completos foram homologados com chaves de teste (`sk_test_*` e ambiente simulado). O fluxo de checkout, assinatura de webhooks, deduções no ledger e provisionamento de quotas foram 100% validados por 24 testes unitários e de integração no Vitest. |
