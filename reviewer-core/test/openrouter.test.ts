import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/llm/openrouter.js';
import type { StructuredRequest } from '@devdigest/shared';

/**
 * First test coverage for `OpenRouterProvider`. Drives the REAL `openai` SDK
 * through an injected `fetch` (never `vi.mock('openai')`) so the SSE parsing,
 * the delta accumulation and the abort plumbing are all genuinely exercised —
 * a fake is a real implementation of the seam, and survives refactors that a
 * call-shape mock would not.
 */

const TestSchema = z.object({ ok: z.boolean(), note: z.string() });

function sseResponse(events: unknown[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

interface CapturedCall {
  url: string;
  init: RequestInit;
}

/** Queues canned Responses, one per call; records the url/init of every call. */
function queuedFetch(responses: Response[]): { fetch: typeof fetch; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  let i = 0;
  const fn = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const res = responses[i++];
    if (!res) throw new Error('queuedFetch: no more queued responses');
    return res;
  }) as typeof fetch;
  return { fetch: fn, calls };
}

/**
 * A fetch that never settles on its own — only reacts to the AbortSignal the
 * SDK forwards to it, exactly like the real (native) `fetch` does. Captures
 * the signal it was given so the test can assert it was actually aborted.
 */
function neverResolvingFetch(): { fetch: typeof fetch; capturedSignal: () => AbortSignal | undefined } {
  let signal: AbortSignal | undefined;
  const fn = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    signal = init?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener('abort', () => {
        const err = new Error('The operation was aborted.');
        err.name = 'AbortError';
        reject(err);
      });
    });
  }) as typeof fetch;
  return { fetch: fn, capturedSignal: () => signal };
}

function baseReq(overrides: Partial<StructuredRequest<z.infer<typeof TestSchema>>> = {}) {
  return {
    model: 'test-model',
    schema: TestSchema,
    schemaName: 'TestSchema',
    messages: [{ role: 'user' as const, content: 'say ok' }],
    ...overrides,
  };
}

function streamedSuccess(content: string, usage: Record<string, unknown>) {
  const half = Math.ceil(content.length / 2);
  return sseResponse([
    {
      id: 'x',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'test-model',
      choices: [{ index: 0, delta: { role: 'assistant', content: content.slice(0, half) }, finish_reason: null }],
    },
    {
      id: 'x',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'test-model',
      choices: [{ index: 0, delta: { content: content.slice(half) }, finish_reason: 'stop' }],
    },
    {
      id: 'x',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'test-model',
      choices: [],
      usage,
    },
  ]);
}

describe('OpenRouterProvider.completeStructured', () => {
  it('sends stream:true + stream_options.include_usage, and reports tokensIn/tokensOut/costUsd from the final usage chunk', async () => {
    const content = JSON.stringify({ ok: true, note: 'fine' });
    const { fetch: fakeFetch, calls } = queuedFetch([
      streamedSuccess(content, { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46, cost: 0.0042 }),
    ]);

    const provider = new OpenRouterProvider('test-key', { fetch: fakeFetch });
    const result = await provider.completeStructured(baseReq());

    expect(result.tokensIn).toBe(12);
    expect(result.tokensOut).toBe(34);
    expect(result.costUsd).toBe(0.0042);

    const sentBody = JSON.parse(calls[0]!.init.body as string);
    expect(sentBody.stream).toBe(true);
    expect(sentBody.stream_options).toEqual({ include_usage: true });
  });

  it('accumulates streamed deltas into valid JSON on the happy path (attempts === 1)', async () => {
    const content = JSON.stringify({ ok: true, note: 'fine' });
    const { fetch: fakeFetch } = queuedFetch([
      streamedSuccess(content, { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }),
    ]);

    const provider = new OpenRouterProvider('test-key', { fetch: fakeFetch });
    const result = await provider.completeStructured(baseReq());

    expect(result.data).toEqual({ ok: true, note: 'fine' });
    expect(result.attempts).toBe(1);
  });

  it('aborts the in-flight request when req.timeoutMs elapses, and names the budget', async () => {
    const { fetch: fakeFetch, capturedSignal } = neverResolvingFetch();
    const provider = new OpenRouterProvider('test-key', { fetch: fakeFetch });

    await expect(
      provider.completeStructured(baseReq({ timeoutMs: 50 })),
    ).rejects.toThrow(/50ms/);

    expect(capturedSignal()?.aborted).toBe(true);
  });

  it('fails fast on truncation (finish_reason "length") without a repair-loop retry', async () => {
    const { fetch: fakeFetch, calls } = queuedFetch([
      sseResponse([
        {
          id: 'x',
          object: 'chat.completion.chunk',
          created: 0,
          model: 'test-model',
          choices: [{ index: 0, delta: { content: '{"ok":' }, finish_reason: 'length' }],
        },
      ]),
    ]);

    const provider = new OpenRouterProvider('test-key', { fetch: fakeFetch });

    await expect(
      provider.completeStructured(baseReq({ maxTokens: 8192 })),
    ).rejects.toThrow(/8192/);

    expect(calls).toHaveLength(1);
  });

  it('rejects with "returned no choices" when the stream carries only an error payload', async () => {
    const { fetch: fakeFetch } = queuedFetch([sseResponse([{ error: { message: 'blocked by moderation' } }])]);
    const provider = new OpenRouterProvider('test-key', { fetch: fakeFetch });

    await expect(provider.completeStructured(baseReq())).rejects.toThrow(/returned no choices/);
  });

  it('attaches accumulated usage to the error thrown after exhausting retries on invalid JSON', async () => {
    const invalidChunk = (completionTokens: number) => [
      {
        id: 'x',
        object: 'chat.completion.chunk',
        created: 0,
        model: 'test-model',
        choices: [{ index: 0, delta: { content: '{"nope":true}' }, finish_reason: 'stop' }],
      },
      {
        id: 'x',
        object: 'chat.completion.chunk',
        created: 0,
        model: 'test-model',
        choices: [],
        usage: { prompt_tokens: 5, completion_tokens: completionTokens, total_tokens: 5 + completionTokens },
      },
    ];
    const { fetch: fakeFetch } = queuedFetch([
      sseResponse(invalidChunk(10)),
      sseResponse(invalidChunk(20)),
    ]);

    const provider = new OpenRouterProvider('test-key', { fetch: fakeFetch });

    let caught: unknown;
    try {
      await provider.completeStructured(baseReq({ maxRetries: 1 }));
      throw new Error('expected completeStructured to reject');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as { tokensOut?: number }).tokensOut).toBe(30);
    expect((caught as { tokensIn?: number }).tokensIn).toBe(10);
    expect((caught as { attempts?: number }).attempts).toBe(2);
  });
});
