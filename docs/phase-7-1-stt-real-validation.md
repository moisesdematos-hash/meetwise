# Validação e Homologação de Speech-to-Text em Produção (Fase 7.1.3)

**Data da Auditoria:** 05 de Novembro de 2026  
**Auditor Independente:** Antigravity Master Audit Team (STT Integration Specialist)  
**Repositório:** MEETWISE AI  
**Componente:** `src/modules/transcription/`  
**Resultado da Gate 7.1.3:** **BLOCKED (HOMOLOGAÇÃO DE REDE DEPENDENTE DE CHAVE COMERCIAL) / PASS (ARQUITETURA E RESILIÊNCIA)**

---

## 1. Sumário Executivo

A auditoria inspecionou a camada de integração com motores de reconhecimento de voz (*Automatic Speech Recognition* - ASR).

O código possui adaptadores implementados para:
- **Deepgram Adapter (`src/modules/transcription/providers/deepgram.ts`):** Configurado para o modelo `nova-3` com diarização, pontuação e deteção inteligente de linguagem (`pt`, `en`, `es`, `fr`).
- **Gladia Adapter (`src/modules/transcription/providers/gladia.ts`):** Adaptador secundário com chave `GLADIA_API_KEY`.
- **Mock Adapter (`src/modules/transcription/providers/mock.ts`):** Adaptador determinístico para testes e desenvolvimento offline.

---

## 2. Relatório de Bloqueio de STT Real (Conforme Seção 6)

- **Serviço:** Deepgram Nova-3 / Gladia Solaria.
- **Estado:** **BLOCKED**.
- **Causa:** Ausência de chaves de API com saldo comercial ativo (`DEEPGRAM_API_KEY` ou `GLADIA_API_KEY`) no ambiente local, e proibição mandatória de consumo de APIs pagas sem autorização expressa humana.
- **O que falta:** Injeção de `DEEPGRAM_API_KEY` com saldo ativo no ambiente de staging.
- **Como resolver:**
  1. Criar conta em [console.deepgram.com](https://console.deepgram.com).
  2. Adicionar créditos de teste ($200 gratuitos no registo de novos programadores).
  3. Gerar API Key com permissões de `Usage: Write`.
  4. Inserir a chave no gestor de segredos do ambiente de staging (`.env.local`).
- **Custo Estimado:** ~$0.0043/minuto de áudio (~$0.0059/minuto com diarização de oradores). Um teste de 60 minutos de áudio custa ~$0.35 USD.
- **Responsável:** Administrador do Projeto / AI Engineer.
- **Alternativa Atual:** `MockTranscriptionProvider` cobre 100% dos testes automatizados de normalização temporal e resiliência de fila.
- **Impacto:** Transcrições reais de áudios em Português de Angola (PT-AO) e Português Europeu (PT-PT) operam atualmente com transcrições sintéticas determinísticas até à injeção da chave.

---

## 3. Protocolo de Aceitação Pré-Produção para Português de Angola (PT-AO)

Quando a chave for disponibilizada no ambiente de staging, a equipa de QA executará a validação com 3 gravações de referência:
1. Reunião de 15 minutos com sotaque angolano (PT-AO) e 3 oradores.
2. Limiar de Aceitação: Word Error Rate (WER) $\le 15\%$ e precisão de diarização $\ge 82\%$.
3. Preservação de termos técnicos e coloquialismos empresariais locais (ex.: "kwanza", "bna", "kumbu", "nif").

---

## 4. Veredicto da Quality Gate 7.1.3

- Resiliência da Fila e Normalização: **APROVADO (PASS)**.
- Homologação de Rede com API Paga Comercial: **BLOCKED**.
