# Integração de Fornecedores de Pagamento (Fase 6)

## 1. Visão Geral e Arquitetura Agnóstica

O subsistema de pagamentos do **MEETWISE AI** utiliza o padrão *Strategy/Adapter* através da interface `PaymentProviderAdapter` e do registo `PaymentProviderRegistry` (`src/modules/billing/providers/`).

Nenhuma lógica de negócio de subscrição, faturação ou quota depende diretamente do SDK de um fornecedor específico. Toda a orquestração comunica com a interface padronizada:

```typescript
export interface PaymentProviderAdapter {
  readonly providerId: PaymentProvider;
  createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSessionResult>;
  handleWebhook(rawBody: string, signature: string): Promise<WebhookEventResult>;
  cancelSubscription(externalSubscriptionId: string): Promise<void>;
  createCustomer(params: CreateCustomerParams): Promise<string>;
}
```

---

## 2. Análise e Matriz de Adaptadores

### A. `MockPaymentProvider` (Sandbox & Testes Automatizados)
- **Objetivo:** Fornecer um ambiente 100% determinístico e independente de redes externas para suites de teste unitários, testes de integração e desenvolvimento local.
- **Capacidades:**
  - Gera sessões de checkout com URLs simuladas (`https://meetwise.mock/checkout/...`).
  - Suporta todas as moedas (`AOA`, `USD`, `EUR`, `BRL`).
  - Assinaturas HMAC SHA-256 geradas deterministicamente para testes de webhook.
  - Simulação de erros específicos (ex.: cartões recusados, assinaturas adulteradas, timeouts).

### B. `StripePaymentProvider` (Processamento Internacional)
- **Objetivo:** Processamento de pagamentos globais por cartão de crédito/débito, Apple Pay e Google Pay para mercados elegíveis.
- **Avaliação de Suporte Geográfico (Angola):**
  - **Limitação Crítica Identificada:** O Stripe não suporta contas de comerciante nem liquidação bancária direta em contas sediadas em Angola (Kwanza/AOA). Apenas empresas legalmente constituídas com contas bancárias em jurisdições suportadas pelo Stripe (ex.: EUA, UE, Reino Unido) podem emitir cobranças diretas via Stripe.
  - **Suporte Multi-Moeda:** O Stripe permite cobrança ao consumidor final em USD, EUR e BRL. As conversões para AOA são tratadas a nível bancário pelo emissor do cartão do cliente quando aplicável.
  - **Fluxo Webhook:** Verificação estrita de assinatura via `stripe-signature` com segredo partilhado `STRIPE_WEBHOOK_SECRET`.

### C. `MulticaixaProxyPaymentProvider` (Mercado Angolano)
- **Objetivo:** Integração nativa com a rede interbancária de Angola gerida pela EMIS (Empresa Interbancária de Serviços), suportando **Multicaixa Express**, **Pagamento por Referência Multicaixa**, **GPO (Gateway de Pagamentos Online)** e **BAI Directo**.
- **Mecanismo Operacional:**
  - Gera referências bancárias de 9 dígitos associadas à Entidade de Pagamento designada.
  - Permite pagamento por telemóvel via Multicaixa Express (notificação push no terminal móvel do utilizador).
  - Webhooks assinados via HMAC SHA-256 com timestamping anti-replay para confirmação de liquidação interbancária em Kwanza (AOA).
  - Em conformidade com as diretrizes do Banco Nacional de Angola (BNA).

---

## 3. Gestão e Resolução Dinâmica de Adaptadores

O `PaymentProviderRegistry` seleciona automaticamente o fornecedor apropriado com base na moeda selecionada e na configuração do ambiente:

```typescript
const provider = PaymentProviderRegistry.getProvider(
  currency === 'AOA' ? 'multicaixa_proxy' : 'stripe'
);
```

Em ambiente de testes ou quando `PAYMENT_MOCK_ENABLED=true`, todas as operações revertem para o `MockPaymentProvider`, prevenindo chamadas de rede ou custos acidentais.
