# MEETWISE AI — Plataforma SaaS de Inteligência Artificial para Reuniões

O **MEETWISE AI** é uma plataforma SaaS independente, multi-utilizador e multi-empresa desenhada para transformar gravações de reuniões (áudio/vídeo) em atas executivas homologáveis, resumos estratégicos, decisões fundamentadas e tarefas com prazos e responsáveis.

---

## 🚀 Pilares Técnicos Fundamentais

- **Independência Arquitetural Estrita:** Infraestrutura, banco de dados e credenciais 100% isoladas.
- **Fidelidade e Anti-Alucinação (*Verbatim Grounding*):** Toda deliberação e tarefa exige citação literal exata (*verbatim quote*) e timestamps de suporte da transcrição original. Itens ambíguos são sinalizados como `pending_validation`.
- **Isolamento Multi-Tenant via PostgreSQL RLS:** Isolamento garantido ao nível do motor relacional através de Row Level Security em todas as 20 tabelas com dados de clientes. Gatilhos de integridade impedem adulteração de `organization_id` e remoção do último proprietário.
- **Motor de Transcrição Otimizado para Português:** Camada agnóstica de provedores (`ITranscriptionService`), com Deepgram Nova-3 (Batch) como primário e Gladia Solaria como secundário/fallback, calibrados para variantes de Portugal, Angola e Brasil.
- **Motor de Inteligência de Reuniões Multi-LLM:** Suporte multi-provedor (`ILLMService` para OpenAI GPT-4o, Google Gemini 2.0 Flash, Anthropic Claude 3.5 Sonnet e Mock determinístico) com chunking inteligente, defesas XML contra prompt injection e estimativa de quotas.
- **Extração Verificável de Decisões e Tarefas:** 6 estados de decisão (`approved_decision`, `proposed_decision`, `discussed_decision`, `rejected_decision`, `deferred_decision`, `pending_validation`) e 3 naturezas de tarefa com vinculação estrita a citações literais da transcrição.
- **Workflow de Revisão Humana e Auditoria Imutável:** Máquina de estados de ata (`draft_ai` → `pending_review` → `validated_human` / `rejected_human` → `final_signed`), versionamento sequencial com diff e trilha completa em `audit_logs`.
- **Exportação Profissional Cross-Format (DOCX, PDF, TXT):** Geração determinística baseada no Modelo Canónico (`CanonicalMeetingDocument`), com OpenXML nativo (`docx`), PDFs vectoriais A4 com paginação em 2 passos ("Página X de Y" via `pdfkit`) e exportação UTF-8 formatada a 80 colunas.
- **Colaboração Controlada, OCC e Partilha Criptográfica SHA-256:** Numeração atómica sequencial por organização (`public.get_next_document_number`), controlo de concorrência otimista (prevenção de conflitos via HTTP 409), comentários com ciclo de vida e links de partilha pública gerados com tokens de 256 bits guardados sob hash SHA-256.
- **Monetização Multi-Moeda & Catálogo Comercial SaaS:** 5 planos comerciais (`free`, `starter`, `pro`, `business`, `enterprise`) com preços versionados por moeda (`AOA`, `USD`, `EUR`, `BRL`) em unidades menores inteiras (*minor units*).
- **Provedores de Pagamento Desacoplados & Mercado Angolano:** Adaptador agnóstico com suporte para `MockPaymentProvider`, `StripePaymentProvider` (mercados globais) e `MulticaixaProxyPaymentProvider` (EMIS / Multicaixa Express / GPO / BAI Directo para Kwanza/AOA).
- **Checkout Seguro & Webhooks Idempotentes:** Resolução de preço exclusiva no servidor, expiração de 30 minutos, validação HMAC SHA-256 de *raw body* e prevenção de ataques de repetição em `payment_events`.
- **Livro-Razão Financeiro de Partidas Dobradas:** Separação entre uso operacional e livro financeiro (`financial_ledger_entries`) com invariante estrita $\sum \text{Débitos} == \sum \text{Créditos}$ e gatilhos de imutabilidade.
- **Reservas Atómicas de Quotas (Two-Phase):** Prevenção de concorrência com reservas em `organization_quota_reserves`, liquidação pós-sucesso e libertação automática em falhas.
- **FinOps & Rastreio de Custos de IA:** Telemetria de chamadas STT/LLM em `ai_provider_requests`, cálculo em tempo real de margens brutas por organização e alertas de margem baixa (<60%).
- **Painel Administrativo Central & Auditoria Mandatória:** Suite completa em `/admin/*` exigindo justificação com no mínimo 10 caracteres para qualquer intervenção em contas de clientes gravada em `public.audit_logs`.
- **Suíte Abrangente de Testes Automatizados:** 220 testes automatizados (100% PASS) em 42 ficheiros cobrindo unitários, integração de IA, validação heurística, RLS multi-tenant no PostgreSQL real (PGlite), geração e paridade de documentos DOCX/PDF/TXT, partidas dobradas, webhooks e segurança de pagamentos.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend & Backend API:** Next.js (App Router, Server Components & Server Actions)
- **Linguagem & Tipagem:** TypeScript em modo estrito (`strict: true`)
- **Estilos:** Tailwind CSS
- **Validação de Esquemas:** Zod
- **Banco de Dados & Autenticação:** Supabase PostgreSQL com RLS e Supabase Auth
- **Armazenamento:** Supabase Storage (Buckets Privados com Presigned URLs)
- **Testes Automatizados:** Vitest
- **Linting & Code Quality:** ESLint

