-- ==============================================================================
-- MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.B.1-A
-- SNAPSHOT PRÉ-MIGRAÇÃO 010 (ESTADO DAS TABELAS E FUNÇÕES RELEVANTES)
-- ==============================================================================
-- Projeto: ycxwomqqepetickmxxqj
-- Data: 2026-11-06T20:10:00Z
-- Alvo: Snapshot documental do estado pré-010 para fins de auditoria e contingência
-- ==============================================================================

-- 1. TABELAS DE QUOTAS E CONSUMO
-- public.organization_quota_reserves: criada na Migração 007
-- public.usage_ledger: criada na Migração 001
-- public.subscriptions: criada na Migração 001
-- public.plans: catálogo de 5 planos (free, pro, business, enterprise, starter)

-- 2. FUNÇÃO E TRIGGER ANTERIOR DE PROTEÇÃO DO OWNER
-- SELECT proname, prosrc FROM pg_proc WHERE proname = 'protect_last_owner';
-- Definida em 20261104000002_rls_policies.sql sem bloqueio FOR UPDATE.
-- Trigger: trg_protect_last_owner BEFORE UPDATE OR DELETE ON public.organization_members.

-- 3. ESTADO DAS RPCs DE QUOTA PRÉ-010
-- Nenhuma das seguintes RPCs existe atualmente no schema public:
-- - reserve_organization_quota
-- - release_organization_quota
-- - settle_organization_quota
-- Confirmação PGRST202 (404) obtida em 2026-11-06T20:09:43Z.

-- 4. ESTADO DA SUBSCRIÇÃO SINTÉTICA ALPHA (FIN-REC-01)
-- ID: 95034a46-8e5a-45dc-bf25-520009a48be2
-- Organização: 3f737a15-22e9-48d1-b7d9-7ae806a2d3fc
-- Plan ID atual: 225311b5-734e-495c-9c6c-a186b8375dcb (Enterprise)
-- Period Start: 2026-11-06T08:17:57.116543+00:00
-- Period End atual: 2099-12-31T23:59:59+00:00 (Adulterado em D1.A)
-- Plan ID Legítimo: ec6ea177-e266-49a7-bb74-b1c03a687fda (Free)
-- Period End Legítimo Original: 2026-12-06T06:14:27.712Z (30 dias após criação)
