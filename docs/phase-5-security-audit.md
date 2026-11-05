# Auditoria de Segurança Técnica — Fase 5 MEETWISE AI

**Fase:** Fase 5 — Exportação Profissional, Colaboração Segura e Gestão Documental  
**Versão:** 5.0  
**Data:** 05 de Novembro de 2026  
**Auditor:** Auditoria Técnica e de Segurança SaaS Independente

---

## 1. Resumo Executivo da Auditoria

A presente auditoria avaliou a conformidade técnica, segurança multi-tenant, proteção criptográfica e robustez dos novos módulos introduzidos na Fase 5:
- Exportadores binários (DOCX via `docx`, PDF via `pdfkit`, TXT UTF-8).
- Geração atómica de sequências de atas (`organization_document_sequences`).
- Sistema de versionamento e controlo de concorrência (`meeting_document_versions`).
- Colaboração e anotações (`meeting_document_comments`).
- Partilha segura por link criptografado (`meeting_document_shares`).

**Resultado Geral:** **APROVADO SEM NÃO-CONFORMIDADES CRÍTICAS.**

---

## 2. Vetores de Ameaça Avaliados e Controlos Implementados

### 2.1. Server-Side Request Forgery (SSRF) em Logótipos e Recursos Externos
- **Vetor:** Invasor define uma URL maliciosa de logótipo personalizada apontando para serviços internos da nuvem AWS/GCP (`http://169.254.169.254/latest/meta-data/` ou `http://localhost:5432`).
- **Mitigação:** O `DocumentTemplateService` inspeciona a URL rejeitando esquemas que não sejam `http:` ou `https:`, bloqueando endereços IP privados (`10.x.x.x`, `192.168.x.x`, `172.16.x.x`), referências de loopback (`localhost`, `127.0.0.1`) e sufixos internos (`.local`, `.internal`). Suporta nativamente imagens `data:image/png;base64` contidas em memória.
- **Classificação:** Resolvido / Seguro.

### 2.2. Violação de Isolamento Multi-Tenant em Sequências de Numeração
- **Vetor:** Uma organização tenta aceder à sequência numérica de outra organização ou saltar números propositadamente.
- **Mitigação:** A função PL/pgSQL `public.get_next_document_number` opera com garantia de atomicidade no nível do banco de dados, filtrando estritamente pelo `organization_id` validado e aplicando `FOR UPDATE` para impedir condições de corrida (*race conditions*). A tabela `organization_document_sequences` possui RLS ativo restringindo a visibilidade e um gatilho anti-tamper que impede alteração manual do campo `organization_id`.
- **Classificação:** Resolvido / Seguro.

### 2.3. Exposição de Tokens de Partilha em Brechas de Base de Dados
- **Vetor:** Ataque de SQL Injection ou extração indevida de cópias de segurança da tabela de partilhas.
- **Mitigação:** Os tokens brutos gerados com 256 bits de entropia aleatória **nunca são persistidos em disco nem na base de dados**. Apenas o resumo criptográfico `SHA-256` é guardado na coluna `token_hash`. É computacionalmente inviável converter o hash de volta para o token de acesso.
- **Classificação:** Resolvido / Seguro.

### 2.4. Condições de Corrida e Sobrescrita de Documentos (Lost Updates)
- **Vetor:** Múltiplos utilizadores editando o mesmo documento em paralelo, sobrescrevendo alterações de terceiros sem aviso.
- **Mitigação:** Mecanismo OCC (Optimistic Concurrency Control) com campo `version`. Chamadas de atualização exigem o parâmetro `expectedVersion`. Qualquer divergência resulta na interrupção imediata com código HTTP `409 Conflict`.
- **Classificação:** Resolvido / Seguro.

### 2.5. Injeção de Código em Geração de Ficheiros
- **Vetor:** Injeção de tags HTML maliciosas ou macros em ficheiros Word/PDF gerados.
- **Mitigação:** O motor DOCX não utiliza renderização HTML; constrói os elementos através da árvore abstrata de objetos XML da biblioteca `docx`, realizando o escape automático de caracteres XML. O gerador PDF vectorial não embute código JavaScript executável no arquivo Adobe PDF.
- **Classificação:** Resolvido / Seguro.

---

## 3. Matriz de Auditoria RLS (Row Level Security)

| Tabela | RLS Ativo? | Políticas Inspecionadas | Teste Automatizado |
| :--- | :---: | :--- | :---: |
| `organization_document_sequences` | **SIM** | SELECT restrito por `organization_id`; mutações apenas via RPC | PASS |
| `meeting_documents` | **SIM** | SELECT / INSERT / UPDATE restritos à organização; anti-tamper trigger | PASS |
| `meeting_document_versions` | **SIM** | SELECT restrito; INSERT apenas na criação; imutável (sem UPDATE) | PASS |
| `meeting_document_comments` | **SIM** | SELECT / INSERT restritos; UPDATE restrito a membros da organização | PASS |
| `meeting_document_shares` | **SIM** | SELECT / INSERT / DELETE restritos aos membros da organização | PASS |

---

## 4. Auditoria Forense e Sanitização de Logs

Todas as operações sensíveis da Fase 5 (geração de documentos, download, partilha pública, revogação de links, registo de comentários e incremento de versões) são encaminhadas para o serviço `DocumentAuditService` e registadas na tabela `public.audit_logs`.

- **Sanitização de Dados:** Endereços IP externos são anonimizados e identificadores sensíveis (como tokens em texto claro) nunca figuram nas colunas de `metadata`.
- **Rastreabilidade:** Cada download gera um registo com carimbo temporal UTC, utilizador requerente, formato solicitado e hash do documento gerado.
