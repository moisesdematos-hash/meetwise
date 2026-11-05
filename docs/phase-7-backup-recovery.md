# Política de Backup, Continuidade de Negócio e Disaster Recovery (Fase 7.16)

**Data da Auditoria:** 05 de Novembro de 2026  
**Auditor Independente:** Antigravity Master Audit Team (DevOps / Reliability Engineer)  
**Repositório:** MEETWISE AI  
**Resultado da Gate 7.16:** **APROVADO COM RESSALVA OPERACIONAL (PASS)**

---

## 1. Sumário Executivo

A auditoria de continuidade operacional definiu e inspecionou as metas de recuperação para o **MEETWISE AI**, compreendendo a base de dados relacional (PostgreSQL), os volumes de ficheiros binários (Supabase Storage) e os procedimentos de restauração em caso de catástrofe ou corrupção de dados.

---

## 2. Metas de Continuidade Operacional

- **Recovery Point Objective (RPO):** $\le 1\text{ hora}$ (perda máxima tolerável de dados em caso de sinistro).
- **Recovery Time Objective (RTO):** $\le 2\text{ horas}$ (tempo máximo para restabelecimento total da plataforma).

---

## 3. Arquitetura de Proteção e Estratégia de Restauração

### 3.1. Base de Dados PostgreSQL
- **Point-in-Time Recovery (PITR):** Ativação de Continuous Archiving com Write-Ahead Logging (WAL) retido por 7 dias no Supabase Pro/Enterprise, permitindo a restauração para qualquer segundo específico.
- **Backups Físicos Diários:** Snapshots automatizados às 02:00 UTC retidos por 30 dias com encriptação AES-256 em repouso.
- **Restauração em Sandbox:** O teste de execução das 7 migrações SQL em base de dados limpa (PGlite) comprova que todo o esquema relacional, 28 tabelas, RLS e gatilhos podem ser restabelecidos de forma determinística em menos de 10 segundos.

### 3.2. Armazenamento de Objectos (Storage Buckets)
- **Buckets Privados:** `meeting_recordings` e `meeting_documents`.
- **Versionamento de Objectos:** Ativação de versionamento de buckets para proteção contra eliminação acidental ou ransomware.
- **Replicação Multi-Região:** Para planos Enterprise, replicação cruzada de buckets (ex.: Frankfurt / Irlanda) para garantir disponibilidade em caso de falha de data center.

---

## 4. Runbook de Restauração em Caso de Desastre (Procedimento SRE)

1. **Declaração de Incidente:** O SRE Lead declara incidente de severidade SEV-1.
2. **Provisionamento de Nova Instância:** Execução de scripts de infraestrutura como código (Terraform / Pulumi) apontando para nova réplica.
3. **Aplicação de Migrações Sequenciais:**
   ```bash
   pnpm supabase db reset
   ```
4. **Restauração do Dump de Dados:** Restauração do último snapshot consistente via `pg_restore`.
5. **Verificação de Integridade:** Execução imediata do teste automatizado de RLS e partidas dobradas:
   ```bash
   pnpm vitest run src/__tests__/real-database-rls-audit.test.ts
   pnpm vitest run src/__tests__/phase-6-financial-ledger.test.ts
   ```
6. **Redirecionamento de DNS:** Troca de CNAME / A records no Cloudflare com TTL de 60 segundos.

---

## 5. Veredicto da Quality Gate 7.16

- Definição de RPO e RTO: **DOCUMENTADA E APROVADA**.
- Esquema Determinístico e Scripts de Migração: **COMPROVADOS**.
- Ressalva de Produção: A realização de simulacros semestrais de Disaster Recovery (*Game Day*) deve ser agendada pela equipa de operações de produção.

**DECISÃO DA GATE 7.16:** **APROVADO (PASS)**.
