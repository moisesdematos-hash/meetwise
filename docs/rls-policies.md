# Políticas de Row Level Security (RLS)

O MEETWISE AI aplica políticas de Row Level Security (RLS) em 100% das tabelas que contêm dados organizacionais para garantir isolamento multi-tenant intransponível.

---

## 1. Função Central de Autorização: `current_user_org_ids()`

```sql
CREATE OR REPLACE FUNCTION public.current_user_org_ids()
RETURNS TABLE (org_id UUID, role TEXT) 
LANGUAGE sql STABLE SECURITY DEFINER 
SET search_path = public, auth, pg_temp AS $$
  SELECT organization_id, role 
  FROM public.organization_members 
  WHERE user_id = auth.uid() AND status = 'active';
$$;
```

### Características de Segurança:
- **`SECURITY DEFINER`:** Executa com permissões elevadas para consultar `organization_members` sem gerar recursão infinita de políticas RLS.
- **`SET search_path = public, auth, pg_temp`:** Impede ataques de sequestro de caminho de busca (*search_path injection*).
- **`REVOKE FROM PUBLIC`:** Apenas papéis autenticados (`authenticated`) e o backend de serviço (`service_role`) podem invocar a função.

---

## 2. Resumo das Políticas por Tabela

| Tabela | Operação | Regra / Expressão RLS |
| :--- | :--- | :--- |
| `organizations` | SELECT | `id IN (SELECT org_id FROM current_user_org_ids())` |
| `organizations` | INSERT | `created_by = auth.uid()` |
| `organizations` | UPDATE | `id IN (SELECT org_id FROM current_user_org_ids() WHERE role IN ('owner', 'admin'))` |
| `organizations` | DELETE | `id IN (SELECT org_id FROM current_user_org_ids() WHERE role = 'owner')` |
| `meetings` | SELECT | `organization_id IN (SELECT org_id FROM current_user_org_ids())` |
| `meetings` | INSERT | `organization_id IN (SELECT org_id FROM current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member')) AND created_by = auth.uid()` |
| `meetings` | UPDATE | `organization_id IN (SELECT org_id FROM current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member'))` |
| `meetings` | DELETE | `organization_id IN (SELECT org_id FROM current_user_org_ids() WHERE role IN ('owner', 'admin'))` |
| `transcript_segments` | SELECT | `organization_id IN (SELECT org_id FROM current_user_org_ids())` |
| `transcript_segments` | ALL | `organization_id IN (SELECT org_id FROM current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member'))` |
| `meeting_minutes` | SELECT | `organization_id IN (SELECT org_id FROM current_user_org_ids())` |
| `meeting_minutes` | ALL | `organization_id IN (SELECT org_id FROM current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member'))` |
| `meeting_decisions` | ALL | `organization_id IN (SELECT org_id FROM current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member'))` |
| `meeting_tasks` | ALL | `organization_id IN (SELECT org_id FROM current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member'))` |
| `media_assets` | SELECT | `organization_id IN (SELECT org_id FROM current_user_org_ids())` |
| `media_assets` | INSERT | `organization_id IN (SELECT org_id FROM current_user_org_ids() WHERE role IN ('owner', 'admin', 'manager', 'member'))` |
| `media_assets` | DELETE | `organization_id IN (SELECT org_id FROM current_user_org_ids() WHERE role IN ('owner', 'admin'))` |
| `usage_ledger` | SELECT | `organization_id IN (SELECT org_id FROM current_user_org_ids())` |
| `audit_logs` | SELECT | `organization_id IN (SELECT org_id FROM current_user_org_ids() WHERE role IN ('owner', 'admin'))` |
| `audit_logs` | INSERT | `organization_id IN (SELECT org_id FROM current_user_org_ids())` (Append-Only) |

---

## 3. Imutabilidade e Proteção contra Tenant-Tampering

Todas as tabelas de dados de reuniões possuem o seguinte gatilho ativado:

```sql
CREATE TRIGGER trg_tamper_meetings
BEFORE UPDATE ON public.meetings
FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_tamper();
```

Caso um invasor autenticado tente alterar o campo `organization_id` de um recurso para transferi-lo para outra organização, o banco de dados rejeita a operação com erro de segurança.
