# MEETWISE AI — Modelo Económico e Custos de Transcrição (Fase 3)

## 1. Estrutura de Custos por Minuto de Áudio

O custo unitário de processamento de reuniões na Fase 3 decompõe-se nas seguintes componentes operacionais:

| Componente | Fornecedor / Infraestrutura | Custo Base | Custo por Minuto de Reunião |
| :--- | :--- | :--- | :--- |
| **STT Primário** | Deepgram Nova-3 (Diarização incluída) | \$0.0043 / min | \$0.00430 |
| **Armazenamento Áudio** | Supabase Storage (S3 Standard) | \$0.015 / GB / mês (~1MB / min MP3) | \$0.00002 |
| **Transferência de Dados** | Egress de Rede (CDN / S3 Egress) | \$0.09 / GB | \$0.00009 |
| **Compute Worker** | Vercel Serverless / Node Worker | \$0.000016 / seg CPU (~0.05s CPU/min) | \$0.00008 |
| **Subtotal por Minuto** | | | **\$0.00449** (~0.45 cêntimos USD) |
| **Margem de Segurança (10%)** | Contingências e picos de tráfego | | **\$0.00051** (~0.05 cêntimos USD) |
| **Custo Orçamentado** | Utilizado no `calculateEstimatedMinutesCost` | | **\$0.00500** (0.50 cêntimos USD / min) |

---

## 2. Análise de Margem por Escalão de Subscrição

Com base no limite orçamentado de **0.5 cêntimos USD por minuto**, a contribuição marginal de cada plano é altamente rentável:

### Plano Free (Aquisição / Testes)
- **Preço Mensal:** \$0.00
- **Minutos Incluídos:** 45 minutos
- **Custo Operacional Máximo:** $45 \times \$0.005 = \mathbf{\$0.225}$ / mês por utilizador ativo
- **Objetivo Estratégico:** Custo de aquisição controlado para conversão em planos pagos.

### Plano Pro (Profissionais / Líderes de Equipa)
- **Preço Mensal:** \$19.00
- **Minutos Incluídos:** 600 minutos (10 horas de reuniões)
- **Custo Operacional Total:** $600 \times \$0.005 = \mathbf{\$3.00}$
- **Margem Bruta Unitária:** $\$19.00 - \$3.00 = \mathbf{\$16.00}$ (**84.2% de margem de contribuição**)

### Plano Business (PMEs / Departamentos)
- **Preço Mensal:** \$79.00
- **Minutos Incluídos:** 2.500 minutos (~41 horas de reuniões)
- **Custo Operacional Total:** $2.500 \times \$0.005 = \mathbf{\$12.50}$
- **Margem Bruta Unitária:** $\$79.00 - \$12.50 = \mathbf{\$66.50}$ (**84.1% de margem de contribuição**)

### Plano Enterprise (Grandes Organizações)
- **Preço Mensal:** \$299.00
- **Minutos Incluídos:** 10.000 minutos (~166 horas de reuniões)
- **Custo Operacional Total:** $10.000 \times \$0.005 = \mathbf{\$50.00}$
- **Margem Bruta Unitária:** $\$299.00 - \$50.00 = \mathbf{\$249.00}$ (**83.2% de margem de contribuição**)

---

## 3. Prevenção de Abusos e Limites Estritos

- **Bloqueio de Overrun:** Caso a organização esgote a quota mensal de minutos, novas tentativas de submissão de jobs de transcrição são rejeitadas pelo `enqueueTranscriptionJob` com código `QUOTA_EXCEEDED`.
- **Prevenção de Ficheiros Monstruosos:** O limite rígido de 500 MB por ficheiro impede a saturação de largura de banda e garante tempos de processamento inferiores a 2 minutos por reunião.
