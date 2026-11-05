import {
  CanonicalMeetingDocument,
  ExportOptions,
  ExportResult,
  IDocumentGenerationService,
} from './types';
import { DocxExportService } from './exporters/docx';
import { PdfExportService } from './exporters/pdf';
import { TextExportService } from './exporters/text';
import { DocumentTemplateService } from './template-service';
import { DocumentAuditService } from './audit-service';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/errors/app-error';

export class DocumentGenerationService implements IDocumentGenerationService {
  private docxExporter: DocxExportService;
  private pdfExporter: PdfExportService;
  private textExporter: TextExportService;
  private templateService: DocumentTemplateService;
  private auditService: DocumentAuditService;

  constructor() {
    this.docxExporter = new DocxExportService();
    this.pdfExporter = new PdfExportService();
    this.textExporter = new TextExportService();
    this.templateService = new DocumentTemplateService();
    this.auditService = new DocumentAuditService();
  }

  /**
   * Generates a binary document export (DOCX, PDF, or TXT) from the canonical model.
   * Persists export metadata to Supabase and records an audit trail.
   */
  public async generateExport(
    document: CanonicalMeetingDocument,
    options: ExportOptions
  ): Promise<ExportResult> {
    const templateType = options.templateType || document.templateType || 'formal';

    // 1. Apply template layout adjustments
    let processedDoc = this.templateService.applyTemplate(document, templateType);

    // If custom template ID is requested, fetch and apply organization rules
    if (options.templateId) {
      const customTemplate = await this.templateService.getOrganizationTemplate(
        options.templateId,
        document.organizationId
      );
      if (customTemplate) {
        processedDoc = this.templateService.applyTemplate(document, 'custom', customTemplate);
      }
    }

    // 2. Generate file buffer based on requested format
    let buffer: Buffer;
    let mimeType: string;
    let extension: string;

    switch (options.format) {
      case 'docx':
        buffer = await this.docxExporter.exportToDocx(processedDoc, options);
        mimeType =
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        extension = 'docx';
        break;

      case 'pdf':
        buffer = await this.pdfExporter.exportToPdf(processedDoc, options);
        mimeType = 'application/pdf';
        extension = 'pdf';
        break;

      case 'txt':
        const textContent = this.textExporter.exportToText(processedDoc, options);
        buffer = Buffer.from(textContent, 'utf-8');
        mimeType = 'text/plain; charset=utf-8';
        extension = 'txt';
        break;

      default:
        throw new AppError({
          message: `Formato de exportação não suportado: ${(options as any).format}`,
          code: 'VALIDATION_ERROR',
          statusCode: 400,
        });
    }

    // Sanitize document number for filename
    const safeDocNumber = document.documentNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = `${safeDocNumber}_v${document.version}.${extension}`;
    const storagePath = `${document.organizationId}/${document.meetingId}/${document.documentId}/v${document.version}/${filename}`;

    // 3. Persist export record to PostgreSQL meeting_documents
    const supabase = createAdminClient();
    try {
      // Optional upload to private storage bucket if configured
      await supabase.storage
        .from('meeting_documents')
        .upload(storagePath, buffer, {
          contentType: mimeType,
          upsert: true,
        });

      await supabase.from('meeting_documents').insert({
        meeting_id: document.meetingId,
        organization_id: document.organizationId,
        minutes_id: document.documentId,
        doc_type: options.format,
        storage_bucket: 'meeting_documents',
        storage_path: storagePath,
        filename,
        file_size_bytes: buffer.length,
        version: document.version,
        template_type: templateType,
        template_id: options.templateId || null,
        status: 'completed',
        metadata: {
          approvalStatus: document.approvalStatus,
          documentNumber: document.documentNumber,
        },
      });

      // Update minutes export status
      await supabase
        .from('meeting_minutes')
        .update({
          export_status: 'exported',
          last_exported_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', document.documentId);
    } catch (err) {
      console.warn(
        '[DocumentGenerationService] Storage upload or record write warning (non-fatal for streaming export):',
        err
      );
    }

    // 4. Log audit event
    await this.auditService.logDocumentEvent({
      organizationId: document.organizationId,
      action: 'document_exported',
      resourceId: document.documentId,
      metadata: {
        format: options.format,
        templateType,
        version: document.version,
        documentNumber: document.documentNumber,
        sizeBytes: buffer.length,
      },
    });

    return {
      buffer,
      filename,
      mimeType,
      format: options.format,
      sizeBytes: buffer.length,
      documentNumber: document.documentNumber,
      version: document.version,
    };
  }
}
