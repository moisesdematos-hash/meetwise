# Livro-Razão Financeiro de Partidas Dobradas (Fase 6)

## 1. Visão Geral e Princípio Contábil

No desenvolvimento do **MEETWISE AI**, separou-se formalmente o livro de uso operacional (`usage_ledger` - minutos de áudio consumidos, contagem de tokens de IA) do livro-razão financeiro (`financial_ledger_entries`).

O subsistema financeiro adota o método de partidas dobradas (*double-entry bookkeeping*), onde toda a transação financeira é registada através de pelo menos dois lançamentos de montante idêntico: um a débito e outro a crédito.

$$\sum \text{Débitos} \equiv \sum \text{Créditos}$$

Qualquer transação em que a soma dos débitos difira da soma dos créditos é rejeitada a nível de serviço e dispara o erro `LEDGER_UNBALANCED`.

---

## 2. Plano de Contas Suportado

O plano de contas do sistema inclui as seguintes contas fundamentais:

| Código da Conta | Nome da Conta | Natureza | Descrição / Uso |
| :--- | :--- | :--- | :--- |
| `accounts_receivable` | Clientes / Contas a Receber | Ativo | Valores faturados a aguardar cobrança ou liquidação do gateway. |
| `cash` / `clearing` | Caixa / Conta de Compensação | Ativo | Fundos efetivamente liquidados e recebidos no gateway bancário. |
| `subscription_revenue` | Receita de Subscrições | Rendimento | Reconhecimento de receita de vendas de planos e quotas. |
| `refund_expense` | Reversões e Estornos | Custo / Redutora | Despesa com estornos e devoluções voluntárias ou judiciais a clientes. |

---

## 3. Esquema da Tabela `financial_ledger_entries`

```sql
CREATE TABLE public.financial_ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    account_name VARCHAR(100) NOT NULL,
    entry_type VARCHAR(10) NOT NULL CHECK (entry_type IN ('debit', 'credit')),
    amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units > 0),
    currency VARCHAR(3) NOT NULL,
    description TEXT,
    reference_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Gatilho de Imutabilidade Estrita
CREATE TRIGGER trigger_financial_ledger_no_update_delete
BEFORE UPDATE OR DELETE ON public.financial_ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_ledger_tampering();
```

---

## 4. Exemplos de Mapeamento Contábil

### A. Faturação e Cobrança de Subscrição com Sucesso ($49.00 USD)
1. **Cobrança Liquidada pelo Gateway:**
   - **Débito (`debit`):** Conta `cash` $\to 4.900$ cêntimos ($49.00 USD)
   - **Crédito (`credit`):** Conta `subscription_revenue` $\to 4.900$ cêntimos ($49.00 USD)
   - **Balanço:** $4900 - 4900 = 0$ (Equilibrado)

### B. Emissão de Fatura Pendente
1. **Reconhecimento da Dívida Comercial:**
   - **Débito (`debit`):** Conta `accounts_receivable` $\to 42.000$ cêntimos (42.000 AOA)
   - **Crédito (`credit`):** Conta `subscription_revenue` $\to 42.000$ cêntimos (42.000 AOA)
2. **Liquidação Posterior via Multicaixa Express:**
   - **Débito (`debit`):** Conta `cash` $\to 42.000$ cêntimos
   - **Crédito (`credit`):** Conta `accounts_receivable` $\to 42.000$ cêntimos

### C. Estorno / Reembolso Total ($49.00 USD)
1. **Lançamento Compensatório:**
   - **Débito (`debit`):** Conta `refund_expense` $\to 4.900$ cêntimos ($49.00 USD)
   - **Crédito (`credit`):** Conta `cash` $\to 4.900$ cêntimos ($49.00 USD)
   - **Balanço:** $4900 - 4900 = 0$ (Equilibrado)

O livro é estritamente *append-only*. Nenhuma entrada é alterada ou removida; erros ou estornos são obrigatoriamente tratados por lançamentos de compensação ou contrapartida.
