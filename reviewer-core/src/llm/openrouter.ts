import OpenAI, { type ClientOptions } from 'openai';
import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
} from 'openai/resources/chat/completions';
import type {
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { toJsonSchema, parseWithRepair } from './structured.js';

/**
 * The single OpenAI-compatible structured provider, owned by the engine because
 * BOTH consumers need it: the CI runner (the GitHub Action runs reviewer-core
 * directly) and the studio server's openrouter path. Centralizing it here means
 * session grouping, the no-choices guard, request timeouts, and the
 * parse-with-repair loop live in ONE place instead of being duplicated.
 *
 * OpenRouter is OpenAI-compatible, so we drive it with the OpenAI SDK pointed at
 * its baseURL. Only completeStructured is needed by reviewPullRequest; the rest
 * are stubs. Cost attribution is INJECTED (`estimateCost`) so the engine stays
 * free of a pricing table — the server passes its own, the runner passes none.
 *
 * `req.timeoutMs` is enforced with a per-attempt `AbortController` passed to the
 * SDK's `RequestOptions.signal` — NOT a `Promise.race`, which would lose the
 * race but leave the underlying HTTP request (and its socket) running. The
 * request is also streamed (`stream: true` + `stream_options.include_usage`),
 * which is what stops an idle intermediary from reaping a long generation.
 */

const NOT_SUPPORTED = 'OpenRouterProvider only implements completeStructured';

/**
 * Local error carrying whatever usage `completeStructured` had accumulated
 * across completed round-trips at the point it had to give up. Deliberately
 * NOT exported from `src/index.ts` — the engine's only public surface — since
 * `reviewPullRequest` (T6) reads these fields structurally off any caught
 * error rather than needing the class itself.
 */
class StructuredCallError extends Error {
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly costUsd: number | null;
  readonly attempts: number;

  constructor(
    message: string,
    info: { tokensIn: number; tokensOut: number; costUsd: number | null; attempts: number },
  ) {
    super(message);
    this.name = 'StructuredCallError';
    this.tokensIn = info.tokensIn;
    this.tokensOut = info.tokensOut;
    this.costUsd = info.costUsd;
    this.attempts = info.attempts;
  }
}

export interface OpenRouterProviderOptions {
  /** OpenAI-compatible base URL (default: OpenRouter). */
  baseURL?: string;
  /** Provider id for traces/gating (default 'openrouter'). */
  id?: 'openai' | 'openrouter';
  /** Per-request timeout (ms) — the SDK retries on timeout/5xx/429 with backoff. */
  timeoutMs?: number;
  maxRetries?: number;
  /** Injected cost estimator; returns USD or null when the model is unknown. */
  estimateCost?: (model: string, tokensIn: number, tokensOut: number) => number | null;
  /**
   * Injection seam for tests: a fake `fetch` that intercepts the SDK's HTTP
   * calls without going over the network. Forwarded to the underlying
   * `OpenAI` client unchanged.
   */
  fetch?: ClientOptions['fetch'];
}

export class OpenRouterProvider implements LLMProvider {
  readonly id: 'openai' | 'openrouter';
  private client: OpenAI;
  private baseURL: string;
  private apiKey: string;
  private estimateCost?: OpenRouterProviderOptions['estimateCost'];

  constructor(apiKey: string, opts: OpenRouterProviderOptions = {}) {
    this.id = opts.id ?? 'openrouter';
    this.apiKey = apiKey;
    this.baseURL = opts.baseURL ?? 'https://openrouter.ai/api/v1';
    this.estimateCost = opts.estimateCost;
    this.client = new OpenAI({
      apiKey,
      baseURL: this.baseURL,
      timeout: opts.timeoutMs ?? 90_000,
      maxRetries: opts.maxRetries ?? 2,
      fetch: opts.fetch,
    });
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const jsonSchema = toJsonSchema(req.schema, req.schemaName);
    const maxRetries = req.maxRetries ?? 2;
    const messages = [...req.messages];
    let tokensIn = 0;
    let tokensOut = 0;
    let costFromApi: number | null = null;
    let lastRaw = '';

    const currentCost = () =>
      costFromApi ?? this.estimateCost?.(req.model, tokensIn, tokensOut) ?? null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const body: ChatCompletionCreateParamsStreaming = {
        model: req.model,
        messages,
        temperature: req.temperature ?? 0,
        stream: true,
        stream_options: { include_usage: true },
        ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
        response_format: {
          type: 'json_schema',
          json_schema: { name: req.schemaName, schema: jsonSchema.schema, strict: true },
        },
        // OpenRouter session grouping — extra body field (spread is exempt from
        // excess-property checks). Only sent when talking to OpenRouter.
        ...(this.id === 'openrouter' && req.sessionId ? { session_id: req.sessionId } : {}),
        // OpenRouter usage accounting — ask it to return the REAL generation
        // cost (USD) in `usage.cost`, instead of estimating from a price book.
        ...(this.id === 'openrouter' ? { usage: { include: true } } : {}),
      };

      // Per-attempt abort: `req.timeoutMs` must reach the transport (the
      // fetch call the SDK makes), not just lose a Promise.race — a raced-away
      // request keeps running and keeps the socket open.
      const controller = req.timeoutMs != null ? new AbortController() : undefined;
      const timer =
        controller && req.timeoutMs != null
          ? setTimeout(() => controller.abort(), req.timeoutMs)
          : undefined;

      let content = '';
      let finishReason: ChatCompletionChunk.Choice['finish_reason'] = null;
      let sawChoice = false;
      let errMsg: string | undefined;
      let usage: ChatCompletionChunk['usage'] = null;

      try {
        const stream = await this.client.chat.completions.create(
          body,
          controller ? { signal: controller.signal } : undefined,
        );
        for await (const chunk of stream) {
          const chunkErr = (chunk as unknown as { error?: { message?: string } }).error?.message;
          if (chunkErr) errMsg = chunkErr;
          if (chunk.choices && chunk.choices.length > 0) {
            sawChoice = true;
            const delta = chunk.choices[0]?.delta;
            if (delta?.content) content += delta.content;
            const reason = chunk.choices[0]?.finish_reason;
            if (reason) finishReason = reason;
          }
          if (chunk.usage) usage = chunk.usage;
        }
      } catch (err) {
        if (controller?.signal.aborted) {
          throw new StructuredCallError(
            `OpenRouter request for ${req.schemaName} exceeded ${req.timeoutMs}ms`,
            { tokensIn, tokensOut, costUsd: currentCost(), attempts: attempt },
          );
        }
        // OpenRouter can return HTTP 200 with an `error` payload inside the SSE
        // body (upstream provider error / moderation / free-tier limit); the
        // SDK's SSE parser throws on that shape instead of yielding a chunk.
        // Surface it exactly as the pre-streaming HTTP-200-with-no-`choices`
        // guard used to.
        errMsg = err instanceof Error ? err.message : String(err);
        throw new StructuredCallError(
          `OpenRouter returned no choices for ${req.schemaName}: ${errMsg}`,
          { tokensIn, tokensOut, costUsd: currentCost(), attempts: attempt },
        );
      } finally {
        if (timer) clearTimeout(timer);
      }

      lastRaw = content;
      tokensIn += usage?.prompt_tokens ?? 0;
      tokensOut += usage?.completion_tokens ?? 0;
      // `usage.cost` is an OpenRouter extension (USD), absent from the OpenAI SDK type.
      const apiCost = (usage as { cost?: number } | null | undefined)?.cost;
      if (typeof apiCost === 'number') costFromApi = (costFromApi ?? 0) + apiCost;

      // OpenRouter can end a stream with no choices at all (an upstream
      // provider error / moderation / free-tier limit) — surface it exactly
      // as the pre-streaming HTTP-200-with-no-`choices` guard used to.
      if (!sawChoice) {
        throw new StructuredCallError(
          `OpenRouter returned no choices for ${req.schemaName}${errMsg ? `: ${errMsg}` : ''}`,
          { tokensIn, tokensOut, costUsd: currentCost(), attempts: attempt },
        );
      }

      // A response cut off by the output ceiling is truncated, not malformed —
      // fail fast instead of handing it to the repair loop, which would
      // re-send the full prompt for a response that could never have parsed.
      if (finishReason === 'length') {
        const ceiling = req.maxTokens != null ? ` (maxTokens=${req.maxTokens})` : '';
        throw new StructuredCallError(
          `OpenRouter response for ${req.schemaName} was truncated at the output token ceiling${ceiling}`,
          { tokensIn, tokensOut, costUsd: currentCost(), attempts: attempt },
        );
      }

      const parsed = parseWithRepair(req.schema, lastRaw);
      if (parsed.ok) {
        return {
          data: parsed.data,
          model: req.model,
          tokensIn,
          tokensOut,
          costUsd: currentCost(),
          raw: lastRaw,
          attempts: attempt,
        };
      }
      messages.push({ role: 'assistant', content: lastRaw });
      messages.push({ role: 'user', content: parsed.repromptMessage });
    }
    throw new StructuredCallError(
      `OpenRouter structured output failed schema validation for ${req.schemaName}`,
      { tokensIn, tokensOut, costUsd: currentCost(), attempts: maxRetries + 1 },
    );
  }

  /**
   * List models with pricing from the OpenRouter `/models` endpoint (the OpenAI
   * SDK's models.list strips the `pricing` field, so we fetch raw). Prices are
   * converted from per-token to USD per 1M tokens; cheapest output first.
   */
  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${this.baseURL}/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`OpenRouter /models returned ${res.status}`);
    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        name?: string;
        context_length?: number;
        pricing?: { prompt?: string; completion?: string };
      }>;
    };
    const models: ModelInfo[] = (json.data ?? []).map((m) => {
      const prompt = Number(m.pricing?.prompt);
      const completion = Number(m.pricing?.completion);
      // OpenRouter uses -1 as a sentinel for variable-priced router pseudo-models
      // (openrouter/auto etc.) — treat negatives as "unknown" so they don't show
      // as $-1000000 and don't sort to the top of the cheapest list.
      const pricing =
        Number.isFinite(prompt) && Number.isFinite(completion) && prompt >= 0 && completion >= 0
          ? { promptPerM: prompt * 1_000_000, completionPerM: completion * 1_000_000 }
          : null;
      return {
        id: m.id,
        provider: 'openrouter' as const,
        label: m.name ?? null,
        pricing,
        contextLength: m.context_length ?? null,
      };
    });
    return models.sort(
      (a, b) => (a.pricing?.completionPerM ?? Infinity) - (b.pricing?.completionPerM ?? Infinity),
    );
  }
  async complete(_req: CompletionRequest): Promise<CompletionResult> {
    throw new Error(NOT_SUPPORTED);
  }
  async embed(_texts: string[]): Promise<number[][]> {
    throw new Error(NOT_SUPPORTED);
  }
}
