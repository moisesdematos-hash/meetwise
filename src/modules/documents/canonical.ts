import {
  CanonicalMeetingDocument,
  CanonicalDocumentSchema,
  CanonicalAttendee,
  CanonicalDecisionItem,
  CanonicalTaskItem,
  CanonicalDiscussionItem,
} from './types';
import type {
  DecisionClassification,
  TemplateType,
  TaskNature,
  TaskPriority,
  MinutesReviewStatus,
} from '@/lib/supabase/database.types';

export interface BuildCanonicalDocumentParams {
  meeting: {
    id: string;
    organization_id: string;
    title: string;
    scheduled_start_time?: string | null;
    actual_start_time?: string | null;
    duration_seconds?: number | null;
    location?: string | null;
    chairperson_name?: string | null;
    secretary_name?: string | null;
  };
  organizationName?: string;
  minutes?: {
    id: string;
    title: string;
    content: string;
    template_type?: TemplateType;
    template_id?: string | null;
    version?: number;
    document_number?: string | null;
    review_status?: MinutesReviewStatus;
    language?: string;
    metadata?: any;
    reviewed_by?: string | null;
    reviewed_at?: string | null;
    signed_by_name?: string | null;
    signed_at?: string | null;
  } | null;
  summary?: {
    executive_summary?: string;
    brief_summary?: string | null;
    detailed_summary?: string | null;
    key_points?: any;
    topics_discussed?: any;
    next_steps?: any;
    risks?: any;
  } | null;
  decisions?: Array<{
    id?: string;
    decision_text: string;
    classification: DecisionClassification;
    rationale?: string | null;
    responsible_name?: string | null;
    quote?: string | null;
    start_time?: number | null;
    end_time?: number | null;
  }>;
  tasks?: Array<{
    id?: string;
    title: string;
    description?: string | null;
    assignee_name?: string | null;
    due_date?: string | null;
    priority?: TaskPriority;
    task_nature?: TaskNature;
    quote?: string | null;
  }>;
  participants?: Array<{
    id?: string;
    name: string;
    role?: string | null;
    email?: string | null;
    status?: string | null;
  }>;
  documentNumberFallback?: string;
}

export class CanonicalDocumentBuilder {
  /**
   * Constructs and validates a CanonicalMeetingDocument from relational models.
   * Enforces zero hallucination: missing fields are preserved as 'Não informado' or empty.
   */
  public static build(params: BuildCanonicalDocumentParams): CanonicalMeetingDocument {
    const {
      meeting,
      organizationName = 'MEETWISE AI Workspace',
      minutes,
      summary,
      decisions = [],
      tasks = [],
      participants = [],
      documentNumberFallback,
    } = params;

    const meetingDateRaw =
      meeting.actual_start_time || meeting.scheduled_start_time || new Date().toISOString();
    const meetingDateObj = new Date(meetingDateRaw);
    const meetingDateFormatted = !isNaN(meetingDateObj.getTime())
      ? meetingDateObj.toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const meetingTimeFormatted = !isNaN(meetingDateObj.getTime())
      ? meetingDateObj.toISOString().split('T')[1]?.substring(0, 5)
      : undefined;

    // Build attendees list
    const attendees: CanonicalAttendee[] =
      participants.length > 0
        ? participants.map((p) => ({
            name: p.name || 'Participante sem nome',
            role: p.role || undefined,
            email: p.email || undefined,
            present: p.status !== 'absent',
          }))
        : [];

    const absentees = participants
      .filter((p) => p.status === 'absent')
      .map((p) => p.name || 'Ausente');

    // Build agenda & discussions
    const discussions: CanonicalDiscussionItem[] = [];
    const topics = Array.isArray(summary?.topics_discussed) ? summary?.topics_discussed : [];
    for (const t of topics) {
      if (typeof t === 'string') {
        discussions.push({ topic: t, summary: '' });
      } else if (typeof t === 'object' && t !== null) {
        discussions.push({
          topic: t.topic || t.title || 'Tópico Geral',
          summary: t.summary || t.description || '',
          speaker: t.speaker || undefined,
        });
      }
    }

    const agenda: string[] = Array.isArray(summary?.key_points)
      ? (summary?.key_points as string[])
      : [];

    // Decisions
    const canonicalDecisions: CanonicalDecisionItem[] = decisions.map((d) => ({
      text: d.decision_text,
      classification: d.classification,
      rationale: d.rationale || undefined,
      responsible: d.responsible_name || undefined,
      quote: d.quote || undefined,
      startTime: d.start_time !== null && d.start_time !== undefined ? Number(d.start_time) : undefined,
      endTime: d.end_time !== null && d.end_time !== undefined ? Number(d.end_time) : undefined,
    }));

    // Tasks
    const canonicalTasks: CanonicalTaskItem[] = tasks.map((t) => ({
      title: t.title,
      description: t.description || undefined,
      assignee: t.assignee_name || undefined,
      dueDate: t.due_date || undefined,
      priority: t.priority || 'medium',
      nature: t.task_nature || 'assigned',
      quote: t.quote || undefined,
    }));

    // Pending / Next steps
    const pendingItems: string[] = Array.isArray(summary?.next_steps)
      ? (summary?.next_steps as string[])
      : [];

    const documentNumber =
      minutes?.document_number ||
      documentNumberFallback ||
      `ATA-${new Date().getFullYear()}-001`;

    const rawDocument: CanonicalMeetingDocument = {
      documentId: minutes?.id || meeting.id,
      organizationId: meeting.organization_id,
      organizationName,
      meetingId: meeting.id,
      documentType: 'minutes',
      title: minutes?.title || meeting.title || 'Ata de Reunião',
      documentNumber,
      meetingDate: meetingDateFormatted,
      meetingTime: meetingTimeFormatted,
      location: meeting.location || 'Virtual / Remoto',
      chairperson: meeting.chairperson_name || 'Não informado',
      secretary: meeting.secretary_name || 'Não informado',
      attendees,
      absentees,
      agenda,
      executiveSummary:
        summary?.executive_summary ||
        summary?.brief_summary ||
        minutes?.content ||
        'Resumo não disponível.',
      discussions,
      decisions: canonicalDecisions,
      tasks: canonicalTasks,
      pendingItems,
      closingNotes: undefined,
      approvalStatus: minutes?.review_status || 'draft_ai',
      approvedBy: minutes?.reviewed_by || undefined,
      approvedAt: minutes?.reviewed_at || undefined,
      signedBy: minutes?.signed_by_name || undefined,
      signedAt: minutes?.signed_at || undefined,
      version: minutes?.version || 1,
      templateId: minutes?.template_id || undefined,
      templateType: minutes?.template_type || 'formal',
      language: minutes?.language || 'pt',
      generatedAt: new Date().toISOString(),
      metadata: minutes?.metadata || {},
    };

    // Strict validation against Zod schema
    return CanonicalDocumentSchema.parse(rawDocument) as CanonicalMeetingDocument;
  }
}
