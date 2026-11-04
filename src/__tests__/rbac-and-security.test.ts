import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  assertPermission,
  assertCanAssignRole,
  type OrganizationRole,
  type Permission,
} from '@/modules/auth';
import { validateOwnerRemoval, generateSlug } from '@/modules/organizations';

describe('RBAC & Role-Based Permissions', () => {
  it('should give owner full access permissions', () => {
    const ownerPermissions: Permission[] = [
      'org:read',
      'org:update',
      'org:delete',
      'org:manage_billing',
      'org:manage_members',
      'meeting:create',
      'meeting:read',
      'meeting:delete',
      'media:upload',
      'transcript:edit',
      'minutes:approve',
      'audit:read',
    ];

    for (const perm of ownerPermissions) {
      expect(hasPermission('owner', perm)).toBe(true);
    }
  });

  it('should restrict viewers to read-only capabilities', () => {
    expect(hasPermission('viewer', 'meeting:read')).toBe(true);
    expect(hasPermission('viewer', 'transcript:read')).toBe(true);
    expect(hasPermission('viewer', 'media:download')).toBe(true);

    // Forbidden for viewer
    expect(hasPermission('viewer', 'meeting:create')).toBe(false);
    expect(hasPermission('viewer', 'meeting:delete')).toBe(false);
    expect(hasPermission('viewer', 'media:upload')).toBe(false);
    expect(hasPermission('viewer', 'transcript:edit')).toBe(false);
    expect(hasPermission('viewer', 'org:manage_billing')).toBe(false);
  });

  it('should throw AppError when assertPermission fails', () => {
    expect(() => assertPermission('member', 'org:delete')).toThrow("does not possess required permission 'org:delete'");
    expect(() => assertPermission('manager', 'org:manage_billing')).toThrow("does not possess required permission 'org:manage_billing'");
  });

  it('should prevent privilege escalation during role assignments', () => {
    // Owner can assign any role
    expect(() => assertCanAssignRole('owner', 'admin')).not.toThrow();
    expect(() => assertCanAssignRole('owner', 'owner')).not.toThrow();

    // Admin cannot assign owner role
    expect(() => assertCanAssignRole('admin', 'owner')).toThrow('exceeds or equals operator role privilege');

    // Admin cannot assign admin role
    expect(() => assertCanAssignRole('admin', 'admin')).toThrow('exceeds or equals operator role privilege');

    // Admin can assign manager, member, viewer
    expect(() => assertCanAssignRole('admin', 'manager')).not.toThrow();
    expect(() => assertCanAssignRole('admin', 'member')).not.toThrow();
    expect(() => assertCanAssignRole('admin', 'viewer')).not.toThrow();

    // Member cannot assign any higher role
    expect(() => assertCanAssignRole('member', 'admin')).toThrow();
    expect(() => assertCanAssignRole('member', 'member')).toThrow();
  });
});

describe('Organization Tenancy & Last Owner Protection', () => {
  it('should prevent removing or demoting the last active owner', () => {
    const singleOwnerOrg = [{ role: 'owner' as OrganizationRole, status: 'active' }];
    expect(() => validateOwnerRemoval(singleOwnerOrg, 'user-1', 'owner')).toThrow(
      'Cannot remove or demote the last remaining owner'
    );
  });

  it('should allow removing an owner if another active owner exists', () => {
    const multiOwnerOrg = [
      { role: 'owner' as OrganizationRole, status: 'active' },
      { role: 'owner' as OrganizationRole, status: 'active' },
    ];
    expect(() => validateOwnerRemoval(multiOwnerOrg, 'user-1', 'owner')).not.toThrow();
  });

  it('should generate valid URL slugs from organization names', () => {
    const slug = generateSlug('Empresa de Reuniões & Inovação, Lda.');
    expect(slug).toMatch(/^empresa-de-reunioes-inovacao-lda-[a-z0-9]{4}$/);
  });
});
