import { DocumentAuditEvent, IDocumentAuditService } from './types';
import { createAdminClient } from '@/lib/supabase/admin';

export class DocumentAuditService implements IDocumentAuditService {
  /**
   * Logs a document lifecycle event in the immutable audit log table.
   * Sanitizes payloads to ensure sensitive meeting transcript text is not stored in plain log metadata.
   */
  public async logDocumentEvent(event: DocumentAuditEvent): Promise<void> {
    const supabase = createAdminClient();

    // Sanitize metadata to avoid logging sensitive transcripts or raw tokens
    const sanitizedMetadata: Record<string, any> = { ...event.metadata };
    delete sanitizedMetadata.rawToken;
    delete sanitizedMetadata.transcript;
    delete sanitizedMetadata.fullContent;

    const record = {
      organization_id: event.organizationId,
      user_id: event.userId || null,
      action: event.action,
      resource_type: 'meeting_document',
      resource_id: event.resourceId,
      metadata: sanitizedMetadata,
      ip_address: event.ipAddress || null,
      created_at: new Date().toISOString(),
    };

    try {
      await supabase.from('audit_logs').insert(record);
    } catch (err) {
      console.error('[DocumentAuditService] Failed to write audit log:', err);
    }
  }
}
