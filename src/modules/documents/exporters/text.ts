import { CanonicalMeetingDocument, ExportOptions, ITextExportService, MinutesReviewStatus } from '../types';

export class TextExportService implements ITextExportService {
  /**
   * Generates a clean UTF-8 text document representation from the canonical document.
   */
  public exportToText(document: CanonicalMeetingDocument, options?: ExportOptions): string {
    const lines: string[] = [];
    const hr = '================================================================================';
    const subHr = '--------------------------------------------------------------------------------';

    // Prominent Status Banner for Unapproved / Draft Documents
    if (document.approvalStatus === 'draft_ai') {
      lines.push('********************************************************************************');
      lines.push('*** ATENÇÃO: RASCUNHO NÃO APROVADO — GERADO POR INTELIGÊNCIA ARTIFICIAL      ***');
      lines.push('*** DOCUMENTO PROVISÓRIO SEM VALIDADE JURÍDICA ATÉ VALIDAÇÃO HUMANA FORMAL   ***');
      lines.push('********************************************************************************');
      lines.push('');
    } else if (
      (document.approvalStatus as string) === 'in_review' ||
      document.approvalStatus === 'pending_review'
    ) {
      lines.push('********************************************************************************');
      lines.push('*** AVISO: DOCUMENTO EM REVISÃO — PENDENTE DE HOMOLOGAÇÃO FINAL               ***');
      lines.push('********************************************************************************');
      lines.push('');
    }

    // Header Banner
    lines.push(hr);
    lines.push(`MEETWISE AI — ATA OFICIAL DE REUNIÃO`);
    lines.push(`ORGANIZAÇÃO: ${document.organizationName.toUpperCase()}`);
    lines.push(`NÚMERO DOCUMENTAL: ${document.documentNumber}`);
    lines.push(`ESTADO DOCUMENTAL: ${this.translateStatus(document.approvalStatus)} (v${document.version})`);
    lines.push(hr);
    lines.push('');

    // Document Title
    lines.push(`TÍTULO: ${document.title}`);
    lines.push(`DATA: ${document.meetingDate}${document.meetingTime ? ` às ${document.meetingTime}` : ''}`);
    lines.push(`LOCAL: ${document.location}`);
    lines.push(`PRESIDENTE / COORDENADOR: ${document.chairperson}`);
    lines.push(`SECRETÁRIO(A): ${document.secretary}`);
    lines.push('');

    // Attendees
    lines.push(subHr);
    lines.push('1. PARTICIPANTES E PRESENÇAS');
    lines.push(subHr);
    if (document.attendees.length > 0) {
      document.attendees.forEach((a, idx) => {
        const status = a.present ? '[Presente]' : '[Ausente]';
        const role = a.role ? ` (${a.role})` : '';
        const email = a.email ? ` <${a.email}>` : '';
        lines.push(`  ${idx + 1}. ${a.name}${role}${email} — ${status}`);
      });
    } else {
      lines.push('  Nenhum participante registado formalmente.');
    }

    if (document.absentees.length > 0) {
      lines.push('');
      lines.push(`  Ausências justificadas/registadas: ${document.absentees.join(', ')}`);
    }
    lines.push('');

    // Agenda
    if (document.agenda.length > 0) {
      lines.push(subHr);
      lines.push('2. ORDEM DE TRABALHOS / PONTOS PRINCIPAIS');
      lines.push(subHr);
      document.agenda.forEach((item, idx) => {
        lines.push(`  2.${idx + 1}. ${item}`);
      });
      lines.push('');
    }

    // Executive Summary
    lines.push(subHr);
    lines.push('3. RESUMO EXECUTIVO DA SESSÃO');
    lines.push(subHr);
    lines.push(document.executiveSummary || 'Sem resumo executivo registado.');
    lines.push('');

    // Discussions
    if (document.discussions.length > 0) {
      lines.push(subHr);
      lines.push('4. SÍNTESE DAS DELIBERAÇÕES E DISCUSSÕES');
      lines.push(subHr);
      document.discussions.forEach((d, idx) => {
        lines.push(`  4.${idx + 1}. Tópico: ${d.topic}`);
        if (d.speaker) lines.push(`      Interveniente: ${d.speaker}`);
        if (d.summary) lines.push(`      Síntese: ${d.summary}`);
        lines.push('');
      });
    }

    // Decisions
    lines.push(subHr);
    lines.push('5. DELIBERAÇÕES E DECISÕES FORMAIS');
    lines.push(subHr);
    if (document.decisions.length > 0) {
      document.decisions.forEach((dec, idx) => {
        const classLabel = this.translateDecisionClassification(dec.classification);
        lines.push(`  [DECISÃO 5.${idx + 1}] Estado: ${classLabel}`);
        lines.push(`  Texto: ${dec.text}`);
        if (dec.responsible) lines.push(`  Responsável: ${dec.responsible}`);
        if (dec.rationale) lines.push(`  Fundamentação: ${dec.rationale}`);
        if (dec.quote && options?.includeVerbatimQuotes !== false) {
          lines.push(`  Evidência Verbatim: "${dec.quote}"`);
        }
        lines.push('');
      });
    } else {
      lines.push('  Nenhuma deliberação formal registada nesta sessão.');
      lines.push('');
    }

    // Tasks & Actions
    lines.push(subHr);
    lines.push('6. TAREFAS E PLANO DE AÇÃO');
    lines.push(subHr);
    if (document.tasks.length > 0) {
      document.tasks.forEach((t, idx) => {
        const priorityLabel = t.priority.toUpperCase();
        const assignee = t.assignee || 'Não atribuído';
        const due = t.dueDate ? t.dueDate.split('T')[0] : 'A definir';
        lines.push(`  [TAREFA 6.${idx + 1}] [${priorityLabel}] ${t.title}`);
        lines.push(`  Responsável: ${assignee} | Prazo: ${due} | Natureza: ${t.nature}`);
        if (t.description) lines.push(`  Detalhes: ${t.description}`);
        if (t.quote && options?.includeVerbatimQuotes !== false) {
          lines.push(`  Evidência: "${t.quote}"`);
        }
        lines.push('');
      });
    } else {
      lines.push('  Nenhuma tarefa ou ação operacional registada.');
      lines.push('');
    }

    // Pending Items
    if (document.pendingItems.length > 0) {
      lines.push(subHr);
      lines.push('7. PONTOS PENDENTES / PRÓXIMOS PASSOS');
      lines.push(subHr);
      document.pendingItems.forEach((p, idx) => {
        lines.push(`  7.${idx + 1}. ${p}`);
      });
      lines.push('');
    }

    // Signatures / Validation Block
    if (options?.includeSignatures !== false) {
      lines.push(subHr);
      lines.push('8. TERMO DE APROVAÇÃO E HOMOLOGAÇÃO');
      lines.push(subHr);
      lines.push(`Estado de Validação: ${this.translateStatus(document.approvalStatus)}`);
      if (document.approvedBy) {
        lines.push(`Aprovado por: ${document.approvedBy} em ${document.approvedAt || 'data não informada'}`);
      }
      if (document.signedBy) {
        lines.push(`Assinado por: ${document.signedBy} em ${document.signedAt || 'data não informada'}`);
      } else {
        lines.push('');
        lines.push('  ________________________________________      ________________________________________');
        lines.push(`  Presidente: ${document.chairperson}           Secretário(a): ${document.secretary}`);
      }
      lines.push('');
    }

    // Footer & Disclaimer
    lines.push(hr);
    lines.push(`Documento gerado em: ${document.generatedAt} pelo MEETWISE AI`);
    lines.push(`Aviso Legal: Documento gerado com assistência de Inteligência Artificial.`);
    lines.push(`A validade jurídica depende de homologação e assinatura conforme a legislação aplicável.`);
    lines.push(hr);

    return lines.join('\n');
  }

  private translateStatus(status: MinutesReviewStatus): string {
    switch (status) {
      case 'draft_ai':
        return 'RASCUNHO IA (Não Homologado)';
      case 'pending_review':
        return 'EM REVISÃO HUMANA';
      case 'validated_human':
        return 'VALIDADO POR REVISOR';
      case 'rejected_human':
        return 'REJEITADO NA REVISÃO';
      case 'final_signed':
        return 'FINALIZADO E ASSINADO';
      default:
        return status;
    }
  }

  private translateDecisionClassification(c: string): string {
    switch (c) {
      case 'approved_decision':
        return 'APROVADA';
      case 'proposed_decision':
      case 'proposal':
        return 'PROPOSTA';
      case 'discussed_decision':
        return 'DISCUTIDA';
      case 'rejected_decision':
      case 'rejected':
        return 'REJEITADA';
      case 'deferred_decision':
        return 'ADIADA';
      case 'pending_validation':
        return 'PENDENTE DE VALIDAÇÃO';
      default:
        return c;
    }
  }
}
