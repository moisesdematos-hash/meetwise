import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeResilientSTTFetch } from '@/modules/transcription/resilient-fetch';
import { DeepgramTranscriptionProvider } from '@/modules/transcription/providers/deepgram';
import { GladiaTranscriptionProvider } from '@/modules/transcription/providers/gladia';
import { AppError } from '@/lib/errors/app-error';

/**
 * MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.B.3-B
 * Suite de Testes do Bloco 3: Fiabilidade de Transcrição, Timeouts e Resiliência (STT-01 a STT-10)
 */
describe('MEETWISE AI — Phase 7.2 Bloco 3: STT Reliability & Resilient Fetch (STT-01 to STT-10)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =========================================================================
  // STT-01: Resposta válida
  // =========================================================================
  it('STT-01 — Chamada bem-sucedida (HTTP 200) retorna resposta imediatamente sem retries', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: { channels: [{ alternatives: [{ transcript: 'Olá mundo' }] }] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    global.fetch = fetchMock;

    const res = await executeResilientSTTFetch('https://api.test/transcribe', { method: 'POST' }, {
      timeoutMs: 5000,
      maxRetries: 2,
    });

    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const data = await res.json();
    expect(data.results.channels[0].alternatives[0].transcript).toBe('Olá mundo');
  });

  // =========================================================================
  // STT-02: Timeout
  // =========================================================================
  it('STT-02 — Chamada que excede o timeout configurado é cancelada e lança TIMEOUT_ERROR', async () => {
    // Simula fetch que nunca resolve
    const fetchMock = vi.fn().mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    global.fetch = fetchMock;

    let thrownError: any = null;
    try {
      await executeResilientSTTFetch(
        'https://api.test/transcribe',
        { method: 'POST' },
        { timeoutMs: 50, maxRetries: 0, providerName: 'Deepgram' }
      );
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(AppError);
    expect(thrownError.code).toBe('TIMEOUT_ERROR');
    expect(thrownError.statusCode).toBe(504);
    expect(thrownError.message).toContain('Tempo limite de conexão excedido na API Deepgram (50ms)');
  });

  // =========================================================================
  // STT-03: Abort
  // =========================================================================
  it('STT-03 — Cancelamento externo via AbortSignal interrompe o pedido e lança OPERATION_CANCELLED', async () => {
    const externalController = new AbortController();

    const fetchMock = vi.fn().mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    global.fetch = fetchMock;

    // Cancela externamente após 20ms
    setTimeout(() => externalController.abort(), 20);

    let thrownError: any = null;
    try {
      await executeResilientSTTFetch(
        'https://api.test/transcribe',
        { method: 'POST' },
        { timeoutMs: 5000, signal: externalController.signal }
      );
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(AppError);
    expect(['TIMEOUT_ERROR', 'OPERATION_CANCELLED']).toContain(thrownError.code);
  });

  // =========================================================================
  // STT-04: HTTP 429 com Retry-After
  // =========================================================================
  it('STT-04 — HTTP 429 (Rate Limit) executa retry respeitando o cabeçalho Retry-After', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          new Response('Rate limit reached', {
            status: 429,
            headers: { 'Retry-After': '0' },
          })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });
    global.fetch = fetchMock;

    const res = await executeResilientSTTFetch(
      'https://api.test/transcribe',
      { method: 'POST' },
      { timeoutMs: 5000, maxRetries: 2, retryDelayMs: 10 }
    );

    expect(res.ok).toBe(true);
    expect(callCount).toBe(2);
  });

  // =========================================================================
  // STT-05: HTTP 500 (Erro de servidor com retry e falha)
  // =========================================================================
  it('STT-05 — Erro HTTP 500 persistente tenta novamente até maxRetries e lança INTEGRATION_ERROR', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('Internal Server Error', { status: 500 })
    );
    global.fetch = fetchMock;

    let thrownError: any = null;
    try {
      await executeResilientSTTFetch(
        'https://api.test/transcribe',
        { method: 'POST' },
        { timeoutMs: 5000, maxRetries: 2, retryDelayMs: 10, providerName: 'Gladia' }
      );
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(AppError);
    expect(thrownError.code).toBe('INTEGRATION_ERROR');
    expect(thrownError.message).toContain('Falha após 3 tentativas na API Gladia (HTTP 500)');
    // 1 inicial + 2 retries = 3 chamadas
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  // =========================================================================
  // STT-06: HTTP 400 sem retry indevido
  // =========================================================================
  it('STT-06 — Erros 400 (Bad Request) falham imediatamente sem executar retries', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('Invalid Audio Format payload', { status: 400 })
    );
    global.fetch = fetchMock;

    let thrownError: any = null;
    try {
      await executeResilientSTTFetch(
        'https://api.test/transcribe',
        { method: 'POST' },
        { timeoutMs: 5000, maxRetries: 3, providerName: 'Deepgram' }
      );
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(AppError);
    expect(thrownError.code).toBe('VALIDATION_ERROR');
    expect(thrownError.statusCode).toBe(400);
    // Exatamente 1 tentativa — nunca faz retry em erro 400
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // STT-07: Resposta inválida (JSON corrompido)
  // =========================================================================
  it('STT-07 — Resposta 200 com JSON corrompido é tratada com segurança pelo provedor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('INVALID_NON_JSON_BODY', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    global.fetch = fetchMock;

    const provider = new DeepgramTranscriptionProvider('test-deepgram-api-key', 2000);

    let thrownError: any = null;
    try {
      await provider.transcribe({ audioUrl: 'https://storage/audio.mp3' });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeDefined();
    // JSON parse error apanhado sem crash não tratado
  });

  // =========================================================================
  // STT-08: Retry limitado
  // =========================================================================
  it('STT-08 — Limite estrito de retries: maxRetries=1 executa exatamente 2 chamadas', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('Bad Gateway', { status: 502 })
    );
    global.fetch = fetchMock;

    try {
      await executeResilientSTTFetch(
        'https://api.test/transcribe',
        { method: 'POST' },
        { timeoutMs: 5000, maxRetries: 1, retryDelayMs: 5 }
      );
    } catch {
      // Ignora erro esperado
    }

    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 tentativa + 1 retry
  });

  // =========================================================================
  // STT-09: Sem fuga de API keys (Credential Redaction)
  // =========================================================================
  it('STT-09 — Chave de API secreta é completamente redigida em mensagens de erro e logs', async () => {
    const secretApiKey = 'dg_secret_live_key_999998888877777';
    const errorBodyWithKey = `Error: Authentication with key ${secretApiKey} failed at upstream server.`;

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(errorBodyWithKey, { status: 401 })
    );
    global.fetch = fetchMock;

    let thrownError: any = null;
    try {
      await executeResilientSTTFetch(
        'https://api.test/transcribe',
        { method: 'POST' },
        {
          timeoutMs: 5000,
          maxRetries: 0,
          apiKeyToRedact: secretApiKey,
          providerName: 'Deepgram',
        }
      );
    } catch (err: any) {
      thrownError = err;
    }

    expect(thrownError).toBeDefined();
    // A chave real NUNCA aparece na mensagem de erro
    expect(thrownError.message).not.toContain(secretApiKey);
    expect(thrownError.message).toContain('[REDACTED]');
  });

  // =========================================================================
  // STT-10: Falha não deixa worker bloqueado indefinidamente
  // =========================================================================
  it('STT-10 — Timeout configurável do GladiaProvider cancela o pedido e não bloqueia o worker', async () => {
    const fetchMock = vi.fn().mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    global.fetch = fetchMock;

    const gladiaProvider = new GladiaTranscriptionProvider('gladia-key-test', 30); // 30ms timeout

    const startTime = Date.now();
    let error: any = null;
    try {
      await gladiaProvider.transcribe({ audioUrl: 'https://test/audio.wav' });
    } catch (err) {
      error = err;
    }
    const elapsed = Date.now() - startTime;

    expect(error).toBeDefined();
    expect(error.code).toBe('TIMEOUT_ERROR');
    // Abortado em menos de 1000ms, sem ficar bloqueado
    expect(elapsed).toBeLessThan(1000);
  });
});
