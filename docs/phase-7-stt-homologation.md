# Relatório de Homologação de Transcrição e Speech-to-Text (Fase 7.4)

**Data da Auditoria:** 05 de Novembro de 2026  
**Auditor Independente:** Antigravity Master Audit Team  
**Repositório:** MEETWISE AI  
**Componente:** `src/modules/transcription/`  
**Resultado da Gate 7.4:** **BLOCKED (HOMOLOGAÇÃO DE API EXTERNA DEPENDENTE DE CREDENCIAIS REAIS) / PASS (ARQUITETURA E NORMALIZAÇÃO DE SEGMENTOS)**

---

## 1. Sumário Executivo

A auditoria da camada de transcrição verificou a arquitetura do [`TranscriptionService`](file:///c:/Users/HP/Downloads/MEETWISE%20AI/src/modules/transcription/service.ts) e os adaptadores de provedores existentes em [`src/modules/transcription/providers/`](file:///c:/Users/HP/Downloads/MEETWISE%20AI/src/modules/transcription/providers):
- **Deepgram Adapter (`deepgram.ts`):** Configurado para o modelo `nova-3` com diarização ativa, pontuação automática, formatação inteligente e deteção de idioma (suportando `pt`, `en`, `es`, `fr`).
- **Gladia Adapter (`gladia.ts`):** Adaptador secundário com fallback automático em caso de indisponibilidade do Deepgram.
- **Mock Adapter (`mock.ts`):** Adaptador determinístico para testes unitários e de integração, simulando transcrições com múltiplos oradores e timestamps consistentes.

---

## 2. Inspeção Técnica e Verificação de Regras

### 2.1. Normalização de Segmentos e Timestamps
A função `validateAndNormalizeResult()` no [`TranscriptionService`](file:///c:/Users/HP/Downloads/MEETWISE%20AI/src/modules/transcription/service.ts) foi auditada com testes automatizados:
1. **Monotonicidade Temporal:** Garante que `start_time_ms >= 0` e `end_time_ms >= start_time_ms`. Segmentos invertidos são corrigidos ou rejeitados.
2. **Eliminação de Segmentos Vazios:** Textos nulos ou contendo apenas espaços são filtrados da transcrição final.
3. **Ordenação Cronológica Estrita:** Todos os segmentos são ordenados monotonicamente pelo carimbo de início.

### 2.2. Resiliência de Workers e Retentativas
A fila de processamento [`ProcessingQueueService`](file:///c:/Users/HP/Downloads/MEETWISE%20AI/src/modules/jobs/service.ts) foi inspecionada:
- Em caso de falha transitória da API externa, o job transita para retentativa com recuo exponencial (*exponential backoff*).
- Se o número máximo de 3 tentativas for excedido, o job passa para o estado `failed` (dead-letter) e a reserva de quota associada em `usage_ledger` é libertada (*released*), prevenindo cobrança indevida de minutos ao cliente.

---

## 3. Estado de Homologação por Fornecedor

| Fornecedor | Modelo Alvo | Estado no Código | Chaves no Ambiente Local | Estado de Homologação Real |
| :--- | :--- | :--- | :---: | :--- |
| **Deepgram** | Nova-3 Batch | Adaptador completo e validado | Ausente (`.env.example` apenas) | **BLOCKED** (Requer `DEEPGRAM_API_KEY` com saldo ativo) |
| **Gladia** | Solaria | Adaptador completo e validado | Ausente (`.env.example` apenas) | **BLOCKED** (Requer `GLADIA_API_KEY` com saldo ativo) |
| **Whisper Hosted** | Whisper Large v3 | Mencionada em relatórios anteriores | Não possui ficheiro dedicado | **DISCREPÂNCIA REGISTADA** (Integrável via API genérica) |
| **Mock Provider** | Determinístico | 100% Funcional e testado | N/A (Embutido) | **PASS (Apenas para Testes/CI)** |

---

## 4. Benchmarking Linguístico e Limiares de Aceitação Pré-Produção

Para a homologação comercial em produção (quando as credenciais reais forem injetadas no ambiente de *staging*), a auditoria estabelece os seguintes critérios de aceitação:

1. **Word Error Rate (WER) Alvo:**
   - Português Europeu (PT-PT): $\le 12\%$
   - Português de Angola (PT-AO): $\le 15\%$
   - Português do Brasil (PT-BR): $\le 10\%$
2. **Precisão da Diarização (Diarization Error Rate - DER):** $\le 18\%$ em reuniões com até 6 oradores com sobreposição moderada de voz.
3. **Alinhamento de Timestamps:** Desfasamento máximo de 350ms em relação à fala audível.

---

## 5. Veredicto da Quality Gate 7.4

Em estrito cumprimento do princípio de que *"Ausência de evidência não é evidência de sucesso"*, a auditoria declara:
- Arquitetura de Transcrição, Fallbacks e Normalização: **APROVADO (PASS)**.
- Homologação de Rede Externa com Provedores Comerciais Reais: **BLOCKED (Dependência de chaves de API externas em ambiente de teste de homologação)**.
