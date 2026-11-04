export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'TENANT_MISMATCH'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INTEGRATION_ERROR'
  | 'INTERNAL_SERVER_ERROR';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(options: {
    message: string;
    code: ErrorCode;
    statusCode?: number;
    details?: unknown;
    isOperational?: boolean;
  }) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    this.statusCode = options.statusCode ?? this.getDefaultStatusCode(options.code);
    this.details = options.details;
    this.isOperational = options.isOperational ?? true;

    Error.captureStackTrace(this, this.constructor);
  }

  private getDefaultStatusCode(code: ErrorCode): number {
    switch (code) {
      case 'UNAUTHORIZED':
        return 401;
      case 'FORBIDDEN':
      case 'TENANT_MISMATCH':
        return 403;
      case 'NOT_FOUND':
        return 404;
      case 'VALIDATION_ERROR':
        return 422;
      case 'CONFLICT':
      case 'IDEMPOTENCY_CONFLICT':
        return 409;
      case 'QUOTA_EXCEEDED':
        return 402;
      case 'RATE_LIMITED':
        return 429;
      case 'INTEGRATION_ERROR':
        return 502;
      case 'INTERNAL_SERVER_ERROR':
      default:
        return 500;
    }
  }
}

export interface StandardApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    correlationId: string;
  };
  meta?: {
    timestamp: string;
    correlationId: string;
  };
}

export function formatErrorResponse(
  error: unknown,
  correlationId: string
): { response: StandardApiResponse<never>; status: number } {
  if (error instanceof AppError) {
    return {
      status: error.statusCode,
      response: {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          correlationId,
        },
        meta: {
          timestamp: new Date().toISOString(),
          correlationId,
        },
      },
    };
  }

  const message = error instanceof Error ? error.message : 'An unexpected error occurred';
  return {
    status: 500,
    response: {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message,
        correlationId,
      },
      meta: {
        timestamp: new Date().toISOString(),
        correlationId,
      },
    },
  };
}
