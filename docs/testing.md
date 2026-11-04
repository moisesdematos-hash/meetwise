# Guia de Testes Automatizados e Garantia da Qualidade

O MEETWISE AI adota uma estratégia de testes automatizados abrangente para garantir estabilidade, isolamento multi-tenant e proteção anti-alucinação.

---

## 1. Estrutura da Suite de Testes

Os testes estão organizados em `src/__tests__/`:

| Arquivo de Teste | Domínio Coberto | Total de Testes |
| :--- | :--- | :---: |
| `sql-schema-and-rls.test.ts` | Validação estrita das 20 tabelas, migrações versionadas, RLS, triggers anti-tamper e proteção do último owner. | 7 |
| `rbac-and-security.test.ts` | Matriz RBAC para todos os 5 papéis (`owner`, `admin`, `manager`, `member`, `viewer`) e bloqueio de escalada de privilégios. | 7 |
| `meetings-and-media.test.ts` | Máquina de estados das reuniões, validação de formatos MIME (MP3/WAV/M4A/MP4), limite de 500MB e isolamento de caminhos. | 7 |
| `anti-hallucination-decisions.test.ts` | Validador determinístico de citação verbatim (*Verbatim Grounding*), rejeição de deliberações inventadas e workflow de atas. | 6 |
| `env-and-errors.test.ts` | Status codes do `AppError`, respostas padronizadas com correlation ID, verificação de webhooks HMAC e rate limiting. | 8 |
| `billing-and-idempotency.test.ts` | Limites dos planos, precificação por minuto, simulador de idempotência e reversão atómica de quota reservada. | 4 |
| **Total Geral** | | **39 Testes** |

---

## 2. Comandos de Execução

```bash
# Executa todos os testes automatizados uma vez
pnpm test

# Executa testes em modo de observação contínua (watch)
pnpm run test:watch

# Executa verificação rigorosa de tipos TypeScript
pnpm run typecheck

# Executa validação de regras de linting ESLint
pnpm run lint

# Executa build completo de produção
pnpm run build
```

---

## 3. Critérios de Aprovação de CI/CD
- **100% de Aprovação:** Nenhum teste falhado (`0 FAIL`).
- **Zero Warnings Críticos:** Lint e Typecheck sem erros ou tipos implícitos `any`.
