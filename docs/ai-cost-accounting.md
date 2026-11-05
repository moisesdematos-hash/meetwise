# Contabilidade de Custos de IA e FinOps (Fase 6)

## 1. Visão Geral e Importância Estratégica

Em plataformas SaaS baseadas em Inteligência Artificial, o processamento de áudio (ASR/STT) e a inferência de modelos de linguagem de grande porte (LLMs) representam os maiores custos operacionais variáveis (*Cost of Goods Sold* - COGS).

Sem uma contabilidade rigorosa de custos por pedido, uma organização em plano fixo pode consumir chamadas excessivas e gerar prejuízo financeiro. O subsistema `AiCostService` (`src/modules/billing/ai-cost-service.ts`) foi concebido para monitorizar o custo direto de cada chamada, associá-lo à organização e calcular a margem bruta real em tempo real.

---

## 2. Telemetria de Chamadas em `ai_provider_requests`

Cada interação com fornecedores externos (Deepgram, OpenAI Whisper, Google Gemini, Anthropic Claude) gera um registo em `public.ai_provider_requests`:

```sql
CREATE TABLE public.ai_provider_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    meeting_id UUID REFERENCES public.meetings(id) ON DELETE SET NULL,
    provider VARCHAR(50) NOT NULL, -- deepgram, openai, gemini, anthropic
    model VARCHAR(100) NOT NULL, -- nova-2, whisper-large-v3, gemini-1.5-pro, etc.
    operation VARCHAR(50) NOT NULL, -- transcription, diarization, summarization, action_items
    audio_duration_seconds INTEGER,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 3. Matriz de Custos Diretos de Fornecedores

| Fornecedor / Modelo | Operação | Unidade de Cobrança | Custo Unitário Direto (USD) |
| :--- | :--- | :--- | :--- |
| **Deepgram Nova-2** | Transcrição Geral | Por Minuto de Áudio | $0.0043 / min |
| **Deepgram Nova-2 + Diarization** | Transcrição com Oradores | Por Minuto de Áudio | $0.0059 / min |
| **OpenAI Whisper (Hosted)** | Transcrição Fallback | Por Minuto de Áudio | $0.0060 / min |
| **Gemini 1.5 Flash** | Sumários Rápidos & Tarefas | Por 1M Tokens (Entrada / Saída) | $0.075 / 1M input — $0.30 / 1M output |
| **Gemini 1.5 Pro** | Atas Estruturadas Complexas | Por 1M Tokens (Entrada / Saída) | $1.25 / 1M input — $5.00 / 1M output |
| **Claude 3.5 Sonnet** | Revisão Formal e Decisões Críticas | Por 1M Tokens (Entrada / Saída) | $3.00 / 1M input — $15.00 / 1M output |

---

## 4. Algoritmo de Cálculo de Margem Bruta e Alertas

Para cada organização e globalmente na plataforma, o `AiCostService` computa a margem bruta da seguinte forma:

$$\text{Margem Bruta (\%)} = \frac{\text{Receita Reconhecida (USD)} - \text{Custos Diretos de IA (USD)}}{\text{Receita Reconhecida (USD)}} \times 100$$

### Regras de Negócio e Alertas FinOps:
1. **Margem Alvo da Plataforma:** $\ge 70\%$
2. **Limite Mínimo de Alerta (*Low Margin Alert*):** Se a margem de uma organização ou plano descer abaixo de **60%**, o sistema:
   - Sinaliza a organização no painel administrativo (`/admin/costs`) com um indicador amarelo/vermelho.
   - Recomenda a rotação de modelos pesados para modelos mais eficientes (ex.: alternar de Pro para Flash em reuniões de rotina).
   - Impede concessões de quotas de cortesia sem aprovação expressa de um `billing_admin`.
