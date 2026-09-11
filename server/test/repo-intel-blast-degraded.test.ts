/**
 * L04 — `getBlastRadius` honesty and never-throws contract (R5, R7).
 *
 * Hermetic: no Postgres, no clone. The service's private `RepoIntelRepository`
 * is replaced with a stub so each failure mode can be produced exactly.
 *
 * Two things are asserted here that nothing asserted before:
 *   - a repository that REJECTS degrades instead of propagating. The facade is
 *     documented as never throwing (`types.ts` header) and `tryPersistentBlast`
 *     had no try/catch — existing consumers only survived because they wrap
 *     their own calls.
 *   - `status` comes off `IndexState.status`, not off `IndexState.degraded`.
 *     A `partial` index is a WORKING index and carries no degraded flag
 *     (`repository.ts` tryGetIndexState), so a consumer reading `.degraded`
 *     renders an incomplete map as fully trustworthy.
 */
import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { FullSymbolRow, RepoBasics, ResolvedCallerRow } from '../src/modules/repo-intel/repository.js';
import type { IndexState, IndexStatus } from '../src/modules/repo-intel/types.js';

function indexState(status: IndexStatus): IndexState {
  return {
    repoId: 'r1',
    status,
    filesIndexed: 10,
    filesSkipped: 0,
    durationMs: 5,
    lastIndexedSha: 'indexsha',
    indexerVersion: 2,
    updatedAt: new Date(0),
    // Exactly what tryGetIndexState does: only 'degraded'/'failed' set the flag.
    degraded: status === 'degraded' || status === 'failed' ? true : undefined,
  };
}

interface StubOpts {
  flag: boolean;
  state?: IndexState | null;
  basics?: RepoBasics | null;
  /** Symbol rows per path — the same map serves decl files and caller files. */
  symbols?: Record<string, FullSymbolRow[]>;
  callers?: ResolvedCallerRow[];
  /** When set, `getSymbolRows` rejects with it (the DB-error case). */
  symbolRowsError?: Error;
  /** Ripgrep-path fuel. */
  codeIndexSymbols?: Array<{ path: string; name: string; kind: string; line: number }>;
  codeIndexRefs?: Array<{ fromPath: string; line: number }>;
}

function buildService(opts: StubOpts): RepoIntelService {
  const container = {
    config: { repoIntelEnabled: opts.flag },
    db: {} as never,
    codeIndex: {
      symbols: async () => opts.codeIndexSymbols ?? [],
      references: async () => opts.codeIndexRefs ?? [],
    },
  } as never;
  const svc = new RepoIntelService(container);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    tryGetIndexState: async () => opts.state ?? null,
    getRepoBasics: async () => opts.basics ?? null,
    getSymbolRows: async (_repoId: string, paths: string[]) => {
      if (opts.symbolRowsError) throw opts.symbolRowsError;
      return paths.flatMap((p) => opts.symbols?.[p] ?? []);
    },
    getResolvedCallersRanked: async () => opts.callers ?? [],
    getFileFacts: async () => [],
    getReverseDependents: async () => [],
  };
  return svc;
}

const SYMBOL: FullSymbolRow = {
  path: 'src/a.ts',
  name: 'foo',
  kind: 'function',
  line: 3,
  endLine: 9,
  exported: true,
  signature: null,
};

