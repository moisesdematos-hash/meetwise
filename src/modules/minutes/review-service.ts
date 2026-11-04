import { AppError } from '@/lib/errors/app-error';
import type { Database, MinutesReviewStatus, OrganizationRole } from '@/lib/supabase/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { validateMinutesStatusTransition } from './index';

export interface UpdateMinutesParams {
  minutesId: string;
  organizationId: string;
  userId: string;
  userRole?: OrganizationRole | string;
  targetStatus?: MinutesReviewStatus;
  content?: string;
  title?: string;
  sections?: Record<string, any>[];
  metadata?: Record<string, any>;
}

export interface SignMinutesParams {
  minutesId: string;
  organizationId: string;
  userId: string;
  userRole?: OrganizationRole | string;
}

export class HumanReviewService {
  private supabase: SupabaseClient<Database>;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
  }

  private assertCanEdit(role?: string): void {
    if (role === 'viewer') {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Utilizadores com perfil de visualizador (viewer) não podem editar ou aprovar atas.',
      });
    }
  }

  /**
   * Updates meeting minutes content and/or review status, enforcing state machine
   * constraints, RBAC, version incrementation, and an immutable audit log.
   */
  async updateMinutesReview(params: UpdateMinutesParams) {
    this.assertCanEdit(params.userRole);

    // Fetch existing minutes
    const { data: minutes, error: fetchErr } = await this.supabase
      .from('meeting_minutes')
      .select('*')
      .eq('id', params.minutesId)
      .eq('organization_id', params.organizationId)
      .single();

    if (fetchErr || !minutes) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Ata de reunião não encontrada ou não pertence a esta organização.',
      });
    }

    // Check immutability
    if (minutes.review_status === 'final_signed') {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Ata já finalizada e assinada digitalmente. Não são permitidas novas alterações.',
      });
    }

    const previousStatus = minutes.review_status;
    const newStatus = params.targetStatus || previousStatus;

    if (params.targetStatus && params.targetStatus !== previousStatus) {
      validateMinutesStatusTransition(previousStatus, params.targetStatus);
    }

    const isContentChanged =
      (params.content !== undefined && params.content !== minutes.content) ||
      (params.sections !== undefined && JSON.stringify(params.sections) !== JSON.stringify(minutes.sections)) ||
      (params.title !== undefined && params.title !== minutes.title);

    const newVersion = isContentChanged ? (minutes.version || 1) + 1 : minutes.version;

    const updates: Partial<Database['public']['Tables']['meeting_minutes']['Update']> = {
      updated_at: new Date().toISOString(),
    };

    if (params.title !== undefined) updates.title = params.title;
    if (params.content !== undefined) updates.content = params.content;
    if (params.sections !== undefined) updates.sections = params.sections as any;
    if (params.metadata !== undefined) {
      updates.metadata = { ...(minutes.metadata as Record<string, any> || {}), ...params.metadata };
    }

    if (params.targetStatus) {
      updates.review_status = params.targetStatus;
      if (params.targetStatus === 'validated_human' || params.targetStatus === 'final_signed') {
        updates.reviewed_by = params.userId;
        updates.reviewed_at = new Date().toISOString();
      }
    }

    if (isContentChanged) {
      updates.version = newVersion;
    }

    const { data: updated, error: updateErr } = await this.supabase
      .from('meeting_minutes')
      .update(updates)
      .eq('id', params.minutesId)
      .eq('organization_id', params.organizationId)
      .select('*')
      .single();

    if (updateErr || !updated) {
      throw new AppError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Falha ao atualizar ata: ${updateErr?.message || 'erro desconhecido'}`,
      });
    }

    // Record audit log entry
    await this.supabase.from('audit_logs').insert({
      organization_id: params.organizationId,
      user_id: params.userId,
      action: isContentChanged ? 'minutes.content_updated' : 'minutes.status_updated',
      resource_type: 'meeting_minutes',
      resource_id: params.minutesId,
      metadata: {
        meeting_id: minutes.meeting_id,
        previous_status: previousStatus,
        new_status: updated.review_status,
        previous_version: minutes.version,
        new_version: updated.version,
        changes_applied: {
          content_modified: isContentChanged,
          status_changed: previousStatus !== newStatus,
        },
      },
    });

    return updated;
  }

  /**
   * Finalizes and signs minutes, locking them permanently from further edits.
   */
  async signMinutes(params: SignMinutesParams) {
    return this.updateMinutesReview({
      minutesId: params.minutesId,
      organizationId: params.organizationId,
      userId: params.userId,
      userRole: params.userRole,
      targetStatus: 'final_signed',
    });
  }

  /**
   * Fetches minutes and associated audit log events for validation traceability.
   */
  async getMinutesWithAuditHistory(params: { minutesId: string; organizationId: string }) {
    const { data: minutes, error: fetchErr } = await this.supabase
      .from('meeting_minutes')
      .select('*')
      .eq('id', params.minutesId)
      .eq('organization_id', params.organizationId)
      .single();

    if (fetchErr || !minutes) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Ata não encontrada.',
      });
    }

    const { data: logs } = await this.supabase
      .from('audit_logs')
      .select('*')
      .eq('organization_id', params.organizationId)
      .eq('resource_type', 'meeting_minutes')
      .eq('resource_id', params.minutesId)
      .order('created_at', { ascending: false });

    return {
      minutes,
      auditHistory: logs || [],
    };
  }
}
