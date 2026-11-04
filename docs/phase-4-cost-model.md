# MODELO DE CUSTOS E GESTÃO DE QUOTAS DE IA — FASE 4
## Consumo de Tokens, Reserva no Ledger, Preços e Margem de Contribuição

**Versão:** 4.0  
**Data:** 04 de Novembro de 2026  
**Documento Técnico:** `docs/phase-4-cost-model.md`

---

## 1. INTRODUÇÃO

A viabilidade financeira do MEETWISE AI exige previsibilidade absoluta nos custos variáveis de inferência de IA. O sistema combina estimativas preliminares com reserva e liquidação idempotente na tabela `usage_ledger`.

---

## 2. MODELO DE CONSUMO DE TOKENS POR REUNIÃO

Uma reunião típica de 45 minutos gera cerca de 6.000 a 7.500 palavras de diálogo transcrito, correspondendo aproximadamente a 9.000 a 11.000 tokens de entrada:

| Componente | Tokens de Entrada Médios | Tokens de Saída Médios | Total Tokens / Reunião |
| :--- | :--- | :--- | :--- |
| **Resumo em 3 Camadas** | ~10.000 | ~1.200 | ~11.200 |
| **Ata Estruturada Completa** | ~10.000 | ~1.800 | ~11.800 |
| **Decisões & Tarefas** | ~10.000 | ~800 | ~10.800 |
| **Execução Integrada Única (Fase 4 Pipeline)** | **~10.000** | **~2.200** | **~12.200** |

*Nota:* O MEETWISE AI utiliza uma pipeline de geração consolidada num único prompt estruturado, reduzindo o custo de contexto em mais de 60% comparativamente a chamadas fragmentadas.

---

## 3. CUSTO DE INFERÊNCIA POR REUNIÃO POR FORNECEDOR

| Fornecedor / Modelo | Custo de Entrada | Custo de Saída | Custo Total por Reunião (45 min) |
| :--- | :--- | :--- | :--- |
| **Google Gemini 2.0 Flash** (Recomendado) | 10k tokens $\times$ \$0.10/M = \$0.0010 | 2.2k tokens $\times$ \$0.40/M = \$0.0009 | **\$0.0019** (~0.2 cêntimos de dólar) |
| **OpenAI GPT-4o** | 10k tokens $\times$ \$2.50/M = \$0.0250 | 2.2k tokens $\times$ \$10.00/M = \$0.0220 | **\$0.0470** (~4.7 cêntimos de dólar) |
| **Anthropic Claude 3.5 Sonnet** | 10k tokens $\times$ \$3.00/M = \$0.0300 | 2.2k tokens $\times$ \$15.00/M = \$0.0330 | **\$0.0630** (~6.3 cêntimos de dólar) |

---

## 4. CICLO DE RESERVA E LIQUIDAÇÃO NO `usage_ledger`

1. **Estimativa e Reserva Prévia:**
   Antes de disparar a inferência, o `MeetingAnalysisService` estima os tokens necessários (`charCount / 3.5`) e cria um registo no `usage_ledger` com `status = 'pending'`.
2. **Execução:**
   O LLM processa a reunião.
3. **Liquidação e Confirmação:**
   Após a validação de evidência, a entrada do ledger é atualizada para `status = 'confirmed'`, debitando a contagem real de tokens e o custo final em cêntimos de dólar.
4. **Tratamento de Falha:**
   Se a API falhar, a reserva é marcada como `failed`, evitando debitar o saldo do cliente.

---

## 5. MARGEM DE CONTRIBUIÇÃO E ESCALABILIDADE

Considerando o plano **Pro (\$29/mês)** com 10 reuniões mensais de 45 minutos (450 minutos incluídos):
- Custo de ASR (Deepgram Nova-3): 450 min $\times$ \$0.0043/min = \$1.94
- Custo de Inteligência IA (Gemini 2.0 Flash): 10 reuniões $\times$ \$0.0019 = \$0.019
- Custo de Infraestrutura Supabase e Cloudflare: ~\$0.50 / utilizador
- **Custo Variável Total por Utilizador Pro:** **~\$2.46 / mês**
- **Receita Líquida:** \$29.00 - \$1.14 (Stripe) = \$27.86
- **Margem Bruta Unitária:** **~91.2%**