describe('getBlastRadius — never throws (R7)', () => {
  it('a repository that rejects yields a degraded result, not a rejection', async () => {
    const svc = buildService({
      flag: true,
      state: indexState('full'),
      symbolRowsError: new Error('deadlock detected'),
      basics: null, // nothing for the ripgrep path either
    });

    const blast = await svc.getBlastRadius('r1', ['src/a.ts']);

    expect(blast.status).toBe('degraded');
    expect(blast.degraded).toBe(true);
    expect(blast.changedSymbols).toEqual([]);
    expect(blast.callers).toEqual([]);
    expect(blast.impactedEndpoints).toEqual([]);
  });

  it('the persistent failure falls THROUGH to ripgrep, it does not short-circuit to empty', async () => {
    // Same DB error, but the clone-backed path can still answer. A catch that
    // returned early would turn a transient blip into a permanent "no data".
    const svc = buildService({
      flag: true,
      state: indexState('full'),
      symbolRowsError: new Error('connection terminated'),
      basics: { id: 'r1', owner: 'acme', name: 'web', defaultBranch: 'main', clonePath: '/nonexistent' },
      codeIndexSymbols: [{ path: 'src/a.ts', name: 'foo', kind: 'function', line: 3 }],
      codeIndexRefs: [{ fromPath: 'src/b.ts', line: 7 }],
    });

    const blast = await svc.getBlastRadius('r1', ['src/a.ts']);

    expect(blast.status).toBe('degraded');
    expect(blast.changedSymbols).toEqual([{ file: 'src/a.ts', name: 'foo', kind: 'function' }]);
    expect(blast.callers).toHaveLength(1);
    expect(blast.callers[0]?.file).toBe('src/b.ts');
    expect(blast.truncatedSymbols).toEqual([]);
  });
});

describe('getBlastRadius — status (R5)', () => {
  it('status is read off IndexState.status, not IndexState.degraded', async () => {
    const state = indexState('partial');
    expect(state.degraded).toBeUndefined(); // the trap: partial carries no flag

    const svc = buildService({
      flag: true,
      state,
      symbols: { 'src/a.ts': [SYMBOL] },
      callers: [{ fromPath: 'src/b.ts', toSymbol: 'foo', line: 7, rank: 5, rn: 1 }],
    });

    const blast = await svc.getBlastRadius('r1', ['src/a.ts']);

    expect(blast.status).toBe('partial');
    expect(blast.degraded).toBe(false);
    expect(blast.callers).toHaveLength(1);
    expect(blast.truncatedSymbols).toEqual([]);
  });

  it('a full index yields status full', async () => {
    const svc = buildService({
      flag: true,
      state: indexState('full'),
      symbols: { 'src/a.ts': [SYMBOL] },
      callers: [],
    });

    const blast = await svc.getBlastRadius('r1', ['src/a.ts']);

    expect(blast.status).toBe('full');
    expect(blast.degraded).toBe(false);
  });

  it('repoIntelEnabled=false returns real callers with rank 0 and status degraded, not an empty result', async () => {
    const svc = buildService({
      flag: false,
      state: indexState('full'), // a perfectly good index — the flag is the gate
      basics: { id: 'r1', owner: 'acme', name: 'web', defaultBranch: 'main', clonePath: '/nonexistent' },
      codeIndexSymbols: [{ path: 'src/a.ts', name: 'foo', kind: 'function', line: 3 }],
      codeIndexRefs: [{ fromPath: 'src/b.ts', line: 7 }],
    });

    const blast = await svc.getBlastRadius('r1', ['src/a.ts']);

    expect(blast.status).toBe('degraded');
    expect(blast.callers).toHaveLength(1);
    expect(blast.callers[0]?.rank).toBe(0);
    expect(blast.changedSymbols).toHaveLength(1);
    // The ripgrep/degraded path is uncapped — never truncated.
    expect(blast.truncatedSymbols).toEqual([]);
  });
});

