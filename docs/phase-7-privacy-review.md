# Revisão de Privacidade, Proteção de Dados e Conformidade (Fase 7.14)

**Data da Auditoria:** 05 de Novembro de 2026  
**Auditor Independente:** Antigravity Master Audit Team (Privacy & Data Protection Specialist)  
**Repositório:** MEETWISE AI  
**Resultado da Gate 7.14:** **APROVADO COM RESSALVAS JURÍDICAS (PASS)**

---

## 1. Sumário Executivo

A auditoria de privacidade avaliou o tratamento de dados pessoais (gravações de voz, imagens de reuniões, transcrições, nomes de participantes e decisões) em conformidade com o Regulamento Geral sobre a Proteção de Dados (RGPD - Regulamento UE 2016/679) e a Lei de Proteção de Dados Pessoais de Angola (Lei n.º 22/11).

---

## 2. Princípios de Proteção de Dados no MEETWISE AI

### 2.1. Consentimento e Base Legal para Gravação
- Gravações de áudio/vídeo constituem dados biométricos e pessoais.
- O sistema impõe que o início da sessão de gravação seja precedido de notificação explícita a todos os participantes. Na interface de upload e nas atas geradas, é incluído o campo de consentimento e a lista de presenças expressamente confirmadas.

### 2.2. Minimização e Retenção de Dados
- **Retenção de Media:** Áudios originais têm política de retenção baseada no plano da organização (ex.: 30 dias no plano Free, 180 dias no Starter, 365 dias no Pro).
- **Eliminação Transacional em Cascata:** A eliminação de uma reunião (`DELETE /api/meetings/[id]`) remove em cascata:
  - Ficheiro binário no storage bucket (`media_assets`);
  - Segmentos da transcrição (`transcript_segments`);
  - Atas e versões (`meeting_minutes`, `meeting_documents`);
  - Registo em `processing_jobs` e reservas pendentes.
  - Não são deixados ficheiros órfãos no Supabase Storage.

### 2.3. Subprocessadores e Transferências Internacionais de Dados
- **Provedores de STT:** Deepgram (EUA) e Gladia (UE/EUA).
- **Provedores de LLM:** Google Cloud (Gemini), OpenAI (EUA), Anthropic (EUA).
- **Diretiva de Conformidade:**
  - Em produção comercial, a empresa operadora do SaaS deverá celebrar Acordos de Tratamento de Dados (*Data Processing Agreements* - DPAs) com cláusulas contratuais-tipo (SCCs) com os fornecedores acima designados.
  - O sistema implementa opção para planos Enterprise utilizarem modelos dedicados on-premise ou em regiões soberanas para conformidade estrita.

---

## 3. Direitos dos Titulares de Dados (ARCO)

1. **Direito de Acesso e Portabilidade:** O utilizador pode exportar a qualquer momento a íntegra dos seus dados nos formatos abertos DOCX, PDF, TXT ou JSON estruturado.
2. **Direito de Retificação:** O workflow de revisão humana permite a edição manual e correção de qualquer segmento de texto ou identificação de orador antes da homologação final da ata.
3. **Direito ao Apagamento (*Right to be Forgotten*):** Utilizadores podem solicitar o encerramento da sua conta e a eliminação definitiva dos seus dados associados.

---

## 4. Veredicto da Quality Gate 7.14

- Mecanismos de Minimização e Eliminação: **OPERACIONAIS**.
- Eliminação de Ficheiros Órfãos: **GARANTIDA**.
- Ressalva Regulatória: A conformidade jurídica definitiva requer a validação dos termos de serviço e política de privacidade por assessoria jurídica antes do lançamento público.

**DECISÃO DA GATE 7.14:** **APROVADO (PASS)**.
