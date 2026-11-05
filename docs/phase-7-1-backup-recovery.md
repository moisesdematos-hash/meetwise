# MEETWISE AI — PLANO DE RECUPERAÇÃO DE DESASTRES, BACKUP & CONTINUIDADE DE NEGÓCIO
## ETAPA 7.1.9: RPO, RTO, POINT-IN-TIME RECOVERY (PITR) E RUNBOOK DE DESASTRE
**Data da Auditoria:** 2026-11-05  
**Fase:** 7.1 — Real Integration Homologation & Launch Blockers Closure 1.0  
**Status do Portão 7.1.9:** **PASS (Políticas RPO/RTO e Procedimento Operacional Padrão Estabelecidos)**

---

## 1. OBJETIVOS DE CONTINUIDADE (RPO & RTO)

| Métrica | Meta Operacional | Estratégia Técnica |
| :--- | :--- | :--- |
| **Recovery Point Objective (RPO)** | **< 15 minutos** | Arquivamento contínuo de Write-Ahead Logging (WAL) com Point-In-Time Recovery (PITR) no Supabase / PostgreSQL. |
| **Recovery Time Objective (RTO)** | **< 60 minutos** | Infraestrutura como código, migrações SQL idempotentes e recuperação automatizada de snapshots de base de dados. |

---

## 2. ARQUITETURA DE CÓPIAS DE SEGURANÇA (BACKUPS)

1. **Backups Contínuos (PITR):**
   - Transações registadas nos ficheiros WAL e enviadas a cada 60 segundos para armazenamento imutável redundante (S3/GCS com versionamento e WORM - *Write Once, Read Many*).
2. **Backups Lógicos Diários:**
   - Dump diário às 02:00 UTC via `pg_dump --format=custom --no-owner --clean`.
   - Criptografia em repouso com chave simétrica AES-256 gerida via KMS.
3. **Redundância de Mídia (Storage Buckets):**
   - Ficheiros de áudio e atas geradas no Supabase Storage configurados com replicação geográfica multi-região (ex: Frankfurt `eu-central-1` replicado para Irlanda `eu-west-1`).

---

## 3. RUNBOOK DE RECUPERAÇÃO DE DESASTRE (DISASTER RECOVERY)

No caso de corrupção massiva da base de dados, incidente de ransomware ou colapso da região do centro de dados:

### Passo 1: Notificação e Congelamento de Tráfego
1. Ativar página de manutenção estática no Cloudflare / CDN:
   ```bash
   # Redirecionar tráfego para página informativa de manutenção
   wrangler pages publish ./maintenance-static
   ```
2. Bloquear novas transações na aplicação revogando tokens temporários.

### Passo 2: Restauração da Base de Dados PostgreSQL
1. Se disponível PITR, selecionar o carimbo temporal exato anterior ao incidente ($t_{\text{incidente}} - 60\text{s}$):
   ```bash
   # Via Supabase CLI ou Dashboard Cloud
   supabase db restore --timestamp="2026-11-05T08:00:00Z"
   ```
2. Se executando a partir do dump diário:
   ```bash
   pg_restore --clean --if-exists -d meetwise_production backup_20261105_0200.dump
   ```

### Passo 3: Validação da Integridade dos Dados
1. Executar a rotina de verificação de sanidade:
   ```sql
   -- Verificar consistência do General Ledger
   SELECT
     SUM(CASE WHEN entry_type = 'debit' THEN amount_cents ELSE 0 END) AS total_debits,
     SUM(CASE WHEN entry_type = 'credit' THEN amount_cents ELSE 0 END) AS total_credits
   FROM public.financial_ledger;
   -- O resultado de total_debits DEVE ser igual a total_credits.
   ```
2. Confirmar integridade das 20 tabelas e ausência de bloqueios em `organization_quotas`.

### Passo 4: Retoma dos Serviços e Reabertura do Tráfego
1. Reativar o tráfego de utilizadores gradualmente (canary release 10%, 50%, 100%).
2. Monitorizar métricas de latência e taxas de erro HTTP na consola SRE.
