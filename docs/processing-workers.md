# MEETWISE AI — Fila Assíncrona, Workers e Gestão de Quotas

## 1. Arquitetura da Fila e Ciclo de Vida do Job

O processamento de transcrições ocorre de forma assíncrona para garantir escalabilidade horizontal, resiliência contra lentidão externa e resposta rápida ao utilizador.

A tabela `public.processing_jobs` e a tabela `public.meetings` operam com a seguinte máquina de estados coordenada:

```
[Cliente inicia Transcrição]
             │
             ▼
       ┌───────────┐
       │  pending  │ (Validação de parâmetros)
       └─────┬─────┘
             │ Quota reservada em usage_ledger
             ▼
       ┌───────────┐
       │  queued   │ (meetings.status = 'queued')
       └─────┬─────┘
             │ Worker assume a execução
             ▼
       ┌───────────┐
       │processing │ (meetings.status = 'processing', attempts++)
       └─────┬─────┘
             │
      ┌──────┴──────┐
      │             │
      ▼ (Sucesso)   ▼ (Falha / Erro)
┌───────────┐ ┌───────────┐
│ completed │ │  failed   │
└───────────┘ └───────────┘
 - Persiste segmentos     - Regista last_error
 - Insere participantes   - Estorna quota (cancelled)
 - Liquida quota          - meetings.status = 'failed'
 - meetings.status = 'completed'
```

---

## 2. Protocolo de Reserva e Liquidação de Quotas

Para evitar consumo descontrolado ou contorno de limites de faturação durante picos de carga simultâneos, a gestão de minutos opera através de um protocolo em duas fases (Two-Phase Commit no Ledger):

1. **Fase 1: Reserva Prévia Atómica (`enqueueTranscriptionJob`):**
   - Calcula a duração estimada do ficheiro em minutos ($\lceil\text{tamanho} / (\text{bitrate} \times 60)\rceil$, mínimo 15 minutos).
   - Soma os minutos já consumidos (`settled`) e os minutos atualmente cativos (`reserved`) para a organização em `usage_ledger`.
   - Se o total exceder o limite do plano da organização (ex.: 45m para Free, 600m para Pro), rejeita a operação com `AppError(QUOTA_EXCEEDED)`.
   - Regista a reserva em `usage_ledger` com `status = 'reserved'` e `idempotency_key = transcribe_{meetingId}_{assetId}`.

2. **Fase 2: Liquidação Posterior (`processJob`):**
   - **Caso de Sucesso:**
     - Obtém a duração real devolvida pelo fornecedor de transcrição.
     - Calcula os minutos reais: $\text{minutosReais} = \max(1, \lceil\text{duraçãoSegundos} / 60\rceil)$.
     - Atualiza o registo em `usage_ledger` para `status = 'settled'`, ajustando a quantidade para `minutosReais` e gravando o custo apurado em `cost_cents_usd`.
   - **Caso de Falha:**
     - Caso o processamento falhe devido a erro de rede, formato de áudio ininteligível ou exceção do fornecedor, o registo de reserva no `usage_ledger` é atualizado para `status = 'cancelled'`.
     - Nenhum minuto é debitado da quota mensal do cliente.

---

## 3. Garantia de Idempotência

- A chave `idempotency_key` possui restrição de unicidade `UNIQUE` na base de dados (`idx_jobs_idempotency` e `idx_ledger_idempotency`).
- Cliques duplos na interface ou reenvios de pedidos HTTP não geram jobs duplicados nem deduzem quotas repetidamente.
- Tentativas de reenvio com a mesma chave realizam `UPSERT` seguro sem corrupção de estado.

---

## 4. Política de Tentativas e Resiliência

- Cada job possui um contador `attempts` e um teto `max_attempts = 3`.
- Erros transitórios de rede com o fornecedor STT permitem retry automático pelo worker.
- Erros permanentes (ex.: áudio sem stream legível ou formato corrompido) marcam o job como `failed` na primeira tentativa sem reprocessamentos inúteis.
