# Sistema de Templates de Documentos — MEETWISE AI

**Fase:** Fase 5 — Exportação Profissional, Colaboração Segura e Gestão Documental  
**Versão:** 5.0  
**Data:** 05 de Novembro de 2026  
**Módulo:** `src/modules/documents/template-service.ts`

---

## 1. Visão Geral

O sistema de templates do **MEETWISE AI** desacopla os dados da reunião (armazenados no Modelo Canónico) das regras de apresentação visual, tipografia e estrutura formal. 

A plataforma oferece **três templates predefinidos de nível empresarial** e suporte para **templates personalizados por organização**, cumprindo normas protocolares formais para assembleias gerais, reuniões de administração, comités operacionais e alinhamentos rápidos.

---

## 2. Templates Predefinidos

### 2.1. Template Formal Institucional (`formal_institucional`)
- **Público-alvo:** Conselhos de Administração, Assembleias Gerais, Entidades Públicas, Ordens Profissionais e Associações.
- **Características:**
  - Linguagem e tom solene e protocolar.
  - Tabela completa de presenças discriminando cargos e entidades representadas.
  - Registo explícito de ausências justificadas e não justificadas.
  - Deliberações com contagem de votos individualizada (Votos a Favor, Votos Contra, Abstenções) e fundamentação de voto vencido.
  - Termo de encerramento protocolar com leitura e aprovação de ata.
  - Bloco de assinaturas completo para todos os membros da mesa e intervenientes formais.
  - Tipografia: Serifada ou Sans-Serif formal (Calibri/Times), paleta Slate/Navy sóbria.

### 2.2. Template Executiva Empresarial (`executiva_empresarial`) — *Padrão*
- **Público-alvo:** Direção Executiva (C-Level), Comités de Gestão, Reuniões de Departamento e Startups.
- **Características:**
  - Foco em objetividade, decisões rápidas e planos de ação.
  - Resumo executivo em destaque tipográfico inicial (leitura rápida em 90 segundos).
  - Tabela dinâmica de decisões categorizadas por impacto (Estratégico, Financeiro, Operacional).
  - Matriz de ações detalhada com responsável, prazo limite e nível de prioridade (Alta, Média, Baixa).
  - Assinatura focada no líder da reunião e secretário executivo.
  - Tipografia: Sans-Serif moderna (Inter/Arial), paleta Navy profissional (`#1E3A8A`).

### 2.3. Template Simplificada (`simplificada`)
- **Público-alvo:** Alinhamentos diários ou semanais (Daily/Sync), Reuniões 1-on-1, Brainstorming e Workshops técnicos.
- **Características:**
  - Layout compacto e enxuto sem burocracia excessiva.
  - Foco exclusivo em: Tópicos Discutidos, Acordos Estabelecidos e Próximos Passos.
  - Sem necessidade de mesa formal (Presidente/Secretário) nem votações nominais.
  - Termo de encerramento simplificado de uma linha.
  - Ideal para exportação rápida em texto puro (TXT) ou PDF de 1 página.

---

## 3. Templates Personalizados da Organização (`custom`)

As organizações podem definir parametrizações customizadas armazenadas nas configurações da organização:

### Atributos Configuráveis:
- **Logótipo da Organização:** Imagem institucional em PNG/JPEG para cabeçalhos.
- **Cores da Marca:** Cor primária institucional (usada em barras, tabelas e títulos) e cor secundária.
- **Fonte Preferencial:** Arial, Calibri, Times New Roman, Inter, Helvetica.
- **Formato da Numeração Sequencial:** Prefixo e máscara de numeração (ex: `ATA-{YYYY}-{SEQ:3}` ou `DELIB-{YYYY}-{SEQ:4}`).
- **Termo de Declaração de Responsabilidade:** Cláusula de confidencialidade customizada pela equipa jurídica da empresa.
- **Campos Obrigatórios:** Obrigatoriedade de preenchimento de fundamentação de voto ou prazos de tarefas.

---

## 4. Segurança & Proteção Anti-SSRF (Server-Side Request Forgery)

Ao permitir logótipos e imagens personalizadas para renderização em servidores PDF/DOCX, existe risco crítico de SSRF (o servidor requisitar ficheiros locais como `file:///etc/passwd` ou portas da rede interna privada `http://169.254.169.254`).

O `DocumentTemplateService` implementa um filtro estrito de validação de URLs de imagem:

```typescript
export class DocumentTemplateService {
  public validateLogoUrl(url: string | undefined): string | null {
    if (!url) return null;
    
    // 1. Suporte a data URI em base64 (seguro contra SSRF de rede)
    if (url.startsWith('data:image/png;base64,') || url.startsWith('data:image/jpeg;base64,')) {
      return url;
    }

    // 2. Apenas protocolos HTTP/HTTPS públicos permitidos
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return null;
      }

      // 3. Bloqueio estrito de redes privadas e metadados de nuvem (SSRF protection)
      const hostname = parsed.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '169.254.169.254' ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('172.16.') ||
        hostname.endsWith('.internal') ||
        hostname.endsWith('.local')
      ) {
        return null;
      }

      return url;
    } catch {
      return null;
    }
  }
}
```

---

## 5. Matriz Comparativa de Suporte por Formato

| Secção do Template | DOCX | PDF | TXT |
| :--- | :---: | :---: | :---: |
| **Cabeçalho com Logótipo** | Sim | Sim | Não (Apenas texto) |
| **Numeração "Página X de Y"** | Sim (OpenXML) | Sim (Buffer 2x) | Não (Fluxo contínuo) |
| **Tabelas com Efeito Zebra** | Sim | Sim (Vetorial) | Sim (Tabela ASCII) |
| **Badges de Prioridade Coloridos** | Sim | Sim | Sim (`[ALTA]`, `[MÉDIA]`) |
| **Bloco de Assinaturas** | Sim | Sim | Sim (Termo de fecho) |
| **Metadados e Rastreabilidade** | Sim (Propriedades) | Sim (PDF Info) | Sim (Rodapé) |
