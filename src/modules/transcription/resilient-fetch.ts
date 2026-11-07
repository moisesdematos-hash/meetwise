import { AppError } from '@/lib/errors/app-error';

export interface ResilientFetchOptions {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  apiKeyToRedact?: string;
  providerName?: string;
  signal?: AbortSignal;
}

/**
 * Executes a resilient HTTP fetch with strict timeout, exponential backoff,
 * Retry-After header support, permanent/transient error classification, and credential redaction.
 */
export async function executeResilientSTTFetch(
  url: string,
  init: RequestInit,
  options: ResilientFetchOptions = {}
): Promise<Response> {
  const {
    timeoutMs = 30000,
    maxRetries = 2,
    retryDelayMs = 150,
    apiKeyToRedact,
    providerName = 'STT Provider',
    signal: externalSignal,
  } = options;

  let attempt = 0;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error(`Timeout de ${timeoutMs}ms excedido na chamada ao ${providerName}`));
    }, timeoutMs);

    const onExternalAbort = () => {
      controller.abort(new Error('Operação abortada'));
    };

    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timeoutId);
        throw new AppError({
          code: 'OPERATION_CANCELLED',
          message: 'Operação de transcrição cancelada pelo utilizador.',
          statusCode: 499,
        });
      }
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }

      if (response.ok) {
        return response;
      }

      const status = response.status;
      const rawText = await response.text().catch(() => '');
      const sanitizedText =
        apiKeyToRedact && apiKeyToRedact.length > 3
          ? rawText.split(apiKeyToRedact).join('[REDACTED]')
          : rawText;

      // Non-retryable permanent client errors
      if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) {
        throw new AppError({
          code: status === 401 || status === 403 ? 'UNAUTHORIZED' : 'VALIDATION_ERROR',
          message: `Falha permanente na API ${providerName} (HTTP ${status}): ${sanitizedText.slice(0, 300)}`,
          statusCode: status,
        });
      }

      // Retryable errors: 429, 500, 502, 503, 504
      if (status === 429 || (status >= 500 && status <= 504)) {
        if (attempt >= maxRetries) {
          throw new AppError({
            code: 'INTEGRATION_ERROR',
            message: `Falha após ${maxRetries + 1} tentativas na API ${providerName} (HTTP ${status}): ${sanitizedText.slice(0, 300)}`,
            statusCode: status,
          });
        }

        let waitMs = retryDelayMs * Math.pow(2, attempt) + Math.random() * 40;
        const retryAfterHeader = response.headers.get('retry-after');
        if (retryAfterHeader) {
          const parsed = parseInt(retryAfterHeader, 10);
          if (!isNaN(parsed) && parsed > 0) {
            waitMs = Math.min(parsed * 1000, 5000);
          }
        }

        attempt++;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      throw new AppError({
        code: 'INTEGRATION_ERROR',
        message: `Falha inesperada na API ${providerName} (HTTP ${status}): ${sanitizedText.slice(0, 300)}`,
        statusCode: status,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }

      if (err instanceof AppError) {
        throw err;
      }

      const isAbort =
        err.name === 'AbortError' ||
        err.message?.includes('Timeout') ||
        err.message?.includes('abort') ||
        controller.signal.aborted;

      if (isAbort) {
        throw new AppError({
          code: 'TIMEOUT_ERROR',
          message: `Tempo limite de conexão excedido na API ${providerName} (${timeoutMs}ms).`,
          statusCode: 504,
        });
      }

      if (attempt >= maxRetries) {
        const msg =
          apiKeyToRedact && apiKeyToRedact.length > 3
            ? (err.message || '').split(apiKeyToRedact).join('[REDACTED]')
            : err.message || 'Erro de rede';
        throw new AppError({
          code: 'INTEGRATION_ERROR',
          message: `Falha de rede na API ${providerName}: ${msg}`,
          statusCode: 502,
        });
      }

      attempt++;
      await new Promise((r) => setTimeout(r, retryDelayMs * Math.pow(2, attempt)));
    }
  }

  throw new AppError({
    code: 'INTEGRATION_ERROR',
    message: `Falha na comunicação com ${providerName}.`,
    statusCode: 500,
  });
}
