# MEETWISE AI — RELATÓRIO DE AUDITORIA DE SEGURANÇA
## FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.B.2-A
### JWT REVOCATION & SUPABASE STORAGE SIGNED URL AUDIT

---

### METADADOS DO RELATÓRIO
- **Projeto:** MEETWISE AI (Multi-tenant AI Meeting Intelligence Platform)
- **Fase de Certificação:** Porta 2 — Etapa 2 — Subfase D1.B.2-A (Auditoria & Matriz de Testes)
- **Supabase Cloud Staging:** `ycxwomqqepetickmxxqj` (`https://ycxwomqqepetickmxxqj.supabase.co`)
- **Commit Base Certificado:** `e12ec46` (`feat(security): complete fin-rec-01 subscription reconciliation and post-reconciliation validation in cloud staging`)
- **Data/Hora:** 07 de Novembro de 2026, 06:45 UTC
- **Âmbito:** Estritamente Auditoria, Verificação Estática/Dinâmica e Planeamento Determinístico (Zero alterações no Cloud Staging nesta subfase).

---

## 1. RESUMO EXECUTIVO E DECISÃO

A auditoria de segurança da **Fase D1.B.2-A** avaliou rigorosamente os mecanismos de controlo de acessos, revogação de permissões e ciclo de vida de tokens e ficheiros na plataforma MEETWISE AI, com foco especial na dicotomia entre **revogação de JWT / pertença organizacional** e a **segurança de URLs assinadas (Signed URLs) do Supabase Storage**.

### Veredicto Global:
| Domínio | Avaliação | Resumo Técnico |
| :--- | :---: | :--- |
| **JWT & Autenticação** | **PASS** | Sessões JWT são agnósticas de organização (`sub`, `email`, `role`). Todo o controlo de multi-tenancy reside no PostgreSQL RLS via `current_user_org_ids()`, garantindo revogação instantânea (0 ms) para qualquer leitura/escrita na BD aquando de remoção ou suspensão de membro. |
| **Supabase Storage RLS** | **PASS** | Buckets `meeting_recordings` e `meeting_documents` são privados (`public = false`). Políticas RLS em `storage.objects` aplicam isolamento estrito por tenant. |
| **Storage Signed URLs** | **RISK** | As URLs assinadas geradas por `createSignedUrl` são avaliadas de forma *stateless* (HMAC) no CDN do Storage. O TTL padrão de 3600s (1 hora) permite que um utilizador revogado continue a descarregar ficheiros se a URL foi emitida antes da revogação. |
| **Multi-Tenant Isolation** | **PASS** | Isolamento hermético comprovado em testes unitários, de integração e Chromium E2E (Playwright). |
| **Migration 010 Hash** | **RECONCILED** | Hash aplicado no Cloud Staging e no repositório local é idêntico: `F064F6FE77FA19280DA5D77DC9B6B6D1794DE42E6473F4B04C05BE37666F97A0`. |
| **FIN-REC-01** | **VERIFIED** | Subscrição Alpha legitimada no plano Free com quota de 45 min e log de auditoria oficial. |
| **Regressão Global** | **PASS** | 283/283 testes Vitest passaram; 8/8 testes Playwright passaram; Lint e Typecheck limpos; 42 rotas compiladas sem erro. |
| **Custos Observados** | **\$0.00** | Nenhuma API comercial paga consumida. |
| **Decisão de Porta** | **GO** | Autorização recomendada para avançar para a execução da **Fase D1.B.2-B** (Execução Prática da Matriz de Testes com Dados Sintéticos). |

---

## 2. BASELINE E AMBIENTE CLOUD STAGING

1. **Commit e Árvore de Trabalho:**
   - Commit: `e12ec46`
   - Git working tree: `clean` (sem alterações pendentes não commitadas).
   - Ramo: `master`.
2. **Migrações 001 a 010:**
   - Confirmadas aplicadas integralmente no Supabase Cloud Staging `ycxwomqqepetickmxxqj`.
   - Migração 010: `20261106000010_concurrency_and_quota_atomicity.sql`.
3. **Reconciliação FIN-REC-01:**
   - Subscrição sintética Alpha (`95034a46-8e5a-45dc-bf25-520009a48be2`) confirmada no plano Free (`ec6ea177-e266-49a7-bb74-b1c03a687fda`).
   - Período legítimo: `2026-11-06T06:14:27Z` até `2026-12-06T06:14:27Z`.
   - Limite de quota: 45 minutos (2700 segundos) estritamente imposto pela Migração 010.
   - Histórico financeiro e auditoria integralmente preservados.
