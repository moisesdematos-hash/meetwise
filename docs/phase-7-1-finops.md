# MEETWISE AI — RELATÓRIO FINOPS & MODELAGEM ECONÓMICA UNITÁRIA
## ETAPA 7.1.8: ANÁLISE DE CUSTOS REAIS VS ESTIMADOS, SENSIBILIDADE CAMBIAL E TETOS ORÇAMENTAIS
**Data da Auditoria:** 2026-11-05  
**Fase:** 7.1 — Real Integration Homologation & Launch Blockers Closure 1.0  
**Status do Portão 7.1.8:** **PASS (Margens Operacionais Robustas, Proteção Cambial e Circuit Breakers Validados)**

---

## 1. MODELAÇÃO ECONÓMICA UNITÁRIA (UNIT ECONOMICS)

Para garantir a viabilidade comercial do SaaS, os custos operacionais diretos (COGS) por hora de reunião foram avaliados com base nos custos de fornecedores externos de ponta:

| Componente Operacional | Fornecedor Primário | Preço de Tabela | Custo / Reunião 60 min | % do COGS Total |
| :--- | :--- | :--- | :--- | :--- |
| **Transcrição & Diarização ASR** | Deepgram Nova-2 | $0.0043 / min | $0.258 USD | 74.8% |
| **Inferência Analítica LLM** | Google Gemini 1.5 Flash | $0.075 / 1M tokens in | $0.0025 USD | 0.7% |
| **Inferência de Resumo Executivo**| Google Gemini 1.5 Pro | $1.25 / 1M tokens in | $0.0650 USD | 18.8% |
| **Armazenamento de Mídia (S3)** | Supabase Storage / S3 | $0.021 / GB / mês | $0.0031 USD | 0.9% |
| **Geração de Documentos (DOCX/PDF)**| Motor Local Node.js | $0.000 / op | $0.0000 USD | 0.0% |
| **Gateway de Pagamento (Stripe)** | Stripe Global | 2.9% + $0.30 | $0.0163 USD | 4.7% |
| **TOTAL COGS ESTIMADO (60 MIN)**| — | — | **$0.3449 USD** | **100.0%** |

### Margem Bruta Operacional por Plano:
- **Plano Starter ($19 USD / 300 min):** Receita $0.063 / min vs COGS $0.0057 / min $\rightarrow$ **Margem Bruta: 90.9%**
- **Plano Pro ($49 USD / 1000 min):** Receita $0.049 / min vs COGS $0.0057 / min $\rightarrow$ **Margem Bruta: 88.3%**
- **Plano Enterprise ($199 USD / 5000 min):** Receita $0.039 / min vs COGS $0.0057 / min $\rightarrow$ **Margem Bruta: 85.3%**

---

## 2. SENSIBILIDADE CAMBIAL & EXPOSIÇÃO KWANZA (AOA) / DÓLAR (USD)

### Cenário de Risco Cambial em Angola:
A infraestrutura (servidores, modelos de IA e STT) é faturada em dólares norte-americanos (USD), enquanto os clientes em Angola pagam em Kwanzas (AOA).

| Taxa de Câmbio AOA/USD | Preço Plano Pro (AOA) | Equivalente USD Recebido | COGS (1000 min) | Margem Bruta Efetiva |
| :--- | :--- | :--- | :--- | :--- |
| **Base: 1 USD = 920 AOA** | 45.080 AOA | $49.00 USD | $5.75 USD | 88.3% |
| **Depreciação 20%: 1 USD = 1.104 AOA** | 45.080 AOA | $40.83 USD | $5.75 USD | 85.9% |
| **Depreciação 50%: 1 USD = 1.380 AOA** | 45.080 AOA | $32.66 USD | $5.75 USD | 82.4% |
| **Cenário Extremo: 1 USD = 1.840 AOA** | 45.080 AOA | $24.50 USD | $5.75 USD | 76.5% |

### Mecanismo de Proteção Implementado:
O serviço `src/modules/billing/currency-service.ts` incorpora uma taxa de conversão dinâmica (`exchange_rates`) atualizável por administradores ou via cron job bancário, permitindo calibrar o preçário em AOA para proteger o limiar mínimo de 75% de margem operacional.

---

## 3. CIRCUIT BREAKERS, RATE LIMITS & TETOS ORÇAMENTAIS

Para prevenir faturas catastróficas por ataques de abuso ou loops infinitos de transcrição:

1. **Limite Diário por Organização:** Nenhuma organização pode consumir mais de 150% da sua cota contratada num período de 24 horas sem autorização administrativa.
2. **Hard Ceiling por Requisição:** Uploads de áudio são limitados a 4 horas contínuas (tamanho máximo 500 MB).
3. **Alertas FinOps Automáticos:** Quando os custos de API da plataforma atingem 80% do teto mensal provisionado no dashboard de custos (`/admin/costs`), o sistema emite alertas de prioridade alta no canal de auditoria.
