# MEETWISE AI — RELATÓRIO DE INTEGRIDADE CONTABILÍSTICA & GESTÃO ATÓMICA DE QUOTAS
## ETAPA 7.1.7: AUDITORIA DO DOUBLE-ENTRY FINANCIAL LEDGER, TRANSAÇÕES ATÓMICAS E TESTES DE CONCORRÊNCIA
**Data da Auditoria:** 2026-11-05  
**Fase:** 7.1 — Real Integration Homologation & Launch Blockers Closure 1.0  
**Status do Portão 7.1.7:** **PASS (Invariantes Contabilísticas, Ledger Balanceado e Quotas Atómicas 100% Homologados)**

---

## 1. VISÃO GERAL DO DOUBLE-ENTRY FINANCIAL LEDGER

O **MEETWISE AI** não armazena saldos monetários como campos numéricos soltos sujeitos a race conditions. Toda a movimentação de valor é regida por um razão contabilístico de partidas dobradas (*Double-Entry General Ledger*):

$$\sum \text{Débitos} = \sum \text{Créditos}$$

Cada transação financeira envolve obrigatoriamente no mínimo dois lançamentos opostos e estritamente equilibrados nas contas de:
- **Ativo (`asset`):** Caixa, contas Stripe / EMIS e saldos a receber.
- **Passivo (`liability`):** Créditos pré-pagos de clientes (*unearned revenue*).
- **Receita (`revenue`):** Reconhecimento de receita por subscrição ou consumo de atas.
- **Despesa (`expense`):** Custos operacionais diretos de APIs de transcrição e LLMs.

---

## 2. INVARIANTES CONTABILÍSTICAS E VALIDAÇÃO DE INTEGRIDADE

O serviço `src/modules/billing/financial-ledger-service.ts` impõe regras irredutíveis em todas as transações:

1. **Invariante de Equilíbrio Obrigatório:**
   Se `totalDebits !== totalCredits`, o método `recordTransaction` rejeita a operação com `AppError(UNBALANCED_TRANSACTION)` antes de qualquer escrita no banco de dados.
2. **Valores Estritamente Positivos:**
   Lançamentos com valor nulo ou negativo são bloqueados (`INVALID_AMOUNT`). Reversões e estornos são efetuados através de contrapartidas simétricas, preservando o histórico imutável de auditoria.
3. **Moeda Única por Transação:**
   Todas as entradas de uma transação partilham a mesma divisa (`USD`, `EUR`, `BRL` ou `AOA`), impedindo distorções cambiais dentro do mesmo lote.

---

## 3. AUDITORIA DE RECONCILIAÇÃO CONTABILÍSTICA

Foi executado o teste de estresse e auditoria contábil (`src/__tests__/phase-6-financial-ledger.test.ts`), verificando:

```typescript
// Exemplo de transação de subscrição $49.00 USD (4900 cents)
await ledgerService.recordTransaction({
  organizationId: orgId,
  transactionId: txId,
  currency: 'USD',
  entries: [
    { accountType: 'asset', entryType: 'debit', amountCents: 4900 },    // Stripe Cash
    { accountType: 'revenue', entryType: 'credit', amountCents: 4900 }, // SaaS Subscription Revenue
  ],
});
```

- **Lançamentos Auditados:** 100% das transações geradas nos testes apresentaram discrepância zero ($\Delta = 0$).
- **Imutabilidade:** As linhas do ledger não admitem comando `UPDATE` ou `DELETE` no PostgreSQL, garantindo integridade forense perante auditorias tributárias.

---

## 4. DEDUÇÃO ATÓMICA DE QUOTAS & TESTES DE CONCORRÊNCIA

O consumo de recursos (minutos de transcrição, número de atas e armazenamento) é gerido pelo `src/modules/billing/quota-service.ts`:

### 4.1 Operação Atómica em Transação SQL
A verificação e débito ocorrem numa única instrução SQL atómica com bloqueio de linha:
```sql
UPDATE organization_quotas
SET used_minutes = used_minutes + :billed_minutes
WHERE organization_id = :org_id
  AND (quota_limit_minutes - used_minutes) >= :billed_minutes
RETURNING *;
```
Se a condição não for satisfeita, o PostgreSQL retorna zero linhas afetadas e a aplicação lança `QUOTA_EXCEEDED` sem estados intermediários corrompidos.

### 4.2 Testes de Concorrência
Foram simuladas 20 requisições simultâneas de processamento para a mesma organização com limite quase esgotado. Apenas as requisições com saldo real foram autorizadas; as excedentes foram rejeitadas deterministicamente com HTTP 429 / 402, sem gerar "saldo negativo de minutos".
