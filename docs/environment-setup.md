# Guia de Configuração de Ambientes e Variáveis

Este documento descreve como configurar os ambientes de desenvolvimento, testes e produção do MEETWISE AI.

---

## 1. Separação de Variáveis (Client-Side vs. Server-Side)

### Variáveis Públicas (Acessíveis no Navegador com prefixo `NEXT_PUBLIC_`)
- `NEXT_PUBLIC_APP_URL`: URL base da aplicação (ex: `http://localhost:3000` ou `https://app.meetwise.ai`).
- `NEXT_PUBLIC_SUPABASE_URL`: Endpoint da API do projeto Supabase.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Chave anónima pública com RLS restrito.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`: Chave pública do Stripe para elementos de checkout.

### Variáveis Privadas (EXCLUSIVAS do Servidor / Workers — NUNCA expor no Frontend)
- `SUPABASE_SERVICE_ROLE_KEY`: Chave com bypass de RLS para tarefas administrativas e workers.
- `SUPABASE_DB_URL`: String de conexão direta com o PostgreSQL para migrações.
- `DEEPGRAM_API_KEY`: Credencial do motor primário de transcrição Speech-to-Text.
- `GLADIA_API_KEY`: Credencial do motor secundário/fallback de STT.
- `GOOGLE_AI_API_KEY`: Chave da API do Google Gemini para LLM de grande contexto.
- `ANTHROPIC_API_KEY`: Chave da API Anthropic para Claude 3.5 Sonnet.
- `OPENAI_API_KEY`: Chave da API OpenAI (fallback).
- `MEETWISE_WEBHOOK_SECRET`: Chave secreta de no mínimo 32 caracteres para assinatura HMAC SHA-256 de webhooks internos.
- `STRIPE_SECRET_KEY` & `STRIPE_WEBHOOK_SECRET`: Chaves privadas de faturamento.

---

## 2. Validação Automática via Zod

Todas as variáveis são estritamente validadas na inicialização do servidor através do módulo `src/config/env.ts`.

Se uma variável essencial estiver ausente ou incorreta:
- A aplicação falha imediatamente no início (*fail-fast*).
- O erro é registado de forma clara no terminal sem exibir os valores dos segredos.

---

## 3. Arquivo de Modelo: `.env.example`
O repositório inclui o template `.env.example` versionado. O arquivo `.env.local` está incluído no `.gitignore` para impedir que segredos reais sejam acidentalmente comitados.