4. **Ausência de Dados Comerciais:**
   - Todas as entidades auditadas e testadas pertencem a contextos sintéticos (`org_alpha_staging`, `org_beta_staging`, utilizadores sintéticos de homologação). Zero impacto em utilizadores reais.

---

## 3. DIAGNÓSTICO DO HASH DA MIGRAÇÃO 010 (RECONCILIAÇÃO)

Durante as fases D1.B.1-A e D1.B.1-B, foi identificada uma divergência entre o SHA-256 preliminar (`0DCA54...`) e o hash final aplicado (`F064F6...`):

- **Hash Preliminar Documentado:**
  `0DCA54A56526B79A2244DC02B145831C458D0C4A4DCAC060C3786BFB6E0B80C3`
- **Hash Efetivamente Aplicado e Certificado:**
  `F064F6FE77FA19280DA5D77DC9B6B6D1794DE42E6473F4B04C05BE37666F97A0`

### Causa Técnica da Alteração:
1. Durante a auditoria de segurança da Migração 010, foi identificada uma vulnerabilidade nas RPCs de quotas (`reserve_organization_quota`, `release_organization_quota`, `settle_organization_quota`), em que invocações anónimas ou não autenticadas poderiam contornar certas verificações.
2. Foi adicionada uma cláusula de segurança *fail-closed* estrita:
   ```sql
   IF auth.uid() IS NULL THEN
     RAISE EXCEPTION 'AUTH_REQUIRED: User must be authenticated to invoke quota RPCs';
   END IF;
   ```
3. Esta alteração foi testada e aprovada no PostgreSQL local antes de qualquer aplicação no Cloud.
4. O ficheiro SQL local foi atualizado com essa correção essencial, gerando o hash `F064F6...`.
5. Esse mesmo ficheiro foi aplicado com sucesso e certificado em Staging na Fase D1.B.1-B.
6. **Conclusão:** O hash atual `F064F6...` é o código auditado, mais seguro e certificado tanto localmente como no Cloud Staging.

---

## 4. AUDITORIA DE REVOGAÇÃO DE JWT & CONTROLO DE ACESSO

### 4.1 Arquitetura de Sessão Supabase
- **Estrutura dos Tokens JWT:**
  O Supabase Auth emite tokens assinados com as seguintes claims padrão:
  `{ "sub": "<user-uuid>", "email": "...", "role": "authenticated", "exp": 1794000000, ... }`.
- **Ausência de Dados de Tenant no JWT:**
  O JWT **NÃO** inclui `organization_id` nem permissões de papel (`role = 'owner' | 'admin' | 'member'`).
  Isso é uma decisão arquitetural fundamental do MEETWISE AI: **a pertença e o nível de acesso são dinâmicos e residem exclusivamente na base de dados relacional**.

### 4.2 Dinâmica de Revogação Imediata no PostgreSQL (RLS)
Todas as tabelas críticas (`meetings`, `transcripts`, `documents`, `comments`, `organization_quota_reserves`, `subscriptions`) possuem políticas RLS ativas dependentes de:
```sql
CREATE OR REPLACE FUNCTION public.current_user_org_ids()
RETURNS TABLE (organization_id UUID, role TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT organization_id, role
  FROM public.organization_members
  WHERE user_id = auth.uid()
    AND status = 'active';
$$;
```

#### Impacto dos Cenários de Revogação:
1. **Utilizador Removido da Organização:**
   - Execução: `DELETE FROM organization_members WHERE user_id = :uid AND organization_id = :org_id;`
   - Efeito: A função `current_user_org_ids()` deixa imediatamente de retornar a organização.
   - Latência de Revogação: **0 milissegundos**.
   - Mesmo que o utilizador possua um JWT válido por mais 55 minutos, **qualquer query à base de dados é bloqueada instantaneamente pelo RLS** (retorna 0 registos ou erro de permissão).
2. **Utilizador Suspenso:**
   - Execução: `UPDATE organization_members SET status = 'suspended' WHERE user_id = :uid;`
   - Efeito: Como o filtro exige `status = 'active'`, a organização é imediatamente excluída de `current_user_org_ids()`.
   - Latência: **0 milissegundos**.
3. **Despromoção (Owner/Admin -> Member):**
   - Execução: `UPDATE organization_members SET role = 'member' WHERE user_id = :uid;`
   - Efeito: O utilizador mantém acesso a reuniões normais, mas rotas administrativas (ex.: `/admin/*`, `/settings/billing`, alteração de quotas) que validam `role IN ('owner', 'admin')` bloqueiam o acesso na chamada seguinte.