---

## 📁 Estrutura de Diretórios Modular

```text
meetwise-ai/
├── docs/                     # Documentação de arquitetura, segurança e schemas
├── src/
│   ├── app/                  # Rotas Next.js (App Router)
│   ├── config/               # Validação Zod de variáveis de ambiente
│   ├── lib/
│   │   ├── errors/           # Erros centralizados (AppError) e respostas padronizadas
│   │   ├── logger/           # Logger estruturado com IDs de correlação e sanitização
│   │   ├── security/         # Assinaturas HMAC, proteção anti-prompt injection e rate limiting
│   │   └── supabase/         # Clientes de browser, servidor, admin e tipos do banco
│   └── modules/              # Domínios de negócio isolados
│       ├── auth/             # Matriz RBAC e regras de privilégios
│       ├── organizations/    # Gestão de empresas, membros e proteção do último owner
│       ├── meetings/         # Ciclo de vida e máquina de estados de reuniões
│       ├── media/            # Validação MIME, limites (500MB) e caminhos isolados
│       ├── transcription/    # Contrato ITranscriptionService e adaptadores
│       ├── ai/               # Contrato ILLMService e defesas anti-injeção
│       ├── minutes/          # Modelos de ata e workflow de revisão humana
│       ├── decisions/        # Validador heurístico de citação verbatim
│       ├── tasks/            # Gestão e atribuição de ações com prazos
│       ├── documents/        # Modelo Canónico, exportadores (DOCX/PDF/TXT), versionamento e partilha
│       ├── billing/          # Livro de consumo idempotente e planos
│       ├── administration/   # Auditoria técnica e métricas do sistema
│       └── audit/            # Registo imutável de eventos de auditoria
└── supabase/
    └── migrations/           # Migrações SQL versionadas (Tabelas, RLS e Storage)
```

---

## ⚙️ Instalação e Execução Local

### Pré-requisitos
- Node.js >= 20
- pnpm >= 9

### Passo a Passo
1. Clone o repositório e instale as dependências:
   ```bash
   pnpm install
   ```
2. Configure as variáveis de ambiente:
   ```bash
   cp .env.example .env.local
   ```
3. Execute a verificação de tipos e suite de testes:
   ```bash
   pnpm run typecheck
   pnpm test
   ```
4. Execute o linter e o build de produção:
   ```bash
   pnpm run lint
   pnpm run build
   ```
5. Inicie o servidor em modo de desenvolvimento:
   ```bash
   pnpm dev
   ```

---

## 📚 Documentação Técnica Adicional
Consulte a pasta [`docs/`](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs) para guias aprofundados sobre:

