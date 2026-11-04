import { AppError } from '@/lib/errors/app-error';

export interface SystemHealthMetrics {
  status: 'healthy' | 'degraded' | 'down';
  databaseConnected: boolean;
  storageReachable: boolean;
  activeJobsCount: number;
  timestamp: string;
}

export function assertSuperAdminAccess(userRole?: string): void {
  if (userRole !== 'superadmin' && userRole !== 'owner') {
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'Access denied: administrative privileges required.',
    });
  }
}
