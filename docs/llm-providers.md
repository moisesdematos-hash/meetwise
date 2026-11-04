# MATRIZ DE PROVEDORES DE IA & LLM — MEETWISE AI
## Especificações, Integrações, Custos e Estratégia de Fallback

**Versão:** 4.0  
**Data:** 04 de Novembro de 2026  
**Documento Técnico:** `docs/llm-providers.md`

---

## 1. INTRODUÇÃO

O MEETWISE AI adota uma arquitetura agnóstica de LLM através da interface `ILLMAdapter` e da fábrica `LLMProviderFactory`. Esta abordagem elimina dependência exclusiva de qualquer fornecedor de IA, garante redundância operacional contra indisponibilidades e permite otimização dinâmica de custos por caso de uso.

---

## 2. MATRIZ COMPARATIVA DE MODELOS LLM

| Fornecedor | Modelo Homologado | Latência Média | Custo Entrada (1M tokens) | Custo Saída (1M tokens) | Suporte PT (AO/PT/BR) | Modo Estruturado (JSON) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Google** | `gemini-2.0-flash` | ~850 ms | \$0.10 | \$0.40 | Excelente (Nativo) | Excelente (Schema nativo) |
| **OpenAI** | `gpt-4o` | ~1.400 ms | \$2.50 | \$10.00 | Excelente | Excelente (`json_object`) |
| **Anthropic** | `claude-3-5-sonnet` | ~1.600 ms | \$3.00 | \$15.00 | Excelente (Linguagem formal) | Muito Bom (Tool Use) |
| **MeetWise** | `MockLLMService` | < 10 ms | \$0.00 | \$0.00 | 100% Determinístico | 100% Estrito |

---

## 3. POLÍTICA DE RESILIÊNCIA E FALLBACK

A execução analítica obedece à seguinte cadeia de resolução:

1. **Tentativa Primária:**
   Se uma chave de API estiver configurada (ex: `GEMINI_API_KEY`), o adaptador correspondente é acionado prioritariamente.
2. **Fallback Secundário:**
   Caso o fornecedor primário retorne erro de rede, timeout (>30s) ou erro de quota (429/503), o `LLMProviderFactory` tenta o fornecedor de backup (`OPENAI_API_KEY` ou `ANTHROPIC_API_KEY`).
3. **Fallback Determinístico (`MockLLMService`):**
   Se nenhum fornecedor comercial estiver configurado ou todos falharem em ambiente de desenvolvimento/testes, o sistema recorre ao `MockLLMService`.
   - **Regra de Transparência:** O `MockLLMService` sinaliza sempre de forma obrigatória `metadata.simulated = true` e `provider = 'mock'`. Nenhuma simulação é alguma vez apresentada ao utilizador como chamada real à API externa.

---

## 4. DEFESA CONTRA PROMPT INJECTION & XML CONTAINMENT

Todos os adaptadores invocam o construtor `buildSafeMeetingPrompt()` que encapsula a transcrição em tags XML delimitadoras:

```xml
<untrusted_meeting_transcript>
[0.0s - 15.0s] Speaker 1: Bom dia a todos...
</untrusted_meeting_transcript>
```

- Qualquer tentativa de fechar precocemente a tag `</untrusted_meeting_transcript>` é convertida para `&lt;/untrusted_meeting_transcript&gt;`.
- Padrões adversariais como `"Ignore all previous instructions"` ou `"[SYSTEM OVERRIDE]"` são neutralizados e tratados apenas como fala declarativa de intervenientes, sem nunca alterar as instruções de sistema do motor executivo.
