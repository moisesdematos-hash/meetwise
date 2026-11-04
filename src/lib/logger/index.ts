export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  correlationId?: string;
  organizationId?: string;
  userId?: string;
  meetingId?: string;
  [key: string]: unknown;
}

const SENSITIVE_KEYS = [
  'password',
  'token',
  'secret',
  'key',
  'authorization',
  'api_key',
  'apikey',
  'cookie',
  'jwt',
];

function sanitizeContext(context?: LogContext): Record<string, unknown> {
  if (!context) return {};
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    const isSensitive = SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s));
    if (isSensitive) {
      cleaned[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      cleaned[key] = sanitizeContext(value as LogContext);
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

export class Logger {
  private readonly defaultContext: LogContext;

  constructor(defaultContext: LogContext = {}) {
    this.defaultContext = defaultContext;
  }

  public child(context: LogContext): Logger {
    return new Logger({ ...this.defaultContext, ...context });
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: unknown): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: sanitizeContext({ ...this.defaultContext, ...context }),
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            }
          : error,
    };

    const formatted = JSON.stringify(entry);
    if (level === 'error') {
      console.error(formatted);
    } else if (level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  public debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV === 'development') {
      this.log('debug', message, context);
    }
  }

  public info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  public warn(message: string, context?: LogContext, error?: unknown): void {
    this.log('warn', message, context, error);
  }

  public error(message: string, context?: LogContext, error?: unknown): void {
    this.log('error', message, context, error);
  }
}

export const logger = new Logger();