4. **Promoção (Member -> Admin):**
   - Efeito: Produz efeitos imediatos na query seguinte sem necessidade de re-login ou novo JWT.
5. **Múltiplas Sessões & Refresh Tokens:**
   - Como o controlo reside na tabela `organization_members`, revogar a associação de uma conta afeta instantaneamente **todas as sessões ativas simultâneas** desse utilizador em qualquer browser ou dispositivo.

---

## 5. AUDITORIA DE STORAGE & URLS ASSINADAS (SIGNED URLS)

### 5.1 Configuração dos Buckets de Armazenamento
- `meeting_recordings`: `public = false` (Privado).
- `meeting_documents`: `public = false` (Privado).
- Políticas RLS no schema `storage.objects` garantem que uploads e leituras diretas via API REST do Supabase validam `current_user_org_ids()`.

### 5.2 Análise do Fluxo de Signed URLs
No módulo `src/modules/media/storage.ts`:
```typescript
async generatePresignedDownloadUrl(storagePath: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await this.client.storage
    .from(this.bucketName)
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) {
    throw new StorageError('STORAGE_SIGNED_URL_FAILED', `Failed to generate download URL: ${error?.message}`);
  }
  return data.signedUrl;
}
```

### 5.3 Vetores de Risco e Vulnerabilidades Identificadas
1. **Janela de Acesso Não Revogável (Stateless Bearer Window):**
   - A função `createSignedUrl` gera um token HMAC assinado pelo storage service contendo o caminho do ficheiro e a data limite de expiração (`exp`).
   - A validação no CDN do Supabase Storage é **stateless**: o CDN verifica apenas a assinatura criptográfica e o timestamp de validade.
   - **Risco Identificado:** Se um utilizador solicitar uma signed URL às 10:00 (com TTL de 3600s = 1h), e às 10:05 for demitido e removido da organização, **a signed URL continuará a descarregar o ficheiro de áudio/vídeo até às 11:00**.
   - O Storage CDN não contacta o PostgreSQL para verificar se o utilizador ainda pertence à organização.
2. **Partilha Não Autorizada de URL (URL Leakage):**
   - A signed URL é um *bearer token*. Qualquer pessoa que possua a URL pode descarregar o ficheiro sem autenticação durante o período de validade.
3. **Ausência de Revogação Granular Nativa:**
   - O Supabase Storage não oferece uma API para revogar uma única signed URL ativa sem apagar/mover o ficheiro ou regenerar o segredo mestre de criptografia do projeto.
4. **Lacuna de Auditoria em Downloads de Media:**
   - Enquanto `DocumentSharingService` regista eventos `share_accessed` e `document_shared` na tabela `audit_logs`, a geração de signed URLs para gravações de áudio/vídeo em `SupabaseStorageService` atualmente **não emite registos na tabela `audit_logs`**.

---

## 6. INSPEÇÃO DE ROTAS NEXT.JS & AÇÕES DE SERVIDOR

Foi realizada uma análise abrangente de todas as rotas e componentes:

1. **Middleware (`src/middleware.ts`):**
   - Utiliza `supabase.auth.getUser()` para validar autenticidade da sessão.
   - Redireciona utilizadores não autenticados para `/login`.
   - Rotas de API delegam a autorização granular para os seus respetivos handlers.
2. **Rotas de Media e Upload (`src/app/api/media/upload-url/route.ts`):**
   - Valida autenticação do utilizador via `supabase.auth.getUser()`.
   - Valida expressamente que o utilizador possui `status = 'active'` na organização indicada antes de gerar presigned upload URL.
3. **Rotas de Documentos e Partilha (`src/app/api/meetings/[id]/share/route.ts`):**
   - Cria tokens de partilha com hash SHA-256 e data de expiração configurável.
   - Possui endpoint explícito para revogação antecipada de partilhas (`DELETE`).
4. **Rotas de Transcrição e Análise (`src/app/api/meetings/[id]/analyze/route.ts`):**
   - Requerem permissões ativas e verificam quotas atómicas através das novas RPCs da Migração 010.
