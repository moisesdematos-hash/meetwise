# Segurança do Mecanismo de Checkout (Fase 6)

## 1. Princípios de Segurança e Vetores de Ameaça

O motor de checkout (`src/modules/billing/checkout-service.ts`) foi concebido para neutralizar ameaças clássicas em SaaS de subscrições:
1. **Adulteração de Preço no Cliente (Price Tampering):** O cliente tenta injetar um preço menor ou manipular parâmetros de desconto na requisição HTTP.
2. **Replay de Sessão e Sessões Fantasma:** Reutilização de sessões antigas ou sessões com tempo de vida infinito.
3. **Sequestro de Organização (Cross-Tenant Hijack):** Tentativa de criar checkout associando o pagamento a outra organização sem autorização RBAC.
4. **Vazamento de Dados de Pagamento (PCI-DSS Scope):** Trânsito indevido de números de cartão ou CVV pelo servidor da aplicação.

---

## 2. Medidas de Mitigação Implementadas

### A. Resolução Exclusiva de Preço no Servidor
O endpoint de checkout (`POST /api/billing/checkout`) recusa estritamente qualquer campo `amount` ou `price` enviado no corpo da requisição:
```typescript
// Contrato de Requisição
interface CreateCheckoutRequest {
  organizationId: string;
  priceId: string; // Apenas o identificador
  successUrl: string;
  cancelUrl: string;
}
```
O serviço localiza o preço em `public.plan_prices` através de `priceId`, confirmando que:
- O preço está ativo (`is_active = true`).
- A moeda e o plano existem e são válidos.
- O montante em unidades menores (`amount_minor_units`) provém diretamente da base de dados protegida.

### B. Expiração Mandatória de Sessão (30 Minutos)
Toda a sessão de checkout gerada é gravada em `public.checkout_sessions` com:
```sql
expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes')
```
Sessões apresentadas após 30 minutos são rejeitadas como `CHECKOUT_EXPIRED`.

### C. Isolamento de Tenant e RBAC
Apenas utilizadores com papéis `owner`, `admin` ou `billing_manager` na organização têm autorização para invocar a criação de sessões de checkout. A validação é garantida pelo módulo `src/modules/auth/index.ts`:
```typescript
assertOrganizationPermission(actorRole, 'billing:manage');
```

### D. Conformidade PCI-DSS (Zero Cardholder Data Storage)
O **MEETWISE AI** não processa, armazena nem transmite números primários de conta (PAN), datas de validade de cartões nem códigos de segurança CVV/CVC nos seus servidores. O fluxo de recolha de dados de cartão é delegado integralmente aos elementos seguros hospedados pelos fornecedores (Stripe Elements / EMIS Multicaixa Proxy).
