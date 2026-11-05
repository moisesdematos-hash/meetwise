import { describe, it, expect } from 'vitest';
import { AdminService } from '@/modules/billing/admin-service';
import {
  hasPlatformPermission,
  assertPlatformPermission,
  hasPermission,
  type PlatformRole,
} from '@/modules/auth';

describe('Phase 6 — Platform Administration & Mandatory Audit Logging', () => {
  const adminService = new AdminService();

  it('should verify platform role permissions correctly', () => {
    // Super admin has full access
    expect(hasPlatformPermission('super_admin', 'platform:full_access')).toBe(true);
    expect(hasPlatformPermission('super_admin', 'platform:manage_refunds')).toBe(true);

    // Billing admin has refund and cost access, but not full_access
    expect(hasPlatformPermission('billing_admin', 'platform:manage_refunds')).toBe(true);
    expect(hasPlatformPermission('billing_admin', 'platform:full_access')).toBe(false);

    // Support admin has only read & health access
    expect(hasPlatformPermission('support_admin', 'platform:system_health')).toBe(true);
    expect(hasPlatformPermission('support_admin', 'platform:manage_refunds')).toBe(false);

    // Assertion throws on forbidden platform permission
    expect(() => assertPlatformPermission('support_admin', 'platform:manage_refunds')).toThrow();
  });

  it('should verify organization billing_manager role has financial permissions', () => {
    expect(hasPermission('billing_manager', 'org:manage_billing')).toBe(true);
    expect(hasPermission('billing_manager', 'org:read')).toBe(true);
    expect(hasPermission('billing_manager', 'meeting:delete')).toBe(false);
  });

  it('should enforce mandatory justification (minimum 10 characters) for sensitive admin actions', async () => {
    // Rejected: empty or too short justification
    await expect(
      adminService.applyManualAdjustment({
        organizationId: 'org-test-uuid',
        adminUserId: 'admin-test-uuid',
        action: 'add_minutes',
        value: 120,
        justification: 'too short',
      })
    ).rejects.toThrow();

    // Accepted: detailed legal/commercial justification
    const res = await adminService.applyManualAdjustment({
      organizationId: 'org-test-uuid',
      adminUserId: 'admin-test-uuid',
      action: 'add_minutes',
      value: 120,
      justification: 'Compensação comercial aprovada por instabilidade na rede do cliente.',
    });
    expect(res.success).toBe(true);
    expect(res.auditLogId).toBeDefined();
  });

  it('should return aggregated platform metrics with gross margin', async () => {
    const metrics = await adminService.getPlatformMetrics();
    expect(metrics.totalOrganizations).toBeGreaterThan(0);
    expect(metrics.activeSubscriptions).toBeGreaterThan(0);
    expect(metrics.grossMarginPercentage).toBeGreaterThan(80);
    expect(metrics.directCostsUsd).toBeGreaterThan(0);
  });
});
