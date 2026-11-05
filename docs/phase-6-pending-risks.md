# Registo de Riscos Pendentes e Limitações Regulamentares (Fase 6)

## 1. Visão Geral

O desenvolvimento da Fase 6 estabeleceu a infraestrutura de pagamentos, monetização e contabilidade. Contudo, a transição para operação comercial em produção exige o acompanhamento formal dos seguintes riscos técnicos, bancários e regulamentares.

---

## 2. Matriz de Riscos Identificados

| Risco / Limitação | Categoria | Gravidade | Mitigação Atual na Fase 6 | Ação Futura Necessária (Produção) |
| :--- | :--- | :--- | :--- | :--- |
| **Não Suporte do Stripe a Contas Bancárias Angolanas** | Financeira / Bancária | Alta | Arquitetura desacoplada com `MulticaixaProxyPaymentProvider` para moeda AOA. | Contratação de gateway credenciado EMIS / BAI Directo ou constituição de entidade corporativa internacional para o Stripe. |
| **Conformidade Fiscal de Faturas (AGT / AT)** | Jurídica / Fiscal | Média | Recibos e faturas internas emitidas com numeração sequencial e aviso expresso de recibo proforma sem efeito fiscal homologado. | Integração de software de faturação certificado pela AGT (Angola) e AT (Portugal) via API. |
| **Volatilidade Cambial (AOA vs USD/EUR)** | Económica | Média | Preços desacoplados em `plan_prices` versionados por moeda independente, sem conversão flutuante em tempo de checkout. | Atualização periódica dos preços em AOA pelo administrador no painel `/admin/plans` conforme diretrizes do BNA. |
| **Explosão de Custos de LLM por Abuso** | FinOps / Operacional | Média | Teto mensal fixo de minutos de áudio com reservas atómicas em `quota_reserves` e monitorização de margem bruta em `AiCostService`. | Implementar limitação de taxa (*rate limiting*) por utilizador em caso de reprocessamentos repetitivos da mesma reunião. |
| **Expiração de Referências Multicaixa** | UX / Operacional | Baixa | Referências geradas com prazo de validade configurável (48 horas). Faturas não liquidadas são canceladas sem afetar o livro-razão. | Envio de lembrete por SMS ou notificação push para o utilizador antes da expiração da referência. |

---

## 3. Diretiva de Transparência e Simulação

Conforme as diretrizes deontológicas do projeto:
- O ambiente atual está configurado em modo Sandbox/Simulação determinística.
- Nenhuma cobrança real em cartões bancários foi disparada durante os testes.
- Toda e qualquer transição para processamento financeiro com dinheiro real requer aprovação explícita e homologação das credenciais bancárias oficiais.
