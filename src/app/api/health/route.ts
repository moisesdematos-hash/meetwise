import { NextResponse } from 'next/server';
import type { StandardApiResponse } from '@/lib/errors/app-error';

export async function GET() {
  const correlationId = crypto.randomUUID();

  const responseBody: StandardApiResponse<{
    status: string;
    version: string;
    environment: string;
    timestamp: string;
  }> = {
    success: true,
    data: {
      status: 'healthy',
      version: '0.1.0',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    },
    meta: {
      timestamp: new Date().toISOString(),
      correlationId,
    },
  };

  return NextResponse.json(responseBody, {
    status: 200,
    headers: {
      'X-Correlation-Id': correlationId,
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
