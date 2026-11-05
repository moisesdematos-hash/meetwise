# Matriz de Evidências Técnicas e Rastreabilidade (Fase 7.23)

**Data da Auditoria:** 05 de Novembro de 2026  
**Auditor Independente:** Antigravity Master Audit Team  
**Repositório:** MEETWISE AI  

---

## 1. Matriz de Requisitos e Evidências Verificáveis

| ID do Requisito | Fase Origem | Descrição do Requisito | Critério de Aceitação | Tipo de Teste | Ambiente | Resultado | Evidência de Suporte |
| :--- | :---: | :--- | :--- | :--- | :--- | :---: | :--- |
| **REQ-AUTH-001** | Fase 1 & 2 | Isolamento de sessões e autenticação Supabase | Utilizador não autenticado é redirecionado para login | Integração / Middleware | Local Node.js | **PASS** | `src/__tests__/auth-and-forms.test.ts` & `middleware.ts` |
| **REQ-RLS-001** | Fase 1 | Isolamento multi-tenant de dados | Utilizador de Org A não visualiza reuniões de Org B | PostgreSQL Real | PGlite (WASM) | **PASS** | `src/__tests__/real-database-rls-audit.test.ts` (Teste 4) |
| **REQ-RLS-002** | Fase 1 | Proteção do último proprietário da organização | Tentativa de remover o último owner dispara exceção | PostgreSQL Real | PGlite (WASM) | **PASS** | `src/__tests__/real-database-rls-audit.test.ts` (Teste 12) |
| **REQ-RLS-003** | Fase 1 | Anti-tamper do `organization_id` | Alteração de `organization_id` via UPDATE é bloqueada | PostgreSQL Real | PGlite (WASM) | **PASS** | `src/__tests__/real-database-rls-audit.test.ts` (Teste 14) |
| **REQ-SUPA-001**| Fase 1 & 2 | Homologação com Supabase Cloud/Docker real | Execução contra daemon Supabase CLI ativo | Infraestrutura Externa| Cloud / Docker | **BLOCKED** | Docker daemon inativo e Supabase CLI ausente no host |
| **REQ-MEDIA-001**| Fase 3 | Validação de formatos e Magic Bytes anti-spoofing| Ficheiro renomeado falsamente para .mp3/.wav é rejeitado | Unitário / Integração | Local Node.js | **PASS** | `src/__tests__/phase-3-media-upload.test.ts` (Teste 2) |
| **REQ-MEDIA-002**| Fase 3 | Limite estrito de 500 MB no upload de áudio/vídeo | Ficheiro > 500 MB dispara erro `PAYLOAD_TOO_LARGE` | Unitário | Local Node.js | **PASS** | `src/__tests__/phase-3-media-upload.test.ts` (Teste 3) |
| **REQ-STT-001** | Fase 3 | Normalização de segmentos e ordenação cronológica | Segmentos têm timestamps não sobrepostos e ordenados | Integração | Local Node.js | **PASS** | `src/__tests__/phase-3-transcription-engine.test.ts` (Teste 1) |
| **REQ-STT-002** | Fase 3 | Homologação de API real Deepgram / Gladia com áudio PT | WER $\le 15\%$ em reuniões de áudio reais | Rede Externa | API Externa | **BLOCKED** | Ausência de chaves de API com saldo no ambiente local |
| **REQ-AI-001** | Fase 4 | Defesas XML contra Prompt Injection no áudio | Comandos na transcrição são tratados como fala comum | Heurística / LLM | Local Node.js | **PASS** | `src/__tests__/phase-4-anti-hallucination-evidence.test.ts` (Teste 1) |
| **REQ-AI-002** | Fase 4 | Fundamentação Verbatim e vinculação de deliberações | Toda a decisão exige citação literal comprovada | Integração | Local Node.js | **PASS** | `src/__tests__/phase-4-anti-hallucination-evidence.test.ts` (Teste 2) |
| **REQ-AI-003** | Fase 4 | Despromoção automática de decisões alucinadas | Decisão com termos de rejeição desce para pending/rejected| Heurística | Local Node.js | **PASS** | `src/__tests__/phase-4-decisions-and-tasks.test.ts` (Teste 3) |
| **REQ-DOC-001** | Fase 5 | Geração de ata em DOCX (OpenXML) | Ficheiro binário válido com cabeçalhos e tabelas | Binário Real | Local Node.js | **PASS** | `src/__tests__/phase-5-docx-export.test.ts` (Teste 1) |
| **REQ-DOC-002** | Fase 5 | Geração de ata em PDF Vectorial A4 | PDF válido com paginação "Página X de Y" em 2 passos | Binário Real | Local Node.js | **PASS** | `src/__tests__/phase-5-pdf-export.test.ts` (Teste 1) |
| **REQ-DOC-003** | Fase 5 | Paridade entre formatos canónicos (Curta, Média, Longa) | Zero perda de decisões, tarefas ou intervenientes | Integração | Local Node.js | **PASS** | `src/__tests__/phase-5-real-documents-verification.test.ts` |
| **REQ-DOC-004** | Fase 5 | Concorrência Otimista (OCC) em versões de atas | Gravação concorrente na mesma versão dispara HTTP 409 | PostgreSQL Real | PGlite (WASM) | **PASS** | `src/__tests__/phase-5-versioning-and-concurrency.test.ts` |
| **REQ-DOC-005** | Fase 5 | Partilha segura com tokens hash SHA-256 | Link público usa token temporário de 256 bits | Criptografia | Local Node.js | **PASS** | `src/__tests__/phase-5-sharing-and-security.test.ts` |
| **REQ-BILL-001**| Fase 6 | Resolução exclusiva de preço no servidor | Preço e moeda adulterados no payload são ignorados | Integração | Local Node.js | **PASS** | `src/__tests__/phase-6-checkout-security.test.ts` (Teste 1) |
| **REQ-BILL-002**| Fase 6 | Expiração de checkout em 30 minutos | Sessão expirada é rejeitada | Integração | Local Node.js | **PASS** | `src/__tests__/phase-6-checkout-security.test.ts` (Teste 2) |
| **REQ-BILL-003**| Fase 6 | Idempotência de webhooks de pagamento | Entrega repetida do mesmo evento não duplica cobrança | PostgreSQL Real | PGlite (WASM) | **PASS** | `src/__tests__/phase-6-webhooks-and-payments.test.ts` (Teste 2) |
| **REQ-BILL-004**| Fase 6 | Invariante de partidas dobradas ($\sum D == \sum C$) | Transação desequilibrada é rejeitada | Contabilidade | Local Node.js | **PASS** | `src/__tests__/phase-6-financial-ledger.test.ts` (Teste 1) |
| **REQ-BILL-005**| Fase 6 | Imutabilidade de lançamentos contábeis no PostgreSQL | UPDATE ou DELETE em financial_ledger_entries falha | PostgreSQL Real | PGlite (WASM) | **PASS** | `src/__tests__/phase-6-multi-tenant-monetization.test.ts` (Teste 4) |
| **REQ-BILL-006**| Fase 6 | Reservas atómicas de quotas em duas fases | Quotas não podem ficar negativas em acessos simultâneos | PostgreSQL Real | PGlite (WASM) | **PASS** | `src/__tests__/phase-6-quotas-and-metering.test.ts` (Teste 1) |
| **REQ-BILL-007**| Fase 6 | Homologação de Gateway Stripe / EMIS Real | Liquidação real em contas bancárias | Rede Bancária | Produção | **BLOCKED** | Stripe não liquida em Angola; EMIS requer contrato oficial |
| **REQ-ADM-001** | Fase 6 | Protocolo mandatório de justificação em ações de admin | Intervenção com justificativa < 10 caracteres é rejeitada| Validação | Local Node.js | **PASS** | `src/__tests__/phase-6-admin-and-audit.test.ts` (Teste 2) |
| **REQ-E2E-001** | Fase 7 | Testes End-to-End via Playwright em navegador headless | Execução de cenários visuais com screenshots | Navegador | Headless | **BLOCKED** | `@playwright/test` não presente no package.json |
| **REQ-SEC-001** | Fase 7 | Proteção de funções SECURITY DEFINER no PostgreSQL | Cláusula `SET search_path = public, pg_temp;` aplicada | AppSec | Migrações SQL | **PASS** | Migrações 6 e 7 corrigidas e testadas |
| **REQ-SEC-002** | Fase 7 | Proteção da rota `/admin` no middleware | Redirecionamento de utilizadores anónimos para login | Middleware | Next.js Server | **PASS** | `src/middleware.ts` atualizado e testado |
| **REQ-SEC-003** | Fase 7 | Cabeçalhos de segurança HTTP (X-Frame-Options, etc.) | Headers anti-clickjacking e anti-sniffing injetados | Web Server | Next.js Build | **PASS** | `next.config.mjs` atualizado e compilado |
