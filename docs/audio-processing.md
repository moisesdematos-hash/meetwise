# MEETWISE AI — Processamento, Validação e Metadados de Áudio

## 1. Políticas de Ingestão de Áudio e Vídeo

O MEETWISE AI impõe restrições estritas na ingestão de ficheiros multimédia gravados de reuniões:

| Parâmetro | Regra / Limite |
| :--- | :--- |
| **Formatos Suportados** | MP3 (`.mp3`), WAV (`.wav`), M4A (`.m4a`), MP4 (`.mp4`), WEBM (`.webm`), OGG (`.ogg`) |
| **MIME Types Permitidos** | `audio/mpeg`, `audio/mp3`, `audio/wav`, `audio/x-wav`, `audio/m4a`, `audio/x-m4a`, `video/mp4`, `audio/mp4`, `audio/webm`, `video/webm`, `audio/ogg`, `application/ogg`, `video/ogg` |
| **Tamanho Máximo** | 500 MB (524.288.000 bytes) |
| **Tamanho Mínimo** | $> 0$ bytes (rejeita ficheiros vazios) |
| **Isolamento de Caminho** | `{organization_id}/{meeting_id}/{asset_id}.{ext}` |

---

## 2. Inspeção de Integridade Binária (Anti-MIME-Spoofing)

Para prevenir ataques em que atacantes tentam carregar scripts maliciosos, binários executáveis ou ficheiros corrompidos renomeando a extensão para `.mp3` ou `.wav`, a função `validateMediaBufferMagicBytes` inspeciona os primeiros bytes do cabeçalho binário:

1. **WAV (Waveform Audio File Format):**
   - Bytes 0..3: Assinatura ASCII `RIFF` (`0x52 0x49 0x46 0x46`).
   - Bytes 8..11: Formato ASCII `WAVE` (`0x57 0x41 0x56 0x45`).
2. **MP3 (MPEG-1/2 Audio Layer III):**
   - Início com tag ID3v2: Bytes 0..2 contêm `ID3` (`0x49 0x44 0x33`).
   - Ou início direto com frame de sincronismo MPEG: Byte 0 é `0xFF` e os 3 bits superiores do Byte 1 são `1` (`0xE0`), totalizando `0xFF 0xFB`, `0xFF 0xF3` ou `0xFF 0xF2`.
3. **M4A / MP4 (ISO Base Media):**
   - Byte 4..7: Assinatura de box de topo `ftyp` (`0x66 0x74 0x79 0x70`).
4. **OGG (Xiph.Org Container):**
   - Bytes 0..3: Padrão de captura `OggS` (`0x4F 0x67 0x67 0x53`).
5. **WEBM (Matroska/EBML Container):**
   - Bytes 0..3: Identificador de elemento EBML `0x1A 0x45 0xDF 0xA3`.

Se a assinatura do cabeçalho não corresponder ao tipo MIME ou extensão declarados, a operação é imediatamente abortada com erro `VALIDATION_ERROR: Incompatibilidade de assinatura binária (MIME spoofing)`.

---

## 3. Extração e Dedução de Metadados (`AudioMetadataService`)

O serviço `AudioMetadataService` extrai de forma segura as propriedades de áudio sem dependências externas frágeis:

- **Cabeçalhos PCM WAV:**
  - Analisa o subchunk `fmt ` para extrair número de canais (mono/estéreo), taxa de amostragem (Hz) e taxa de bytes por segundo.
  - Calcula a duração exata: $\text{duração} = \frac{\text{tamanho dos dados PCM}}{\text{taxa de bytes por segundo}}$.
- **Frames MP3:**
  - Decodifica a tabela de bitrates e taxas de amostragem padrão (32 kHz, 44.1 kHz, 48 kHz).
  - Determina a duração estimada com base no bitrate real detectado.
- **Heurística de Fallback para Contentores Vídeo/Áudio Comprimido:**
  - Aplica cálculo ponderado (128 kbps para áudio, 384 kbps para vídeo) quando não há decodificador PCM direto no nó de execução.

---

## 4. Proteção contra Path Traversal e Injeção de Caminhos

A função `sanitizeFilename`:
- Remove caracteres de controlo (`0x00` a `0x1F`, `0x7F`).
- Elimina sequências de fuga de diretório (`../`, `..\`).
- Normaliza separadores de caminho (`/`, `\`) para underscores.
- Garante que ficheiros vazios ou compostos exclusivamente por pontos recebem um nome determinístico seguro (`recording_{timestamp}`).
- A função `buildSecureStoragePath` valida estritamente a conformidade de `organizationId`, `meetingId` e `assetId` com a expressão regular de UUID v4 antes de montar o caminho final no Supabase Storage.
