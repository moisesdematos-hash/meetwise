import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  Header,
  Footer,
  PageNumber,
  ShadingType,
} from 'docx';
import { CanonicalMeetingDocument, ExportOptions, IDocxExportService } from '../types';

export class DocxExportService implements IDocxExportService {
  /**
   * Generates a professional Microsoft Word DOCX document from the canonical model.
   * Includes headers, footers, pagination, tables, and formal styling.
   */
  public async exportToDocx(
    document: CanonicalMeetingDocument,
    options?: ExportOptions
  ): Promise<Buffer> {
    const statusLabel = this.translateStatus(document.approvalStatus);

    const doc = new Document({
      title: `${document.documentNumber} - ${document.title}`,
      description: `Ata oficial gerada pelo MEETWISE AI para ${document.organizationName}`,
      creator: 'MEETWISE AI Enterprise Suite',
      styles: {
        default: {
          document: {
            run: {
              font: 'Calibri',
              size: 22, // 11pt
              color: '1E293B',
            },
            paragraph: {
              spacing: { line: 276, before: 100, after: 100 },
            },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1440, // 1 inch
                bottom: 1440,
                left: 1440,
                right: 1440,
              },
            },
          },
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: document.organizationName.toUpperCase(),
                      bold: true,
                      size: 18,
                      color: '64748B',
                    }),
                    new TextRun({
                      text: `   |   ${document.documentNumber} (v${document.version})`,
                      size: 18,
                      color: '94A3B8',
                    }),
                  ],
                  alignment: AlignmentType.RIGHT,
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: 'MEETWISE AI — Documento Confidencial   •   ',
                      size: 16,
                      color: '94A3B8',
                    }),
                    new TextRun({
                      children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES],
                      size: 16,
                      color: '94A3B8',
                    }),
                  ],
                  alignment: AlignmentType.CENTER,
                }),
              ],
            }),
          },
          children: [
            // Prominent Draft/Review Banner
            ...(document.approvalStatus === 'draft_ai'
              ? [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: '*** RASCUNHO NÃO APROVADO — GERADO POR INTELIGÊNCIA ARTIFICIAL ***',
                        bold: true,
                        color: 'DC2626',
                        size: 20,
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 100, after: 150 },
                  }),
                ]
              : (document.approvalStatus as string) === 'in_review' ||
                document.approvalStatus === 'pending_review'
              ? [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: '*** DOCUMENTO EM REVISÃO — PENDENTE DE VALIDAÇÃO HUMANA FINAL ***',
                        bold: true,
                        color: 'D97706',
                        size: 20,
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 100, after: 150 },
                  }),
                ]
              : []),

            // Title & Document Header
            new Paragraph({
              text: document.title,
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 200, after: 100 },
              run: {
                color: '0F172A',
                bold: true,
                size: 36, // 18pt
              },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Ata Oficial de Reunião • `,
                  bold: true,
                  color: '475569',
                }),
                new TextRun({
                  text: `Registo N.º ${document.documentNumber} • Estado: `,
                  color: '64748B',
                }),
                new TextRun({
                  text: statusLabel,
                  bold: true,
                  color: document.approvalStatus === 'final_signed' ? '15803D' : 'B45309',
                }),
              ],
              spacing: { after: 300 },
            }),

            // Metadata Grid Table
            this.createMetadataTable(document),

            // Section 1: Attendees
            this.createHeading('1. Participantes e Presenças'),
            this.createAttendeesTable(document),

            // Section 2: Agenda
            ...(document.agenda.length > 0
              ? [this.createHeading('2. Ordem de Trabalhos / Pontos de Pauta'), ...this.createList(document.agenda)]
              : []),

            // Section 3: Executive Summary
            this.createHeading('3. Resumo Executivo da Sessão'),
            this.createSummaryBox(document.executiveSummary),

            // Section 4: Discussions
            ...(document.discussions.length > 0
              ? [
                  this.createHeading('4. Síntese das Deliberações e Discussões'),
                  ...document.discussions.map(
                    (d) =>
                      new Paragraph({
                        children: [
                          new TextRun({ text: `• ${d.topic}: `, bold: true }),
                          new TextRun({ text: d.summary }),
                          ...(d.speaker ? [new TextRun({ text: ` (Interveniente: ${d.speaker})`, italics: true, color: '64748B' })] : []),
                        ],
                        spacing: { before: 80, after: 80 },
                      })
                  ),
                ]
              : []),

            // Section 5: Decisions Table
            this.createHeading('5. Deliberações e Decisões Formais'),
            this.createDecisionsTable(document, options),

            // Section 6: Action Items / Tasks Table
            this.createHeading('6. Tarefas e Plano de Ação'),
            this.createTasksTable(document, options),

            // Section 7: Pending Items
            ...(document.pendingItems.length > 0
              ? [this.createHeading('7. Pontos Pendentes e Próximos Passos'), ...this.createList(document.pendingItems)]
              : []),

            // Section 8: Approval & Signatures
            ...(options?.includeSignatures !== false
              ? [this.createHeading('8. Termo de Aprovação e Homologação'), this.createSignatureTable(document)]
              : []),

            // Legal Disclaimer
            new Paragraph({
              children: [
                new TextRun({
                  text: 'Aviso Legal: ',
                  bold: true,
                  size: 16,
                  color: '94A3B8',
                }),
                new TextRun({
                  text: 'Documento gerado com assistência de Inteligência Artificial pelo MEETWISE AI. A validade jurídica e homologação vinculativa dependem do cumprimento das disposições estatutárias e legais aplicáveis à organização.',
                  size: 16,
                  color: '94A3B8',
                }),
              ],
              spacing: { before: 500, after: 100 },
              alignment: AlignmentType.JUSTIFIED,
            }),
          ],
        },
      ],
    });

    return await Packer.toBuffer(doc);
  }

  private createHeading(text: string): Paragraph {
    return new Paragraph({
      text,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 360, after: 140 },
      run: {
        bold: true,
        size: 26, // 13pt
        color: '1E293B',
      },
    });
  }

  private createMetadataTable(document: CanonicalMeetingDocument): Table {
    const borders = {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
    };

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            this.createCell('Data:', true, 20),
            this.createCell(document.meetingDate + (document.meetingTime ? ` às ${document.meetingTime}` : ''), false, 30),
            this.createCell('Local:', true, 20),
            this.createCell(document.location, false, 30),
          ],
        }),
        new TableRow({
          children: [
            this.createCell('Presidente:', true, 20),
            this.createCell(document.chairperson, false, 30),
            this.createCell('Secretário(a):', true, 20),
            this.createCell(document.secretary, false, 30),
          ],
        }),
      ],
    });
  }

  private createAttendeesTable(document: CanonicalMeetingDocument): Table {
    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        this.createHeaderCell('Participante', 40),
        this.createHeaderCell('Cargo / Função', 35),
        this.createHeaderCell('Presença', 25),
      ],
    });

    const rows: TableRow[] = [headerRow];

    if (document.attendees.length === 0) {
      rows.push(
        new TableRow({
          children: [
            this.createCell('Nenhum participante registado formalmente', false, 100, { span: 3 }),
          ],
        })
      );
    } else {
      document.attendees.forEach((a, idx) => {
        const bg = idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
        rows.push(
          new TableRow({
            children: [
              this.createCell(a.name, false, 40, { bg }),
              this.createCell(a.role || '—', false, 35, { bg }),
              this.createCell(a.present ? 'Presente' : 'Ausente', true, 25, {
                bg,
                color: a.present ? '15803D' : 'DC2626',
              }),
            ],
          })
        );
      });
    }

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
    });
  }

  private createSummaryBox(summaryText: string): Table {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { type: ShadingType.CLEAR, fill: 'F8FAFC' },
              borders: {
                left: { style: BorderStyle.SINGLE, size: 24, color: '3B82F6' },
                top: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
              },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: summaryText, italics: false })],
                  spacing: { before: 120, after: 120 },
                }),
              ],
            }),
          ],
        }),
      ],
    });
  }

  private createDecisionsTable(document: CanonicalMeetingDocument, options?: ExportOptions): Table {
    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        this.createHeaderCell('Ref.', 10),
        this.createHeaderCell('Deliberação / Decisão', 50),
        this.createHeaderCell('Estado', 20),
        this.createHeaderCell('Responsável', 20),
      ],
    });

    const rows: TableRow[] = [headerRow];

    if (document.decisions.length === 0) {
      rows.push(
        new TableRow({
          children: [this.createCell('Nenhuma decisão registada', false, 100, { span: 4 })],
        })
      );
    } else {
      document.decisions.forEach((dec, idx) => {
        const bg = idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
        const paragraphs = [
          new Paragraph({ children: [new TextRun({ text: dec.text, bold: true })] }),
        ];

        if (dec.rationale) {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({ text: 'Fundamentação: ', bold: true, size: 18, color: '64748B' }),
                new TextRun({ text: dec.rationale, size: 18, color: '475569' }),
              ],
              spacing: { before: 40 },
            })
          );
        }

        if (dec.quote && options?.includeVerbatimQuotes !== false) {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({ text: 'Citação verbatim: ', italics: true, size: 16, color: '94A3B8' }),
                new TextRun({ text: `"${dec.quote}"`, italics: true, size: 16, color: '64748B' }),
              ],
              spacing: { before: 40 },
            })
          );
        }

        rows.push(
          new TableRow({
            children: [
              this.createCell(`D.${idx + 1}`, true, 10, { bg }),
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                shading: { type: ShadingType.CLEAR, fill: bg },
                children: paragraphs,
              }),
              this.createCell(this.translateDecisionStatus(dec.classification), true, 20, {
                bg,
                color: dec.classification === 'approved_decision' ? '15803D' : '475569',
              }),
              this.createCell(dec.responsible || '—', false, 20, { bg }),
            ],
          })
        );
      });
    }

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
    });
  }

  private createTasksTable(document: CanonicalMeetingDocument, options?: ExportOptions): Table {
    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        this.createHeaderCell('Ref.', 10),
        this.createHeaderCell('Ação / Tarefa', 45),
        this.createHeaderCell('Responsável', 20),
        this.createHeaderCell('Prazo', 15),
        this.createHeaderCell('Prioridade', 10),
      ],
    });

    const rows: TableRow[] = [headerRow];

    if (document.tasks.length === 0) {
      rows.push(
        new TableRow({
          children: [this.createCell('Nenhuma tarefa registada', false, 100, { span: 5 })],
        })
      );
    } else {
      document.tasks.forEach((task, idx) => {
        const bg = idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
        const paragraphs = [
          new Paragraph({ children: [new TextRun({ text: task.title, bold: true })] }),
        ];

        if (task.description) {
          paragraphs.push(
            new Paragraph({
              children: [new TextRun({ text: task.description, size: 18, color: '475569' })],
              spacing: { before: 40 },
            })
          );
        }

        rows.push(
          new TableRow({
            children: [
              this.createCell(`T.${idx + 1}`, true, 10, { bg }),
              new TableCell({
                width: { size: 45, type: WidthType.PERCENTAGE },
                shading: { type: ShadingType.CLEAR, fill: bg },
                children: paragraphs,
              }),
              this.createCell(task.assignee || 'Não atribuído', false, 20, { bg }),
              this.createCell(task.dueDate ? task.dueDate.split('T')[0] : 'A definir', false, 15, { bg }),
              this.createCell(task.priority.toUpperCase(), true, 10, {
                bg,
                color: task.priority === 'urgent' || task.priority === 'high' ? 'DC2626' : '475569',
              }),
            ],
          })
        );
      });
    }

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
    });
  }

  private createSignatureTable(document: CanonicalMeetingDocument): Table {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({ text: '________________________________________', spacing: { before: 300, after: 50 } }),
                new Paragraph({ text: document.chairperson, run: { bold: true } }),
                new Paragraph({ text: 'Presidente da Mesa', run: { size: 18, color: '64748B' } }),
              ],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({ text: '________________________________________', spacing: { before: 300, after: 50 } }),
                new Paragraph({ text: document.secretary, run: { bold: true } }),
                new Paragraph({ text: 'Secretário(a)', run: { size: 18, color: '64748B' } }),
              ],
            }),
          ],
        }),
      ],
    });
  }

  private createList(items: string[]): Paragraph[] {
    return items.map(
      (item, idx) =>
        new Paragraph({
          children: [
            new TextRun({ text: `${idx + 1}. `, bold: true }),
            new TextRun({ text: item }),
          ],
          spacing: { before: 60, after: 60 },
        })
    );
  }

  private createCell(
    text: string,
    bold: boolean,
    widthPercent: number,
    extra?: { bg?: string; color?: string; span?: number }
  ): TableCell {
    return new TableCell({
      width: { size: widthPercent, type: WidthType.PERCENTAGE },
      columnSpan: extra?.span,
      shading: extra?.bg ? { type: ShadingType.CLEAR, fill: extra.bg } : undefined,
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text,
              bold,
              color: extra?.color,
            }),
          ],
          spacing: { before: 60, after: 60 },
        }),
      ],
    });
  }

  private createHeaderCell(text: string, widthPercent: number): TableCell {
    return new TableCell({
      width: { size: widthPercent, type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, fill: '0F172A' },
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text,
              bold: true,
              color: 'FFFFFF',
              size: 20,
            }),
          ],
          spacing: { before: 80, after: 80 },
        }),
      ],
    });
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
