import { z } from 'zod';
import { AppError } from '@/lib/errors/app-error';
import type { OrganizationRole } from '../auth';

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'Organization name must be at least 2 characters').max(100),
  default_language: z.enum(['pt', 'pt-BR', 'en', 'es', 'fr']).default('pt'),
});

export const updateMemberRoleSchema = z.object({
  targetUserId: z.string().uuid(),
  newRole: z.enum(['owner', 'admin', 'manager', 'member', 'viewer']),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'manager', 'member', 'viewer']),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const randomSuffix = Math.random().toString(36).substring(2, 6);
  return `${base || 'org'}-${randomSuffix}`;
}

export function validateOwnerRemoval(activeMembers: Array<{ role: OrganizationRole; status: string }>, targetUserId: string, targetRole: OrganizationRole): void {
  if (targetRole === 'owner') {
    const activeOwnerCount = activeMembers.filter(
      (m) => m.role === 'owner' && m.status === 'active'
    ).length;

    if (activeOwnerCount <= 1) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Cannot remove or demote the last remaining owner of the organization.',
      });
    }
  }
}
