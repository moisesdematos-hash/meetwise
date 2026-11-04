import { z } from 'zod';

export const auditEventSchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid().nullable().optional(),
  action: z.string().min(2),
  resourceType: z.string().min(2),
  resourceId: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
  ipAddress: z.string().nullable().optional(),
});

export type AuditEvent = z.infer<typeof auditEventSchema>;

export interface IAuditService {
  record(event: AuditEvent): Promise<void>;
}