### Fase 1 a 3 (Fundação, Interface e Transcrição)
- [Arquitetura Geral](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/architecture.md)
- [Esquema do Banco de Dados](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/database-schema.md)
- [Modelo de Segurança e RBAC](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/security-model.md)
- [Políticas RLS](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/rls-policies.md)
- [Configuração de Ambientes](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/environment-setup.md)
- [Estratégia de Testes](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/testing.md)
- [Relatório da Fase 1](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/phase-1-report.md)
- [Relatório da Fase 2](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/phase-2-report.md)
- [Relatório da Fase 3](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/phase-3-report.md)

### Fase 4 (Inteligência de Reuniões, Atas, Decisões e Validação Humana)
- [Relatório da Fase 4](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/phase-4-report.md)
- [Arquitetura de Inteligência de Reuniões](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/meeting-intelligence-architecture.md)
- [Provedores LLM & Adapters Multi-Cloud](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/llm-providers.md)
- [Geração de Atas & Modelos Customizados](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/minutes-generation.md)
- [Extração & Classificação de Decisões Grounded](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/decision-extraction.md)
- [Extração de Tarefas & Gestão de Ações](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/task-extraction.md)
- [Sistema Anti-Alucinação & Validação Verbatim](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/evidence-validation.md)
- [Fluxo de Revisão Humana & Auditoria Imutável](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/human-review-workflow.md)
- [Auditoria de Segurança & Multi-Tenancy RLS Fase 4](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/phase-4-security-audit.md)
- [Avaliação de Qualidade e Confiabilidade de IA](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/phase-4-ai-quality-evaluation.md)
- [Modelo Financeiro & Custos de Inferência LLM](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/phase-4-cost-model.md)

### Fase 5 (Exportação Profissional, Colaboração, Versionamento e Segurança)
- [Relatório Técnico da Fase 5](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/phase-5-report.md)
- [Arquitetura de Geração Documental](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/document-generation-architecture.md)
- [Especificação do Exportador DOCX](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/docx-export.md)
- [Especificação do Exportador PDF Vectorial](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/pdf-export.md)
- [Sistema de Templates de Documentos](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/document-templates.md)
- [Versionamento e Controlo de Concorrência (OCC)](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/document-versioning.md)
- [Colaboração Segura e Ciclo de Comentários](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/document-collaboration.md)
- [Partilha Criptográfica SHA-256 e Segurança](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/document-sharing-security.md)
- [Auditoria de Segurança Técnica Fase 5](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/phase-5-security-audit.md)
- [Homologação de Integrações](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/phase-5-integration-homologation.md)
- [Resultados dos Testes Automatizados (187 PASS)](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/phase-5-test-results.md)

### Fase 6 (Monetização SaaS, Subscrições, Pagamentos, Quotas e Consola Admin)
- [Relatório Técnico e Executivo da Fase 6](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/phase-6-report.md)
- [Arquitetura de Faturação e Monetização](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/billing-architecture.md)
- [Ciclo de Vida & Máquina de Estados de Subscrições](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/subscription-lifecycle.md)
- [Integração de Provedores (Stripe, Multicaixa, Mock)](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/payment-provider-integration.md)
- [Segurança do Motor de Checkout](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/checkout-security.md)
- [Processamento Idempotente de Webhooks](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/webhook-processing.md)
- [Livro-Razão Financeiro de Partidas Dobradas](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/financial-ledger.md)
- [Gestão de Quotas e Reservas Atómicas (Two-Phase)](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/usage-and-entitlements.md)
- [FinOps e Contabilidade Analítica de Custos de IA](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/ai-cost-accounting.md)
- [Consola Administrativa & Protocolo de Justificação](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/admin-dashboard.md)
- [Auditoria de Segurança e RLS Fase 6](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/phase-6-security-audit.md)
- [Homologação em Sandbox e Simulações](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/phase-6-sandbox-homologation.md)
- [Registo de Riscos Pendentes e Regulamentares](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/phase-6-pending-risks.md)
- [Resultados dos Testes Automatizados (220 PASS)](file:///c:/Users/HP/Downloads/MEETWISE%20AI/docs/phase-6-test-results.md)
