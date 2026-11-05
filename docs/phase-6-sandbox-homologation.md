# Homologação em Ambiente Sandbox e Testes de Integração (Fase 6)

## 1. Visão Geral

Para certificar que o motor financeiro e de pagamentos do **MEETWISE AI** opera com total fiabilidade antes da conexão a contas bancárias e gateways de produção, foi desenvolvido um conjunto rigoroso de cenários de homologação em ambiente isolado (*sandbox*).

A homologação utiliza o `MockPaymentProvider` e adaptadores de teste acoplados aos endpoints de API e à base de dados PostgreSQL (PGlite).

---

## 2. Cenários de Homologação Homologados

### Cenário 1: Checkout de Novo Plano Pro (USD 49.00 / mês)
- **Ação:** Criação de sessão de checkout para `price-pro-monthly-usd`.
- **Validação de Preço:** O sistema ignorou qualquer parâmetro de valor e resolveu $49.00 ($4,900 cêntimos) diretamente da tabela `plan_prices`.
- **Expiração:** Sessão criada com validade de exatamente 30 minutos.
- **Resultado:** APROVADO.

### Cenário 2: Ingestão de Webhook com Assinatura Válida vs Adulterada
- **Ação:** Envio de payload assinado via HMAC SHA-256 com segredo de teste.
- **Caso Positivo:** Assinatura íntegra gerou inserção em `payment_events`, atualização da subscrição para `active` e emissão do evento no livro-razão.
- **Caso Negativo (Adulteração de 1 caractere no payload):** Rejeição imediata com código HTTP 400 (`INVALID_SIGNATURE`), sem escrita no livro-razão ou alteração de subscrição.
- **Resultado:** APROVADO.

### Cenário 3: Resiliência contra Ataques de Repetição (Idempotência)
- **Ação:** Envio do mesmo payload com o mesmo `provider_event_id` por três vezes consecutivas (simulando retentativas de rede do gateway).
- **Comportamento:** O primeiro envio processou com sucesso. O segundo e terceiro envios identificaram a chave duplicada em `payment_events` e retornaram `200 OK` instantaneamente sem re-creditar quotas ou gerar novos lançamentos contábeis.
- **Resultado:** APROVADO.

### Cenário 4: Geração de Referência Multicaixa Express (AOA 42.000)
- **Ação:** Requisição de checkout selecionando a moeda AOA.
- **Comportamento do Adaptador Multicaixa:**
  - Gerou Entidade de Pagamento designada e Referência de 9 dígitos formatada (`123 456 789`).
  - Associou a referência ao identificador interno da fatura em `public.invoices`.
- **Resultado:** APROVADO.

### Cenário 5: Transições de Subscrição e Carência (*Grace Period*)
- **Ação:** Simulação de webhook `invoice.payment_failed`.
- **Comportamento:**
  - Subscrição transitou de `active` para `past_due` e `grace_period`.
  - Quotas históricas permaneceram com acesso de leitura, mas reservas para novos processamentos foram bloqueadas ao esgotar o teto.
  - Subsequente envio de `payment_intent.succeeded` regularizou o estado para `active`.
- **Resultado:** APROVADO.

### Cenário 6: Estorno Parcial e Integral com Partidas Dobradas
- **Ação:** Solicitação de reembolso via `RefundService`.
- **Comportamento:**
  - Validação de saldo prévio na fatura.
  - Emissão de lançamento compensatório no livro-razão: Débito em `refund_expense` e Crédito em `cash`.
  - Invariante $\sum \text{Débitos} == \sum \text{Créditos}$ estritamente preservado.
- **Resultado:** APROVADO.
