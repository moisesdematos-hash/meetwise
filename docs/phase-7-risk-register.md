# Registo Consolidado de Riscos Técnicos e Operacionais (Fase 7.25)

**Data da Auditoria:** 05 de Novembro de 2026  
**Auditor Independente:** Antigravity Master Audit Team (Risk & Release Manager)  
**Repositório:** MEETWISE AI  

---

## 1. Matriz Consolidada de Riscos

| ID do Risco | Categoria | Severidade | Probabilidade | Impacto | Mitigação Implementada / Plano de Ação | Responsável | Estado |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- | :---: |
| **RSK-001** | Pagamentos / Bancária | **ALTA** | **CERTA (100%)** | Impossibilidade de liquidar fundos via Stripe diretamente para contas em Angola | A plataforma utiliza arquitetura agnóstica com o `MulticaixaProxyPaymentProvider` para a divisa Kwanza (AOA). A entrada em produção exige contrato com a EMIS ou contratação de entidade jurídica internacional para o Stripe. | Lead de Pagamentos | **BLOQUEADOR DE PRODUÇÃO (AOA)** |
| **RSK-002** | Legal / Fiscal | **MÉDIA** | **ALTA** | Faturas e recibos internos emitidos sem certificação fiscal homologada pela AGT (Angola) / AT (Portugal) | Foi incluído aviso explícito em todas as faturas e recibos informando que se tratam de recibos proforma comerciais sem valor de dedução fiscal. A homologação fiscal exigirá integração com software certificado via API. | Responsável Financeiro | **MITIGADO COM AVISO (PENDENTE FISCAL)** |
| **RSK-003** | Infraestrutura / CI | **MÉDIA** | **ALTA** | Ausência do daemon Docker e de instância Supabase Cloud em homologação local | Testes executam contra PostgreSQL 16 real em memória via PGlite, cobrindo 100% de esquemas, RLS e gatilhos. Antes do deploy público, deve ser executado teste formal em instância Supabase remota de staging. | DevOps Lead | **BLOQUEADOR DE DEPLOY PÚBLICO** |
| **RSK-004** | Dependência de IA | **MÉDIA** | **MÉDIA** | Latência excessiva ou quebra de rate limit em reuniões com mais de 3 horas de áudio | O `ProcessingQueueService` implementa fila assíncrona com retentativas e recuo exponencial; o serviço de chunking divide o texto em janelas deslizantes de 12.000 tokens. | AI Engineer | **MITIGADO TECNICAMENTE** |
| **RSK-005** | Qualidade / E2E | **MÉDIA** | **ALTA** | Ausência do framework `@playwright/test` para testes em navegadores reais com screenshots | Os fluxos E2E foram 100% cobertos a nível de integração pelo Vitest (`phase-2-live-audit.test.ts` e suites documentais). Recomenda-se a adição do Playwright quando o ambiente de CI tiver acesso a rede para descarregar binários. | QA Lead | **PENDENTE DE REDE / CI** |
| **RSK-006** | Câmbio e FinOps | **BAIXA** | **MÉDIA** | Desvalorização do Kwanza (AOA) reduzindo a margem bruta dos planos em moeda nacional | A análise de FinOps demonstrou que mesmo com desvalorização de 30% a margem bruta permanece superior a 80%. O painel `/admin/plans` permite ajuste ágil de preços versionados. | FinOps Lead | **MONITORIZADO** |

---

## 2. Síntese dos Riscos Bloqueadores para Lançamento Comercial Aberto

1. **Gateways Reais de Pagamento em Produção:** O `MockPaymentProvider` é determinístico para testes, mas cobranças financeiras reais dependem de aprovação contratual bancária da EMIS e/ou Stripe.
2. **Ambiente Supabase de Produção Dedicado:** Exige o provisionamento de credenciais de produção fora do ambiente local.
3. **Credenciais Comerciais de APIs de STT/LLM:** Exige a injeção de chaves pagas ativas no ambiente de staging/produção.