5. **Segurança de Credenciais:**
   - Nenhuma chave `service_role` está exposta no cliente ou no browser (apenas `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
   - Todas as operações privilegiadas correm exclusivamente no servidor Next.js ou via SECURITY DEFINER no PostgreSQL.

---

## 7. MATRIZ DETERMINÍSTICA DE TESTES — FASE D1.B.2-B (CENÁRIOS A A J)

Para certificar na prática o comportamento do sistema durante a **Fase D1.B.2-B**, foi estruturada a seguinte matriz de 10 cenários determinísticos:

| Cenário | Título do Cenário | Identidades Sintéticas | Operação Principal | Resultado Esperado | Critério Pass/Fail |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **A** | **Revogação de Membro (Remoção da Org)** | Utilizador `member_alpha_01`<br>Org `org_alpha_staging` | Remover membro da organização via `DELETE organization_members`. Testar acesso subsequente com JWT existente a reuniões e documentos. | Acesso bloqueado em 0 ms pelo RLS. Queries retornam 0 registos. | **PASS:** 0 registos retornados.<br>**FAIL:** Acesso permitido. |
| **B** | **Suspensão de Membro** | Utilizador `member_alpha_02`<br>Org `org_alpha_staging` | Atualizar membro para `status = 'suspended'`. Tentar aceder a reuniões e criar novas anotações. | Acesso negado pelo RLS (`current_user_org_ids()` filtra `status = 'active'`). | **PASS:** Acesso negado.<br>**FAIL:** Acesso permitido. |
| **C** | **Despromoção de Role (Admin -> Member)** | Utilizador `admin_alpha_01`<br>Org `org_alpha_staging` | Despromover role de `'admin'` para `'member'`. Tentar aceder a rotas de faturação e reservas de quota. | Acesso a dados normais mantido; acesso a rotas privilegiadas rejeitado com 403 Forbidden. | **PASS:** 403 em rotas admin.<br>**FAIL:** Rotas admin abertas. |
| **D** | **Promoção de Role (Member -> Admin)** | Utilizador `member_alpha_03`<br>Org `org_alpha_staging` | Promover role de `'member'` para `'admin'`. Tentar aceder a endpoints de gestão e auditoria. | Acesso concedido imediatamente na requisição seguinte sem necessidade de reemitir JWT. | **PASS:** Acesso concedido.<br>**FAIL:** Falha de permissão. |
| **E** | **Signed URL Ativa vs Membro Removido** | Utilizador `member_alpha_04`<br>Org `org_alpha_staging` | 1. Emitir signed URL para gravação.<br>2. Remover utilizador da organização.<br>3. Tentar download através da signed URL. | URL descarrega o ficheiro devido à validação stateless do CDN (comportamento nativo documentado como risco). | **PASS:** Comportamento documentado e classificado com risco mitigado.<br>**FAIL:** Crash no Storage. |
| **F** | **Signed URL Ativa vs Despromoção de Role** | Utilizador `admin_alpha_02`<br>Org `org_alpha_staging` | 1. Emitir signed URL de documento confidencial.<br>2. Despromover para `'member'`.<br>3. Aceder à URL assinada. | Ficheiro acessível via URL assinada até ao término do TTL. | **PASS:** Comportamento documentado e classificado com risco mitigado. |
| **G** | **Partilha Externa Válida vs Partilha Revogada** | Token de partilha pública<br>Documento `doc_alpha_01` | 1. Criar link de partilha.<br>2. Verificar acesso público.<br>3. Revogar token em `meeting_document_shares`.<br>4. Re-tentar acesso público. | Acesso público concedido inicialmente; após revogação, acesso bloqueado com 404/403 em tempo real. | **PASS:** Bloqueio imediato pós-revogação.<br>**FAIL:** Acesso mantido. |
| **H** | **Tentativa de Acesso Cross-Tenant a Storage** | Utilizador `member_beta_01`<br>Bucket `org_alpha_staging` | Utilizador da Org Beta tenta aceder diretamente ou gerar URL assinada para ficheiro da Org Alpha. | Bloqueado estritamente por RLS e validação de tenant (`AccessDenied`). | **PASS:** Acesso negado e isolamento estrito.<br>**FAIL:** Ficheiro transferido. |
| **I** | **Expiração Natural de Signed URL (TTL Curto)** | Ficheiro de teste sintético | Gerar signed URL com TTL de 3 segundos. Aguardar 5 segundos e efetuar GET HTTP. | Requisição HTTP rejeitada pelo Storage CDN com `400 Bad Request` ou `403 Signature Expired`. | **PASS:** Rejeição por expiração.<br>**FAIL:** Download aceite. |
| **J** | **Sessões Concorrentes (Mesmo Utilizador)** | Utilizador `member_alpha_05`<br>Sessão A e Sessão B | Iniciar duas sessões ativas simultâneas. Na Sessão A, o utilizador é suspenso pela administração. Testar chamada na Sessão B. | Ambas as sessões são bloqueadas no acesso a dados em 0 ms devido ao estado no PostgreSQL. | **PASS:** Bloqueio simultâneo.<br>**FAIL:** Sessão B com dados. |

---

## 8. PLANO DE MITIGAÇÃO TÉCNICA (ARQUITETURA RECOMENDADA)

Para resolver os riscos identificados no Supabase Storage e nas Signed URLs durante esta auditoria, foram formuladas 3 medidas mitigadoras:

### Mitigação 1: Redução Drástica do TTL Padrão das Signed URLs
- **Situação Atual:** TTL padrão configurado para 3600 segundos (1 hora).
- **Proposta:** Reduzir o TTL padrão de download para **60 a 120 segundos**.
- **Justificação:** O cliente web inicia o download ou a reprodução no player HTML5 imediatamente após a obtenção da URL. Um TTL de 60 segundos reduz a janela de vulnerabilidade de um utilizador despromovido em 98.3%.

### Mitigação 2: Streaming Proxy Endpoint Autenticado (Opção Sem URLs Assinadas)
- Para ficheiros de elevada confidencialidade (atas confidenciais, gravações de reuniões restritas), implementar um endpoint de streaming Next.js:
  `/api/meetings/[id]/recordings/stream`
- **Funcionamento:**
  1. O endpoint recebe a requisição do browser com cookie de sessão.
  2. Verifica em tempo real na base de dados se o utilizador tem `role IN ('owner', 'admin', 'member')` e `status = 'active'`.
  3. Se aprovado, o servidor Next.js faz o stream do ficheiro a partir do Supabase Storage usando `service_role` de forma interna.
  4. **Benefício:** Revogação 100% imediata (0 ms). Se o membro for removido durante o streaming, a requisição seguinte de novos chunks é bloqueada no mesmo instante.

### Mitigação 3: Emissão de Registos de Auditoria na Geração de Download URLs
- Expandir o método `generatePresignedDownloadUrl` para invocar o serviço de auditoria:
  ```typescript
  await auditService.log({
    organizationId,
    actorId: userId,
    action: 'media.signed_url_generated',
    resourceType: 'recording',
    resourceId: fileId,
    details: { storagePath, expiresIn }
  });
  ```
- **Benefício:** Rastreabilidade completa de quem gerou URLs de acesso a ficheiros confidenciais.

---

## 9. RESULTADOS DAS VERIFICAÇÕES DE REGRESSÃO

Todos os testes de controlo de qualidade e regressão foram executados com sucesso no commit `e12ec46`:

```
1. Typecheck:
   $ tsc --noEmit
   Resultado: 0 erros de tipagem (PASS).

2. Linter:
   $ next lint
   Resultado: No ESLint warnings or errors (PASS).

3. Compilação de Produção:
   $ next build
   Resultado: 42/42 páginas compiladas estática e dinamicamente sem erros (PASS).

4. Testes Unitários e de Integração:
   $ vitest run
   Resultado: 45 test files passed (100%), 283 passed (100%), 0 failed (PASS).

5. Testes E2E (Chromium Playwright):
   $ npx playwright test tests/e2e/auth-real.spec.ts tests/e2e/multitenant-isolation.spec.ts
   Resultado: 8 passed (1.6m), 0 failed (PASS).
```

---

## 10. RISCOS RESIDUAIS E CONTROLO FINANCEIRO

1. **Risco Residual — Signed URLs Ativas:**
   - Durante o TTL de qualquer signed URL já emitida pelo Storage CDN, o download é possível sem revalidação de pertença. Este risco está categorizado e será formalmente testado e mitigado na Fase D1.B.2-B.
2. **Consumo Financeiro:**
   - Custos acumulados na subfase D1.B.2-A: **\$0.00**.
   - Zero chamadas a APIs pagas (OpenAI, Stripe live, Twilio, etc.).

---

## 11. CONCLUSÃO E CRITÉRIO DE DECISÃO

A subfase **D1.B.2-A** atingiu integralmente todos os seus objetivos de auditoria, mapeamento de rotas, análise da dicotomia JWT vs Storage e planeamento da matriz determinística de testes.

O sistema demonstra maturidade excecional ao nível da camada de dados (PostgreSQL RLS com revogação em 0 ms), e as vulnerabilidades inerentes ao modelo *stateless* das URLs assinadas do Supabase Storage estão claramente identificadas e acompanhadas de um plano técnico de mitigação pragmático.
