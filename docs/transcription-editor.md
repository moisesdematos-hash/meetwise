# MEETWISE AI — Editor Profissional e Sincronização Áudio-Texto

## 1. Experiência de Utilizador e Layout Dual-Pane

O editor de reuniões do MEETWISE AI (`src/components/transcription/TranscriptEditor.tsx` e `src/components/transcription/AudioPlayer.tsx`) implementa uma experiência dividida em dois painéis independentes mas rigorosamente sincronizados:

- **Painel Esquerdo (Controlo de Reprodução & Metadados):**
  - **Leitor de Áudio Dedicado:** Reproduz o áudio da gravação com scrub bar de alta precisão.
  - **Controlos de Velocidade:** Permite reproduzir a `0.75x`, `1.0x`, `1.25x`, `1.5x` e `2.0x`.
  - **Saltos Rápidos:** Botões de avanço e recuo de $\pm 5$ segundos para revisão ágil.
  - **Cartão de Metadados:** Exibe duração real, idioma de reconhecimento, total de segmentos e contagem de oradores.
  - **Lista de Intervenientes:** Lista os intervenientes identificados com avatares e papéis.

- **Painel Direito (Editor Interativo de Segmentos):**
  - **Barra de Pesquisa:** Filtra dinamicamente segmentos e intervenientes em tempo real à medida que o utilizador digita.
  - **Seletor de Estado de Revisão Humana:** Transições entre `Rascunho (draft)`, `Em Revisão (in_review)` e `Validado (validated)`.
  - **Lista de Segmentos:** Segmentos dispostos em ordem cronológica com timestamps interativos em `[MM:SS]`.

---

## 2. Mecânica de Sincronização Bidirecional

1. **Do Texto para o Áudio (Click-to-Seek):**
   - Ao clicar no botão de timestamp `[MM:SS]` de qualquer segmento, o editor invoca `onSeek(seg.start_time)`.
   - O `AudioPlayer` reposiciona instantaneamente a agulha de reprodução para aquele segundo exato e inicia a reprodução contínua.

2. **Do Áudio para o Texto (Active Segment Highlighting):**
   - Conforme o áudio é reproduzido, o leitor dispara eventos `onTimeUpdate(currentTimeSeconds)`.
   - O `TranscriptEditor` calcula em tempo real o segmento ativo:
     $$\text{seg.start\_time} \le \text{currentTime} \le \text{seg.end\_time}$$
   - O segmento correspondente recebe imediatamente realce visual diferenciado (borda índigo, fundo destacado e ring de foco).

---

## 3. Edição Inline, Auditoria e Reversão

- **Edição Direta:**
  - Clicar em "Editar" transforma o parágrafo de texto numa área de texto editável com botões "Gravar" e "Cancelar".
  - Ao gravar, a API `/api/transcription/segments` grava a alteração, marca `is_edited = true`, preserva o `original_text` e atualiza o `updated_at`.
- **Badge de Edição:**
  - Segmentos editados exibem o badge visual amarelo "Editado".
- **Reversão com Um Clique:**
  - O utilizador pode reverter qualquer segmento editado para o seu texto original de transcrição premindo "Reverter".

---

## 4. Renomeação Global de Oradores (Diarização)

- Em reuniões reais, a IA identifica inicialmente intervenientes com etiquetas automáticas (`Orador 1`, `Orador 2`, etc.).
- O utilizador pode clicar na etiqueta do orador para abrir a janela de renomeação (ex.: `Orador 1` $\rightarrow$ `Dra. Teresa Bento (Presidente)`).
- Esta operação invoca a função RPC PostgreSQL `public.rename_meeting_speaker`:
  - Atualiza atómica e instantaneamente todos os segmentos da reunião com a etiqueta antiga.
  - Sincroniza o registo correspondente na tabela `public.meeting_participants`.

---

## 5. Ciclo de Vida de Revisão Humana

A coluna `transcription_review_status` da tabela `public.meetings` governa a validação da qualidade documental:
- `draft` (Rascunho): Transcrição gerada por IA sem validação por operador humano.
- `in_review` (Em Revisão): Um revisor abriu e está a auditar segmentos e oradores.
- `validated` (Validado): Transcrição confirmada por um utilizador humano, registando o ID do revisor (`reviewed_by`) e a data (`reviewed_at`).
