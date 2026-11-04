# MEETWISE AI — Fornecedores de Transcrição e Diarização

## 1. Visão Geral dos Fornecedores

O MEETWISE AI adota uma estratégia de múltiplos fornecedores desacoplados através da interface unificada `ITranscriptionProviderAdapter`:

| Fornecedor | Papel | Modelo / Endpoint | Diarização | Idiomas Principais | Latência Típica |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Deepgram** | Primário | Nova-3 (`/v1/listen`) | Sim (Nativa) | PT (PT-PT, PT-BR), EN, ES, FR, Auto | Muito Baixa (10-20x tempo real) |
| **Gladia** | Secundário (Fallback) | Whisper v2 (`/v2/transcription`) | Sim (Configurável) | PT, EN, ES, FR, Auto | Baixa (5-10x tempo real) |
| **Mock Provider** | Dev / Testes Locais | Determinístico em memória | Sim (Orador 1, Orador 2, etc.) | PT (Predefinido), EN, ES, FR | Instantânea (<10ms) |

---

## 2. Adaptador Deepgram Nova-3 (`src/modules/transcription/providers/deepgram.ts`)

### Configuração e Parâmetros de Chamada
- **Endpoint:** `https://api.deepgram.com/v1/listen`
- **Autenticação:** Header `Authorization: Token ${DEEPGRAM_API_KEY}`
- **Query Parameters Padronizados:**
  ```text
  model=nova-3
  diarize=true
  smart_format=true
  punctuate=true
  utterances=true
  language=pt (ou detect_language=true quando language=auto)
  ```
- **Capacidades Oficiais:**
  - Suporte de primeira classe para Português Europeu e Brasileiro.
  - Reconhecimento e pontuação automática contextual.
  - Devolução de `utterances` com identificação de `speaker` (0, 1, 2...) e timestamps a nível de palavra.
- **Normalização de Dados:**
  - `start` (segundos float) $\rightarrow$ `start_time_ms = Math.round(start * 1000)`
  - `speaker: 0` $\rightarrow$ `speaker_label: "Orador 1"`
  - `confidence` normalizado no intervalo $[0.000, 1.000]$.

---

## 3. Adaptador Gladia Whisper (`src/modules/transcription/providers/gladia.ts`)

### Configuração e Parâmetros de Chamada
- **Endpoint:** `https://api.gladia.io/v2/transcription/`
- **Autenticação:** Header `x-gladia-key: ${GLADIA_API_KEY}`
- **Payload Padronizado:**
  ```json
  {
    "audio_url": "https://...",
    "diarization": true,
    "diarization_config": {
      "min_speakers": 1,
      "max_speakers": 10
    },
    "language_behaviour": "automatic single language"
  }
  ```
- **Papel na Infraestrutura:**
  - Acionado automaticamente quando o Deepgram reporta indisponibilidade ou falha temporária de rede (código HTTP $\ge 500$).

---

## 4. Adaptador Determinístico Mock (`src/modules/transcription/providers/mock.ts`)

### Características de Simulação
- **Finalidade:** Permite o desenvolvimento completo da interface, testes automatizados e validações de QA sem incorrer em custos de API de terceiros nem exigir segredos de produção em ambientes isolados.
- **Transparência Inegociável:**
  - O resultado inclui explicitamente:
    ```typescript
    {
      provider: 'mock',
      simulated: true
    }
    ```
  - A interface de utilizador apresenta um banner visual de aviso amarelo indicando que a transcrição foi gerada pelo `MockTranscriptionProvider`.
- **Conteúdo Semântico:**
  - Simula uma reunião executiva real em Português com 3 intervenientes identificados (`Orador 1`, `Orador 2`, `Orador 3`).
  - Timestamps milimetricamente espaçados e consistentes (`0ms` a `16000ms`).
  - Array completo de palavras (`words`) com métricas de confiança individuais superiores a `0.95`.

---

## 5. Resolução Automática de Fornecedores (`src/modules/transcription/service.ts`)

O `TranscriptionService` executa a seguinte lógica determinística de resolução:
1. Se for passado um fornecedor preferencial e este estiver configurado (`isConfigured() === true`), utiliza-o.
2. Caso contrário, itera pelos fornecedores disponíveis na ordem de prioridade: **Deepgram Nova-3** $\rightarrow$ **Gladia** $\rightarrow$ **Mock Provider**.
3. Em caso de falha transitória do fornecedor ativo, tenta automaticamente o fornecedor seguinte na cadeia de redundância.