describe('getBlastRadius — truncatedSymbols (N+1 signal)', () => {
  const CALLER_SYMBOL: FullSymbolRow = {
    path: 'src/caller.ts',
    name: 'callerFn',
    kind: 'function',
    line: 1,
    endLine: 999,
    exported: true,
    signature: null,
  };

  it('exactly MAX_CALLERS_PER_SYMBOL callers, no more: not truncated', async () => {
    const callers: ResolvedCallerRow[] = Array.from({ length: 20 }, (_, i) => ({
      fromPath: 'src/caller.ts',
      toSymbol: 'foo',
      line: i + 2,
      rank: 20 - i,
      rn: i + 1,
    }));
    const svc = buildService({
      flag: true,
      state: indexState('full'),
      symbols: { 'src/a.ts': [SYMBOL], 'src/caller.ts': [CALLER_SYMBOL] },
      callers,
    });

    const blast = await svc.getBlastRadius('r1', ['src/a.ts']);

    expect(blast.truncatedSymbols).toEqual([]);
  });

  it('more than the cap: truncated, and still exactly MAX_CALLERS_PER_SYMBOL rows survive', async () => {
    // rn 1..21 — the repository over-fetches by one past the cap.
    const callers: ResolvedCallerRow[] = Array.from({ length: 21 }, (_, i) => ({
      fromPath: `src/caller${i}.ts`,
      toSymbol: 'foo',
      line: i + 2,
      rank: 21 - i,
      rn: i + 1,
    }));
    const symbols: Record<string, FullSymbolRow[]> = { 'src/a.ts': [SYMBOL] };
    for (let i = 0; i < 21; i += 1) {
      symbols[`src/caller${i}.ts`] = [{ ...CALLER_SYMBOL, path: `src/caller${i}.ts` }];
    }
    const svc = buildService({
      flag: true,
      state: indexState('full'),
      symbols,
      callers,
    });

    const blast = await svc.getBlastRadius('r1', ['src/a.ts']);

    expect(blast.truncatedSymbols).toEqual(['foo']);
    expect(blast.callers.filter((c) => c.viaSymbol === 'foo')).toHaveLength(20);
    // The 21st (rn=21) row must never surface — not even as a caller row.
    expect(blast.callers.some((c) => c.file === 'src/caller20.ts')).toBe(false);
  });

  it('a capped set that collapses under dedup is still reported truncated', async () => {
    // All 21 raw rows resolve to the SAME (fromPath, enclosing, toSymbol) key
    // — a single caller symbol enclosing every reference line — so the dedup
    // loop in tryPersistentBlast collapses them to ONE caller row. A
    // post-dedup count would see 1 row and call this "not truncated"; the raw
    // rn signal must not.
    const callers: ResolvedCallerRow[] = Array.from({ length: 21 }, (_, i) => ({
      fromPath: 'src/caller.ts',
      toSymbol: 'foo',
      line: i + 2,
      rank: 21 - i,
      rn: i + 1,
    }));
    const svc = buildService({
      flag: true,
      state: indexState('full'),
      symbols: { 'src/a.ts': [SYMBOL], 'src/caller.ts': [CALLER_SYMBOL] },
      callers,
    });

    const blast = await svc.getBlastRadius('r1', ['src/a.ts']);

    expect(blast.callers.filter((c) => c.viaSymbol === 'foo')).toHaveLength(1);
    expect(blast.truncatedSymbols).toEqual(['foo']);
  });
});

describe('getReverseDependents — degraded contract', () => {
  it('returns [] when the flag is off, without touching the repository', async () => {
    const svc = buildService({ flag: false });
    (svc as unknown as { repo: Record<string, unknown> }).repo = {
      getReverseDependents: async () => {
        throw new Error('must not be called with the flag off');
      },
    };
    await expect(svc.getReverseDependents('r1', ['src/a.ts'])).resolves.toEqual([]);
  });

  it('returns [] for no files, and [] (never a rejection) when the query fails', async () => {
    const svc = buildService({ flag: true });
    await expect(svc.getReverseDependents('r1', [])).resolves.toEqual([]);

    (svc as unknown as { repo: Record<string, unknown> }).repo = {
      getReverseDependents: async () => {
        throw new Error('relation "file_edges" does not exist');
      },
    };
    await expect(svc.getReverseDependents('r1', ['src/a.ts'])).resolves.toEqual([]);
  });
});
