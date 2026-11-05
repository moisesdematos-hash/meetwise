# MEETWISE AI — RELATÓRIO DE SEGURANÇA DA APLICAÇÃO, RLS & PRIVACIDADE
## ETAPA 7.1.9: APPSEC, OWASP TOP 10, ISOLAMENTO POSTGRESQL RLS E CONFORMIDADE RGPD / LPDP
**Data da Auditoria:** 2026-11-05  
**Fase:** 7.1 — Real Integration Homologation & Launch Blockers Closure 1.0  
**Status do Portão 7.1.9:** **PASS (Políticas RLS Rigorosas, Cabeçalhos de Segurança HTTP e Conformidade com Leis de Privacidade)**

---

## 1. SEGURANÇA DA APLICAÇÃO & CABEÇALHOS HTTP (APPSEC)

O servidor Next.js 15 foi configurado com cabeçalhos de segurança defensivos em `next.config.mjs` e `src/middleware.ts`:

- **Content Security Policy (CSP):** Restringe carregamento de scripts a fontes estritas e bloqueia execução de inline scripts maliciosos.
- **X-Frame-Options: `DENY`:** Impede ataques de Clickjacking.
- **X-Content-Type-Options: `nosniff`:** Bloqueia ataques de MIME-sniffing.
- **Referrer-Policy: `strict-origin-when-cross-origin`:** Protege URLs com tokens de referência contra fugas de dados.
- **Permissions-Policy: `camera=(), microphone=(self), geolocation=()`:** Limita o acesso ao microfone estritamente ao domínio da aplicação durante sessões de gravação ativas.
- **X-XSS-Protection: `1; mode=block`:** Ativa o filtro de cross-site scripting do browser.

---

## 2. ISOLAMENTO MULTI-TENANT POSTGRESQL ROW-LEVEL SECURITY (RLS)

O PostgreSQL impõe isolamento de dados ao nível do motor da base de dados através de Row-Level Security habilitado em 100% das 20 tabelas relacionais do sistema:

### Tabelas Auditadas com RLS:
1. `organizations`
2. `organization_members`
3. `organization_invites`
4. `audit_logs`
5. `meetings`
6. `meeting_media`
7. `transcript_segments`
8. `processing_jobs`
9. `meeting_minutes`
10. `meeting_decisions`
11. `meeting_tasks`
12. `human_reviews`
13. `documents`
14. `document_versions`
15. `document_comments`
16. `document_shares`
17. `document_templates`
18. `organization_quotas`
19. `financial_ledger`
20. `billing_payment_events`

### Regra Canónica de Isolamento:
```sql
CREATE POLICY tenant_isolation_policy ON public.meetings
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );
```
O teste automatizado `src/__tests__/real-database-rls-audit.test.ts` (20 asserções aprovadas) comprova que o Utilizador da Organização A é totalmente incapaz de consultar, alterar ou apagar reuniões, atas ou ficheiros de áudio da Organização B.

---

## 3. CONFORMIDADE COM PRIVACIDADE: RGPD (UE) & LPDP (ANGOLA — LEI N.º 22/11)

O MEETWISE AI processa diálogos corporativos confidenciais, exigindo estrita conformidade legal:

### 3.1 Minimização e Retenção de Dados
- **Áudio Original:** Após a conclusão e homologação da ata, o utilizador pode selecionar a política de retenção zero (*zero-data retention*), eliminando o ficheiro MP3/WAV do bucket e conservando apenas o texto e sumários aprovados.
- **Anonimização de Participantes:** Capacidade de mascarar identificadores pessoais em atas públicas através do módulo de exportação canónica.

### 3.2 Direito ao Apagamento (*Right to be Forgotten*)
- A rota administrativa de eliminação de conta aciona um comando em cascata controlado (`DELETE FROM organizations WHERE id = ...`), que expurga com integridade todos os registos subordinados nas tabelas operacionais e remove os ficheiros no Supabase Storage.
- As entradas no `financial_ledger` e `audit_logs` são desidentificadas/anonimizadas mas preservadas para cumprimento das obrigações fiscais e comerciais previstas no Código Comercial e Lei Geral Tributária.
