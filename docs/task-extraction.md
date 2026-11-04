# EXTRAÇÃO E GESTÃO DE TAREFAS ACIONÁVEIS — MEETWISE AI
## Atribuição, Natureza, Prioridades e Rastreabilidade no Áudio

**Versão:** 4.0  
**Data:** 04 de Novembro de 2026  
**Documento Técnico:** `docs/task-extraction.md`

---

## 1. INTRODUÇÃO

A extração de tarefas transforma conversas não estruturadas em itens de trabalho operacionais e acionáveis. No MEETWISE AI, cada tarefa inclui metadados rigorosos de responsabilidade, prazos e nível de urgência, ancorados em citações verbatim.

---

## 2. NATUREZA DAS TAREFAS (`task_nature`)

| Natureza | Definição | Exemplo Típico |
| :--- | :--- | :--- |
| `assigned` | Tarefa explicitamente atribuída a uma pessoa ou equipa com compromisso claro. | "O Carlos fica responsável por enviar a proposta até sexta-feira." |
| `suggested` | Sugestão ou recomendação de ação sem alocação formal de proprietário. | "Devíamos rever os contratos de fornecedores de TI." |
| `pending_confirmation` | Tarefa cuja viabilidade, prazo ou responsável depende de confirmação externa. | "Vou verificar com o Diretor Jurídico se podemos assinar este mês." |

---

## 3. NÍVEIS DE PRIORIDADE (`priority`)

- `urgent`: Impacto imediato ou bloqueador operacional nas próximas 24 a 48 horas.
- `high`: Prioridade elevada para o ciclo ou sprint corrente.
- `medium`: Prioridade padrão de acompanhamento regular.
- `low`: Melhoria contínua ou tarefa sem data de entrega crítica.

---

## 4. PROTEÇÃO CONTRA ALUCINAÇÕES DE RESPONSÁVEIS E DATAS

O motor de IA opera sob a regra estrita de que **se um responsável ou data de entrega não foi expressamente mencionado pelos participantes, o campo deve permanecer `null`**. O sistema nunca infere datas com base em calendários não mencionados nem inventa nomes de funcionários que não constam da transcrição ou da lista de intervenientes da reunião.
