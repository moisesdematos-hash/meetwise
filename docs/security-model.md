# Modelo de Segurança, RBAC e Mitigação de Riscos

O MEETWISE AI adota a estratégia de **Defesa em Profundidade (*Defense in Depth*)**, combinando validação na camada de aplicação, autorização estrita na camada de banco de dados (RLS) e contenção de dados não confiáveis de IA.

---

## 1. Matriz de Papéis e Permissões (RBAC)

O sistema define 5 papéis organizacionais:

| Permissão | Descrição | Owner | Admin | Manager | Member | Viewer |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `org:read` | Visualizar informações da organização | ✅ | ✅ | ✅ | ✅ | ✅ |
| `org:update` | Alterar dados cadastrais e idioma padrão | ✅ | ✅ | ❌ | ❌ | ❌ |
| `org:delete` | Excluir a organização e seus dados | ✅ | ❌ | ❌ | ❌ | ❌ |
| `org:manage_billing` | Gerir planos, cartões e faturas | ✅ | ✅ | ❌ | ❌ | ❌ |
| `org:manage_members` | Convidar, alterar papéis e remover membros | ✅ | ✅ | ❌ | ❌ | ❌ |
| `meeting:create` | Criar nova reunião e agendamento | ✅ | ✅ | ✅ | ✅ | ❌ |
| `meeting:read` | Aceder aos dados e detalhes da reunião | ✅ | ✅ | ✅ | ✅ | ✅ |
| `meeting:update` | Alterar título, descrição e participantes | ✅ | ✅ | ✅ | ✅ | ❌ |
| `meeting:delete` | Excluir ou arquivar reunião | ✅ | ✅ | ❌ | ❌ | ❌ |
| `media:upload` | Fazer upload de arquivos de áudio/vídeo | ✅ | ✅ | ✅ | ✅ | ❌ |
| `media:download` | Reproduzir e descarregar arquivos de mídia | ✅ | ✅ | ✅ | ✅ | ✅ |
| `transcript:read` | Ler a transcrição sincronizada | ✅ | ✅ | ✅ | ✅ | ✅ |
| `transcript:edit` | Corrigir texto e oradores na transcrição | ✅ | ✅ | ✅ | ✅ | ❌ |
| `minutes:generate` | Disparar geração automatizada de atas por IA | ✅ | ✅ | ✅ | ✅ | ❌ |
| `minutes:review` | Editar e submeter ata para validação | ✅ | ✅ | ✅ | ✅ | ❌ |
| `minutes:approve` | Homologar e assinar ata formal final | ✅ | ✅ | ✅ | ❌ | ❌ |
| `task:create` | Criar novas tarefas manualmente | ✅ | ✅ | ✅ | ✅ | ❌ |
| `task:update` | Alterar status, responsável ou prazo da tarefa | ✅ | ✅ | ✅ | ✅ | ❌ |
| `audit:read` | Visualizar logs de auditoria e consumo | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 2. Regra Anti-Escalação de Privilégios

1. Nenhum operador (inclusive `admin`) pode atribuir ou alterar membros para um papel superior ou igual ao seu próprio, com exceção do `owner`.
2. Um `member` ou `manager` não pode auto-promover-se.
3. A remoção do último proprietário ativo é fisicamente impedida por trigger em PostgreSQL (`protect_last_owner`).

---

## 3. Defesa Contra Prompt Injection

Gravações de áudio são consideradas vetores potenciais de ataques de injeção de instruções (*prompt injection* indireto). Medidas ativas:
1. **Encapsulamento Rígido:** A transcrição é processada e delimitada em tags XML `<untrusted_meeting_transcript>`. Qualquer tentativa de escape da tag é neutralizada pela função `sanitizeTranscriptForLLM()`.
2. **Imunidade Sistémica:** O prompt de sistema instrui categoricamente o modelo de que o conteúdo entre as tags é fala passiva e não comandos do sistema.
3. **Validação de Saída por Esquema:** As respostas do modelo são deserializadas exclusivamente através de esquemas Zod estritos, descartando qualquer código arbitrário ou payloads inesperados.

---

## 4. Segurança do Armazenamento de Arquivos

- Os buckets `meeting_recordings` e `meeting_documents` são rigorosamente privados (`public = false`).
- Acesso exclusivo via URLs assinadas de curta duração (máximo de 15 minutos).
- Caminhos particionados por tenant: `{org_id}/{meeting_id}/{asset_id}.{ext}`.
- Limite físico de 500MB e validação estrita de MIME type no backend antes da geração da presigned URL.
