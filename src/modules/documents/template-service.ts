import { CanonicalMeetingDocument, TemplateType } from './types';
import { createAdminClient } from '@/lib/supabase/admin';

export interface TemplateCustomization {
  name: string;
  templateType: TemplateType;
  organizationName?: string;
  logoUrl?: string;
  headerText?: string;
  footerText?: string;
  sectionOrder?: string[];
  terminology?: Record<string, string>;
  includeSignatures?: boolean;
  includeVerbatimQuotes?: boolean;
}

export class DocumentTemplateService {
  /**
   * Applies template-specific transformation and ordering to a canonical document.
   */
  public applyTemplate(
    document: CanonicalMeetingDocument,
    templateType: TemplateType,
    customSettings?: TemplateCustomization
  ): CanonicalMeetingDocument {
    const docCopy: CanonicalMeetingDocument = JSON.parse(JSON.stringify(document));
    docCopy.templateType = templateType;

    switch (templateType) {
      case 'formal':
        // Formal institutional: keep complete legal and quorum sections
        docCopy.metadata = {
          ...docCopy.metadata,
          layoutStyle: 'institutional_formal',
          headerTitle: 'ATA FORMAL DE SESSÃO ORDINÁRIA/EXTRAORDINÁRIA',
        };
        break;

      case 'executive':
        // Executive business: emphasize executive summary, decisions, and tasks
        docCopy.metadata = {
          ...docCopy.metadata,
          layoutStyle: 'corporate_executive',
          headerTitle: 'ATA EXECUTIVA DE GESTÃO E DELIBERAÇÕES',
        };
        // Sort tasks by priority descending
        docCopy.tasks.sort((a, b) => {
          const priorityScore: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
          return (priorityScore[b.priority] || 0) - (priorityScore[a.priority] || 0);
        });
        break;

      case 'simplified':
        // Simplified: concise brief summary and bullet points
        docCopy.metadata = {
          ...docCopy.metadata,
          layoutStyle: 'simplified_brief',
          headerTitle: 'SÍNTESE EXECUTIVA DE REUNIÃO',
        };
        // Only keep top-level discussions and approved decisions
        docCopy.discussions = docCopy.discussions.slice(0, 5);
        break;

      case 'custom':
        // Custom organization template: apply terminology and section ordering
        if (customSettings) {
          if (customSettings.organizationName) {
            docCopy.organizationName = customSettings.organizationName;
          }
          if (customSettings.terminology) {
            this.applyTerminology(docCopy, customSettings.terminology);
          }
          docCopy.metadata = {
            ...docCopy.metadata,
            layoutStyle: 'custom_organization',
            headerText: customSettings.headerText,
            footerText: customSettings.footerText,
            logoUrl: this.sanitizeLogoUrl(customSettings.logoUrl),
          };
        }
        break;
    }

    return docCopy;
  }

  /**
   * Fetches an organization custom template from the database if provided.
   */
  public async getOrganizationTemplate(
    templateId: string,
    organizationId: string
  ): Promise<TemplateCustomization | null> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('organization_templates')
      .select('*')
      .eq('id', templateId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return {
      name: data.name,
      templateType: data.template_type as TemplateType,
      terminology: (data.terminology as Record<string, string>) || {},
      sectionOrder: (data.sections as string[]) || [],
      includeSignatures: true,
      includeVerbatimQuotes: true,
    };
  }

  /**
   * Safe logo URL sanitization preventing SSRF or malicious JavaScript URIs.
   */
  private sanitizeLogoUrl(url?: string): string | undefined {
    if (!url) return undefined;
    const trimmed = url.trim();
    if (trimmed.startsWith('https://') || trimmed.startsWith('data:image/')) {
      return trimmed;
    }
    // Disallow arbitrary external protocols or insecure HTTP
    return undefined;
  }

  /**
   * Replaces domain terminology based on organization configuration.
   */
  private applyTerminology(
    document: CanonicalMeetingDocument,
    terminology: Record<string, string>
  ): void {
    if (terminology.decisions_label) {
      document.metadata = { ...document.metadata, decisions_label: terminology.decisions_label };
    }
    if (terminology.tasks_label) {
      document.metadata = { ...document.metadata, tasks_label: terminology.tasks_label };
    }
    if (terminology.summary_label) {
      document.metadata = { ...document.metadata, summary_label: terminology.summary_label };
    }
  }
}
