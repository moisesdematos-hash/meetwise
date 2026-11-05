import PDFDocument from 'pdfkit';
import { CanonicalMeetingDocument, ExportOptions, IPdfExportService } from '../types';

export class PdfExportService implements IPdfExportService {
  /**
   * Generates a professional vector PDF document adhering to standard A4 layout.
   * Includes headers, footers, pagination, structured sections, and legal notices.
   */
  public async exportToPdf(
    document: CanonicalMeetingDocument,
    options?: ExportOptions
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4', // 595.28 x 841.89 points
          margins: { top: 50, bottom: 50, left: 50, right: 50 },
          bufferPages: true,
          info: {
            Title: `${document.documentNumber} - ${document.title}`,
            Author: 'MEETWISE AI Enterprise Suite',
            Subject: `Ata Oficial de Reunião - ${document.organizationName}`,
            Keywords: 'ata, reunião, meetwise, decisões, tarefas',
            CreationDate: new Date(),
          },
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err) => reject(err));

        const pageWidth = 595.28;
        const pageHeight = 841.89;
        const contentWidth = pageWidth - 100; // 495.28

        // Organization Header Banner
        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .fillColor('#64748B')
          .text(document.organizationName.toUpperCase(), 50, 40, { align: 'left' });

        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor('#94A3B8')
          .text(`${document.documentNumber} (v${document.version})`, 50, 40, {
            align: 'right',
            width: contentWidth,
          });

        doc.moveDown(1.5);

        // Document Title
        doc
          .fontSize(18)
          .font('Helvetica-Bold')
          .fillColor('#0F172A')
          .text(document.title, { width: contentWidth });

        // Subtitle / Status
        const statusLabel = this.translateStatus(document.approvalStatus);
        const statusColor =
          document.approvalStatus === 'final_signed' ? '#15803D' : '#B45309';

        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .fillColor('#475569')
          .text('Ata Oficial de Reunião • ', { continued: true })
          .font('Helvetica')
          .fillColor('#64748B')
          .text(`Registo N.º ${document.documentNumber} • Estado: `, { continued: true })
          .font('Helvetica-Bold')
          .fillColor(statusColor)
          .text(statusLabel);

        doc.moveDown(1);

        // Metadata Box
        const startY = doc.y;
        doc
          .rect(50, startY, contentWidth, 54)
          .fillAndStroke('#F8FAFC', '#E2E8F0');

        doc.fillColor('#1E293B');
        doc
          .fontSize(8)
          .font('Helvetica-Bold')
          .text('Data:', 60, startY + 8)
          .font('Helvetica')
          .text(
            `${document.meetingDate}${document.meetingTime ? ` às ${document.meetingTime}` : ''}`,
            100,
            startY + 8
          )
          .font('Helvetica-Bold')
          .text('Local:', 300, startY + 8)
          .font('Helvetica')
          .text(document.location, 340, startY + 8);

        doc
          .font('Helvetica-Bold')
          .text('Presidente:', 60, startY + 28)
          .font('Helvetica')
          .text(document.chairperson, 120, startY + 28)
          .font('Helvetica-Bold')
          .text('Secretário(a):', 300, startY + 28)
          .font('Helvetica')
          .text(document.secretary, 370, startY + 28);

        doc.y = startY + 68;

        // Section 1: Attendees
        this.addSectionHeader(doc, '1. Participantes e Presenças');
        if (document.attendees.length > 0) {
          document.attendees.forEach((a, idx) => {
            doc
              .fontSize(9)
              .font('Helvetica-Bold')
              .fillColor('#1E293B')
              .text(`${idx + 1}. ${a.name}`, { continued: true })
              .font('Helvetica')
              .fillColor('#64748B')
              .text(a.role ? ` (${a.role})` : '', { continued: true })
              .font('Helvetica-Bold')
              .fillColor(a.present ? '#15803D' : '#DC2626')
              .text(` — ${a.present ? 'Presente' : 'Ausente'}`);
          });
        } else {
          doc
            .fontSize(9)
            .font('Helvetica-Oblique')
            .fillColor('#64748B')
            .text('Nenhum participante formalmente registado.');
        }

        if (document.absentees.length > 0) {
          doc.moveDown(0.4);
          doc
            .fontSize(8)
            .font('Helvetica-Oblique')
            .fillColor('#94A3B8')
            .text(`Ausências registadas: ${document.absentees.join(', ')}`);
        }

        // Section 2: Agenda
        if (document.agenda.length > 0) {
          this.addSectionHeader(doc, '2. Ordem de Trabalhos / Pontos de Pauta');
          document.agenda.forEach((item, idx) => {
            doc
              .fontSize(9)
              .font('Helvetica')
              .fillColor('#1E293B')
              .text(`2.${idx + 1}. ${item}`);
          });
        }

        // Section 3: Executive Summary
        this.addSectionHeader(doc, '3. Resumo Executivo da Sessão');
        const summaryY = doc.y;
        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor('#1E293B')
          .text(document.executiveSummary || 'Sem resumo executivo disponível.', {
            width: contentWidth,
            align: 'justify',
            lineGap: 3,
          });

        // Section 4: Discussions
        if (document.discussions.length > 0) {
          this.addSectionHeader(doc, '4. Síntese das Deliberações e Discussões');
          document.discussions.forEach((d) => {
            doc
              .fontSize(9)
              .font('Helvetica-Bold')
              .fillColor('#1E293B')
              .text(`• ${d.topic}: `, { continued: true })
              .font('Helvetica')
              .fillColor('#334155')
              .text(d.summary, { continued: !!d.speaker });

            if (d.speaker) {
              doc
                .font('Helvetica-Oblique')
                .fillColor('#64748B')
                .text(` (Interveniente: ${d.speaker})`);
            }
            doc.moveDown(0.3);
          });
        }

        // Section 5: Decisions
        this.addSectionHeader(doc, '5. Deliberações e Decisões Formais');
        if (document.decisions.length > 0) {
          document.decisions.forEach((dec, idx) => {
            const decY = doc.y;
            // Check page break space
            if (decY > pageHeight - 120) {
              doc.addPage();
            }

            const badgeLabel = this.translateDecisionStatus(dec.classification);
            const badgeColor =
              dec.classification === 'approved_decision' ? '#15803D' : '#475569';

            doc
              .fontSize(9)
              .font('Helvetica-Bold')
              .fillColor('#0F172A')
              .text(`[D.${idx + 1}] `, { continued: true })
              .fillColor(badgeColor)
              .text(`[${badgeLabel}] `, { continued: true })
              .fillColor('#0F172A')
              .text(dec.text);

            if (dec.responsible) {
              doc
                .fontSize(8)
                .font('Helvetica-Bold')
                .fillColor('#64748B')
                .text('Responsável: ', { continued: true })
                .font('Helvetica')
                .fillColor('#334155')
                .text(dec.responsible);
            }

            if (dec.rationale) {
              doc
                .fontSize(8)
                .font('Helvetica-Bold')
                .fillColor('#64748B')
                .text('Fundamentação: ', { continued: true })
                .font('Helvetica')
                .fillColor('#334155')
                .text(dec.rationale);
            }

            if (dec.quote && options?.includeVerbatimQuotes !== false) {
              doc
                .fontSize(8)
                .font('Helvetica-Oblique')
                .fillColor('#64748B')
                .text(`Evidência verbatim: "${dec.quote}"`);
            }

            doc.moveDown(0.6);
          });
        } else {
          doc
            .fontSize(9)
            .font('Helvetica-Oblique')
            .fillColor('#64748B')
            .text('Nenhuma decisão registada nesta reunião.');
        }

        // Section 6: Tasks
        this.addSectionHeader(doc, '6. Tarefas e Plano de Ação');
        if (document.tasks.length > 0) {
          document.tasks.forEach((t, idx) => {
            if (doc.y > pageHeight - 100) {
              doc.addPage();
            }

            doc
              .fontSize(9)
              .font('Helvetica-Bold')
              .fillColor('#0F172A')
              .text(`[T.${idx + 1}] `, { continued: true })
              .fillColor(t.priority === 'urgent' || t.priority === 'high' ? '#DC2626' : '#2563EB')
              .text(`[${t.priority.toUpperCase()}] `, { continued: true })
              .fillColor('#0F172A')
              .text(t.title);

            doc
              .fontSize(8)
              .font('Helvetica')
              .fillColor('#475569')
              .text(
                `Responsável: ${t.assignee || 'Não atribuído'} | Prazo: ${t.dueDate ? t.dueDate.split('T')[0] : 'A definir'} | Natureza: ${t.nature}`
              );

            if (t.description) {
              doc
                .fontSize(8)
                .font('Helvetica')
                .fillColor('#64748B')
                .text(`Detalhes: ${t.description}`);
            }

            doc.moveDown(0.5);
          });
        } else {
          doc
            .fontSize(9)
            .font('Helvetica-Oblique')
            .fillColor('#64748B')
            .text('Nenhuma tarefa ou ação operacional registada.');
        }

        // Section 7: Pending Items
        if (document.pendingItems.length > 0) {
          this.addSectionHeader(doc, '7. Pontos Pendentes e Próximos Passos');
          document.pendingItems.forEach((p, idx) => {
            doc
              .fontSize(9)
              .font('Helvetica')
              .fillColor('#1E293B')
              .text(`7.${idx + 1}. ${p}`);
          });
        }

        // Section 8: Signatures & Validation
        if (options?.includeSignatures !== false) {
          if (doc.y > pageHeight - 160) {
            doc.addPage();
          }

          this.addSectionHeader(doc, '8. Termo de Aprovação e Homologação');
          doc
            .fontSize(8)
            .font('Helvetica')
            .fillColor('#475569')
            .text(
              `Estado de Homologação: ${statusLabel} • Versão Documental: v${document.version}`
            );

          const sigY = doc.y + 35;
          doc.strokeColor('#CBD5E1');

          // Chairperson line
          doc.moveTo(60, sigY).lineTo(250, sigY).stroke();
          doc
            .fontSize(8)
            .font('Helvetica-Bold')
            .fillColor('#0F172A')
            .text(document.chairperson, 60, sigY + 6)
            .font('Helvetica')
            .fillColor('#64748B')
            .text('Presidente da Mesa', 60, sigY + 18);

          // Secretary line
          doc.moveTo(310, sigY).lineTo(500, sigY).stroke();
          doc
            .fontSize(8)
            .font('Helvetica-Bold')
            .fillColor('#0F172A')
            .text(document.secretary, 310, sigY + 6)
            .font('Helvetica')
            .fillColor('#64748B')
            .text('Secretário(a)', 310, sigY + 18);

          doc.y = sigY + 40;
        }

        // Legal Disclaimer Notice
        doc.moveDown(1.5);
        doc
          .fontSize(7)
          .font('Helvetica-Oblique')
          .fillColor('#94A3B8')
          .text(
            'Aviso Legal: Documento gerado com assistência de Inteligência Artificial pelo MEETWISE AI. ' +
              'A validade jurídica, vinculação probatória e homologação formal dependem do cumprimento das disposições ' +
              'estatutárias e normativas aplicáveis à organização.',
            { width: contentWidth, align: 'center' }
          );

        // Two-pass pagination: Footer on each page
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          doc
            .fontSize(8)
            .font('Helvetica')
            .fillColor('#94A3B8')
            .text(
              `MEETWISE AI • Página ${i + 1} de ${range.count} • ${document.documentNumber}`,
              50,
              pageHeight - 35,
              { align: 'center', width: contentWidth }
            );
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  private addSectionHeader(doc: typeof PDFDocument.prototype, title: string) {
    doc.moveDown(1.2);
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#1E293B')
      .text(title);
    doc.moveDown(0.3);
  }

  private translateStatus(status: string): string {
    switch (status) {
      case 'draft_ai':
        return 'Rascunho de IA (Não Validado)';
      case 'pending_review':
        return 'Em Revisão Humana';
      case 'validated_human':
        return 'Validado por Revisor';
      case 'rejected_human':
        return 'Rejeitado';
      case 'final_signed':
        return 'Finalizado e Homologado';
      default:
        return status;
    }
  }

  private translateDecisionStatus(classification: string): string {
    switch (classification) {
      case 'approved_decision':
        return 'Aprovada';
      case 'proposed_decision':
      case 'proposal':
        return 'Proposta';
      case 'discussed_decision':
        return 'Discutida';
      case 'rejected_decision':
      case 'rejected':
        return 'Rejeitada';
      case 'deferred_decision':
        return 'Adiada';
      case 'pending_validation':
        return 'Pendente Validação';
      default:
        return classification;
    }
  }
}
