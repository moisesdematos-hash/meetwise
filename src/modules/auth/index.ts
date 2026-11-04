import { AppError } from '@/lib/errors/app-error';

export type OrganizationRole = 'owner' | 'admin' | 'manager' | 'member' | 'viewer';

export type Permission =
  | 'org:read'
  | 'org:update'
  | 'org:delete'
  | 'org:manage_billing'
  | 'org:manage_members'
  | 'meeting:create'
  | 'meeting:read'
  | 'meeting:update'
  | 'meeting:delete'
  | 'media:upload'
  | 'media:download'
  | 'transcript:read'
  | 'transcript:edit'
  | 'minutes:generate'
  | 'minutes:review'
  | 'minutes:approve'
  | 'task:create'
  | 'task:update'
  | 'audit:read';

export const ROLE_PERMISSIONS: Record<OrganizationRole, Permission[]> = {
  owner: [
    'org:read',
    'org:update',
    'org:delete',
    'org:manage_billing',
    'org:manage_members',
    'meeting:create',
    'meeting:read',
    'meeting:update',
    'meeting:delete',
    'media:upload',
    'media:download',
    'transcript:read',
    'transcript:edit',
    'minutes:generate',
    'minutes:review',
    'minutes:approve',
    'task:create',
    'task:update',
    'audit:read',
  ],
  admin: [
    'org:read',
    'org:update',
    'org:manage_billing',
    'org:manage_members',
    'meeting:create',
    'meeting:read',
    'meeting:update',
    'meeting:delete',
    'media:upload',
    'media:download',
    'transcript:read',
    'transcript:edit',
    'minutes:generate',
    'minutes:review',
    'minutes:approve',
    'task:create',
    'task:update',
    'audit:read',
  ],
  manager: [
    'org:read',
    'meeting:create',
    'meeting:read',
    'meeting:update',
    'media:upload',
    'media:download',
    'transcript:read',
    'transcript:edit',
    'minutes:generate',
    'minutes:review',
    'minutes:approve',
    'task:create',
    'task:update',
  ],
  member: [
    'org:read',
    'meeting:create',
    'meeting:read',
    'meeting:update',
    'media:upload',
    'media:download',
    'transcript:read',
    'transcript:edit',
    'minutes:generate',
    'minutes:review',
    'task:create',
    'task:update',
  ],
  viewer: [
    'org:read',
    'meeting:read',
    'media:download',
    'transcript:read',
  ],
};

export function hasPermission(role: OrganizationRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function assertPermission(role: OrganizationRole, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new AppError({
      code: 'FORBIDDEN',
      message: `Role '${role}' does not possess required permission '${permission}'.`,
    });
  }
}

/**
 * Validates that an operator cannot assign a role higher or equal to their own,
 * unless they are the owner.
 */
export function assertCanAssignRole(operatorRole: OrganizationRole, targetRole: OrganizationRole): void {
  const roleHierarchy: Record<OrganizationRole, number> = {
    owner: 5,
    admin: 4,
    manager: 3,
    member: 2,
    viewer: 1,
  };

  if (operatorRole !== 'owner' && roleHierarchy[targetRole] >= roleHierarchy[operatorRole]) {
    throw new AppError({
      code: 'FORBIDDEN',
      message: `Cannot assign role '${targetRole}': exceeds or equals operator role privilege.`,
    });
  }
}
