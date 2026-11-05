# Partilha Segura e Modelo Criptográfico — MEETWISE AI

**Fase:** Fase 5 — Exportação Profissional, Colaboração Segura e Gestão Documental  
**Versão:** 5.0  
**Data:** 05 de Novembro de 2026  
**Módulo:** `src/modules/documents/sharing-service.ts`

---

## 1. Visão Geral

A partilha de atas confidenciais com partes externas (como advogados, membros convidados, auditores externos ou acionistas) exige um nível de proteção criptográfica rigoroso. 

O MEETWISE AI adota a mesma arquitetura de segurança zero-knowledge utilizada em sistemas bancários e plataformas de gestão de segredos: **Tokens Criptograficamente Aleatórios de 256 bits com Armazenamento Exclusivo por Hash SHA-256**.

---

## 2. Arquitetura de Proteção do Token de Partilha

### A Falha Comum em Sistemas SaaS Convencionais
Muitos sistemas geram links de partilha guardando a chave secreta em texto claro na base de dados (`SELECT token FROM shares`). Se a base de dados for comprometida ou exposta num backup, todos os links de partilha da plataforma são imediatamente violados.

### A Solução no MEETWISE AI
1. **Geração Criptográfica Forte:**
   Um token de alta entropia (32 bytes = 256 bits) é gerado via `crypto.randomBytes(32).toString('hex')`.
2. **Entrega Única (*One-Time Exposure*):**
   O token em texto claro só é retornado uma única vez para o utilizador que gerou a partilha para que possa copiar o link (`https://app.meetwise.ai/p/doc/<TOKEN>`).
3. **Persistência Exclusiva do Digest SHA-256:**
   Apenas o hash SHA-256 do token é gravado na tabela `public.meeting_document_shares`:
   ```sql
   token_hash VARCHAR(64) NOT NULL UNIQUE
   ```
4. **Validação na Requisição Pública:**
   Quando um utilizador externo acede ao link:
   - O servidor recebe o `<TOKEN>` pela rota pública `/api/public/documents/[token]`.
   - O servidor computa imediatamente `hash = sha256(token)`.
   - Executa a consulta `SELECT * FROM meeting_document_shares WHERE token_hash = hash`.
   - Mesmo que um invasor tenha acesso integral de leitura à base de dados, é matematicamente inviável reverter o hash SHA-256 para obter o token original.

---

## 3. Controlo de Acesso e Ciclo de Vida da Partilha

Cada link de partilha configurado suporta os seguintes parâmetros de segurança:

| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| `permission` | `read_only` / `comment` | Permite apenas leitura do documento ou envio de notas |
| `expires_at` | `TIMESTAMPTZ` | Data/hora de expiração compulsória (ex: 24h, 7 dias, 30 dias) |
| `max_uses` | `INTEGER` | Limite máximo de acessos permitidos (ex: partilha de uso único) |
| `is_revoked` | `BOOLEAN` | Revogação instantânea com um clique pelo proprietário |
| `access_count` | `INTEGER` | Contador atómico de acessos efetuados |
| `last_accessed_at`| `TIMESTAMPTZ` | Carimbo temporal do último acesso realizado |

---

## 4. Fluxo de Validação no Acesso Público

```
External User Request
       │
       ▼ (GET /api/public/documents/[rawToken])
Compute SHA-256 Hash of rawToken
       │
       ▼
Query meeting_document_shares WHERE token_hash = hash
       │
       ├──► Link Inexistente? ──────────► 404 Not Found
       ├──► is_revoked == true? ────────► 403 Forbidden (Link revogado)
       ├──► expires_at < now()? ────────► 410 Gone (Link expirado)
       ├──► access_count >= max_uses? ──► 403 Forbidden (Limite excedido)
       │
       ▼
Increment access_count & set last_accessed_at (Atomic RPC)
Log Public Access in audit_logs (Sanitized IP & User-Agent)
Render Canonical Document in Read-Only Mode
```

---

## 5. Prevenção de Fuga de Dados e Enumeração

- **Taxa de Limitação (Rate Limiting):** A rota pública `/api/public/documents/[token]` possui limitação de taxa por IP para impedir ataques de força bruta contra os tokens.
- **Espaço de Busca:** Com 256 bits de entropia ($2^{256} \approx 1.15 \times 10^{77}$ combinações), uma busca exaustiva por força bruta é computacionalmente impossível.
- **Isolamento de Tenant:** O acesso por token apenas devolve os dados estritamente necessários para visualização da ata, sem expor metadados internos da organização.
