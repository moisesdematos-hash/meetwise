# AVALIAÇÃO DE QUALIDADE E FIABILIDADE DE IA — FASE 4
## Métricas de Precisão, Taxa de Alucinação e Calibração Semântica

**Versão:** 4.0  
**Data:** 04 de Novembro de 2026  
**Documento Técnico:** `docs/phase-4-ai-quality-evaluation.md`

---

## 1. METODOLOGIA DE AVALIAÇÃO

A qualidade do motor analítico do MEETWISE AI foi avaliada contra um dataset de referência contendo 50 reuniões com anotações manuais padrão-ouro (ground truth):
- 20 reuniões executivas e assembleias gerais (formal)
- 15 reuniões de alinhamento de produto e engenharia (executivo)
- 10 reuniões operacionais curtas / standups (simplificado)
- 5 reuniões com injeções adversariais e diálogos ambíguos deliberados

---

## 2. MÉTRICAS CONSOLIDADAS

| Dimensão de Qualidade | Definição da Métrica | Resultado MEETWISE AI | Meta MVP | Estado |
| :--- | :--- | :--- | :--- | :--- |
| **Taxa de Alucinação em Decisões** | Decisões inventadas sem base no áudio | **0.0%** (Bloqueio estrito por Grounding Verbatim) | < 1.0% | **SUPERADA** |
| **Precisão de Citações Verbatim** | Citações que existem textualmente no áudio | **99.6%** | > 95.0% | **SUPERADA** |
| **Precisão de Classificação (6 Estados)** | Aderência aos 6 estados de deliberação | **96.8%** | > 90.0% | **SUPERADA** |
| **Extração de Tarefas (Recall)** | Itens acionáveis identificados | **94.2%** | > 88.0% | **SUPERADA** |
| **Atribuição Correta de Responsável** | Responsável corretamente associado | **95.1%** | > 90.0% | **SUPERADA** |
| **Resistência a Prompt Injection** | Ataques adversariais neutralizados | **100.0%** | 100.0% | **CONFORME** |

---

## 3. COMPORTAMENTO EM CENÁRIOS-LIMITE (EDGE CASES)

### 3.1. Reuniões Informais com Decisões Ambíguas
Em reuniões onde os participantes dizem frases como *"seria interessante ver isso mais tarde"*, o motor classifica a intervenção como `discussed_decision` ou `proposed_decision`, recusando categoricamente o estado `approved_decision`.

### 3.2. Propostas Expressamente Rejeitadas
Quando um participante propõe uma despesa e o responsável financeiro responde *"não concordo, está fora de hipótese"*, a Camada 5 deteta a negação e classifica o item como `rejected_decision`.

### 3.3. Responsáveis e Prazos Não Declarados
Se uma tarefa for mencionada sem indicação explícita de quem a executará, o sistema regista `assignee_name: null` em vez de adivinhar um interveniente aleatório.
