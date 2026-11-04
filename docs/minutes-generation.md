# ESPECIFICAÇÃO DE GERAÇÃO DE ATAS PROFISSIONAIS — MEETWISE AI
## Modelos, Estrutura Protocolar, Metadados e Customização

**Versão:** 4.0  
**Data:** 04 de Novembro de 2026  
**Documento Técnico:** `docs/minutes-generation.md`

---

## 1. INTRODUÇÃO

No contexto corporativo e institucional, a ata de reunião é um documento legal e de governança que comprova o cumprimento das ordens de trabalho e as decisões adotadas por sócios, órgãos diretivos ou comissões técnicas. O MEETWISE AI suporta 4 modelos de ata profissionais, adequados a diferentes níveis de solenidade.

---

## 2. OS 4 MODELOS DE ATAS

### 2.1. Ata Formal (Solenidade Institucional / Assembleias)
- **Destinada a:** Assembleias Gerais, Conselhos de Administração, Reuniões de Direção e Entidades Públicas.
- **Estrutura Obrigatória:**
  1. **Cabeçalho Protocolar:** Nome da entidade, data, hora de início/fim, local/modalidade presencial ou virtual.
  2. **Mesa da Reunião:** Presidente e Secretário devidamente designados.
  3. **Presenças e Faltas:** Lista nominal de membros presentes e justificação de ausências.
  4. **Ordem de Trabalhos (Agenda):** Pontos aprovados para discussão na sessão.
  5. **Registo dos Assuntos Discutidos:** Intervenções e deliberações com citações diretas.
  6. **Deliberações e Votações:** Resultados formais por unanimidade ou maioria.
  7. **Encerramento e Assinaturas:** Fórmula regulamentar de fecho e linhas para assinatura física ou digital.

### 2.2. Ata Executiva (Alinhamento Estratégico / Comités)
- **Destinada a:** Reuniões de equipas de liderança, comités de produto, alinhamentos departamentais.
- **Foco:** Resumo executivo estratégico (300 palavras), decisões principais e plano de ação imediato.

### 2.3. Ata Simplificada (Operacional / Standups)
- **Destinada a:** Reuniões operacionais semanais, standups ágeis, retrospectivas.
- **Foco:** Formato direto em bullet points contendo pontos deliberados e tarefas imediatas.

### 2.4. Modelos Personalizados (`organization_templates`)
- Cada organização pode criar modelos à medida através da tabela `public.organization_templates`:
  - Secções obrigatórias e opcionais configuradas em JSON.
  - Regras de formatação (ex: maiúsculas, prefixos legais).
  - Terminologia institucional específica (ex: substituir "reunião" por "Sessão Plenária", "decisão" por "Resolução").
  - Protegido por RLS estrito: apenas membros com perfil `owner`, `admin` ou `manager` podem criar ou editar modelos da sua organização.

---

## 3. MULTILINGUISMO E PRESERVAÇÃO DE NOMES PRÓPRIOS

O motor de geração de atas suporta:
- Português de Angola (`pt-AO`)
- Português de Portugal (`pt-PT`)
- Português do Brasil (`pt-BR`)
- Inglês (`en`), Espanhol (`es`), Francês (`fr`)

**Regra de Ouro:** Nomes próprios, topónimos e identidades institucionais (ex: "Dr. António Mendonça", "Luanda", "TechVentures SA") são estritamente preservados sem qualquer tradução ou adulteração fonética.
