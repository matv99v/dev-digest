/**
 * L04 — the persistent blast path, over a real Postgres (R2, R3, R4).
 *
 * `tryPersistentBlast` had ZERO coverage before this file: nothing exercised
 * the SQL, the per-symbol cap, the rank order or `factsByFile`. These fixtures
 * are the first thing that has.
 *
 * Two fixture rules the plan calls out, both load-bearing here:
 *   - every `references` row sets `decl_file` explicitly. `getResolvedCallersRanked`
 *     filters `decl_file IN (…)`, so a row without it produces an EMPTY caller
 *     set that reads exactly like a passing "no callers" case.
 *   - the import-graph fixture is ASYMMETRIC. The reverse walk written forwards
 *     (`from_file = <changed>`) compiles and returns rows; only a directional
 *     fixture tells the two apart. `src/forward/only.ts` exists solely so a
 *     forward join has something wrong to return.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import {
  INDEXER_VERSION,
  MAX_CALLERS_PER_SYMBOL,
} from '../src/modules/repo-intel/constants.js';
import type { BlastResult, ReverseDependentRow } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const ALPHA = 'src/core/alpha.ts';
const BETA = 'src/core/beta.ts';
/** GAMMA has exactly the cap's worth of callers — the not-truncated edge. */
const GAMMA = 'src/core/gamma.ts';
/** DELTA's callers all collapse to ONE row under dedup — still truncated. */
const DELTA = 'src/core/delta.ts';
const CHANGED = [ALPHA, BETA, GAMMA, DELTA];

/** 30 callers per symbol, so the 20-cap actually bites. */
const CALLER_COUNT = 30;
const aCaller = (i: number) => `src/callers/a${String(i).padStart(2, '0')}.ts`;
const bCaller = (i: number) => `src/callers/b${String(i).padStart(2, '0')}.ts`;
/** Exactly MAX_CALLERS_PER_SYMBOL distinct callers of `gamma` — no more. */
const gCaller = (i: number) => `src/callers/g${String(i).padStart(2, '0')}.ts`;
/** Every one of DELTA's 25 references lives in this single caller file. */
const DELTA_CALLER = 'src/callers/deltaCaller.ts';
const DELTA_REF_COUNT = 25;

// --- reverse-walk fixture ---------------------------------------------------
const DIRECT = 'src/d1/direct.ts'; // imports ALPHA            → depth 1
const DUAL = 'src/both/dual.ts'; // imports ALPHA *and* DIRECT → depth 1 only
const SECOND = 'src/d2/second.ts'; // imports DIRECT           → depth 2
const THIRD = 'src/d3/third.ts'; // imports SECOND             → 3 hops, absent
const FORWARD_ONLY = 'src/forward/only.ts'; // ALPHA imports IT → never a dependent

d('repo-intel — persistent blast over the index', () => {
  let pg: PgFixture;
  let repoId: string;
  let svc: RepoIntelService;

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces);
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'blast', fullName: 'acme/blast' })
      .returning();
    repoId = repo!.id;

    await db.insert(t.repoIndexState).values({
      repoId,
      lastIndexedSha: 'indexsha',
      indexerVersion: INDEXER_VERSION,
      status: 'full',
      filesIndexed: 64,
      filesSkipped: 0,
      stats: {},
    });

    // Declared symbols in the changed files.
    await db.insert(t.symbols).values([
      { repoId, path: ALPHA, name: 'alpha', kind: 'function', line: 5, endLine: 20, exported: true },
      { repoId, path: BETA, name: 'beta', kind: 'function', line: 5, endLine: 20, exported: true },
      { repoId, path: GAMMA, name: 'gamma', kind: 'function', line: 5, endLine: 20, exported: true },
      { repoId, path: DELTA, name: 'delta', kind: 'function', line: 5, endLine: 20, exported: true },
      // One enclosing symbol spans every reference line in DELTA_CALLER, so
      // all of DELTA's references dedup down to a single caller row.
      { repoId, path: DELTA_CALLER, name: 'deltaCallerFn', kind: 'function', line: 1, endLine: 1000, exported: true },
    ]);

    // file_rank for every file the caller join touches — INCLUDING the decl
    // files, so the self-reference below is excluded by the predicate rather
    // than by accidentally missing its rank row.
    await db.insert(t.fileRank).values([
      ...[ALPHA, BETA, GAMMA, DELTA, DELTA_CALLER, DIRECT, DUAL, SECOND, THIRD, FORWARD_ONLY].map(
        (path, i) => ({
          repoId,
          filePath: path,
          pagerank: 0.5,
          hotness: 0,
          rank: 500 - i,
          percentile: 99,
        }),
      ),
      ...Array.from({ length: CALLER_COUNT }, (_, i) => ({
        repoId,
        filePath: aCaller(i),
        pagerank: 0.1,
        hotness: 0,
        rank: i, // a29 is the hottest caller of `alpha`
        percentile: 50,
      })),
      ...Array.from({ length: CALLER_COUNT }, (_, i) => ({
        repoId,
        filePath: bCaller(i),
        pagerank: 0.1,
        hotness: 0,
        rank: 100 + i,
        percentile: 50,
      })),
      ...Array.from({ length: MAX_CALLERS_PER_SYMBOL }, (_, i) => ({
        repoId,
        filePath: gCaller(i),
        pagerank: 0.1,
        hotness: 0,
        rank: 200 + i,
        percentile: 50,
      })),
    ]);

    await db.insert(t.references).values([
      ...Array.from({ length: CALLER_COUNT }, (_, i) => ({
        repoId,
        fromPath: aCaller(i),
        toSymbol: 'alpha',
        line: 10 + i,
        declFile: ALPHA,
      })),
      ...Array.from({ length: CALLER_COUNT }, (_, i) => ({
        repoId,
        fromPath: bCaller(i),
        toSymbol: 'beta',
        line: 10 + i,
        declFile: BETA,
      })),
      // Exactly the cap, no more — the not-truncated edge.
      ...Array.from({ length: MAX_CALLERS_PER_SYMBOL }, (_, i) => ({
        repoId,
        fromPath: gCaller(i),
        toSymbol: 'gamma',
        line: 10 + i,
        declFile: GAMMA,
      })),
      // More than the cap, but every reference lives in the SAME caller file
      // under the SAME enclosing symbol — dedup collapses them to one row.
      ...Array.from({ length: DELTA_REF_COUNT }, (_, i) => ({
        repoId,
        fromPath: DELTA_CALLER,
        toSymbol: 'delta',
        line: 10 + i,
        declFile: DELTA,
      })),
      // R3: a reference from the declaring file itself. Not a caller.
      { repoId, fromPath: ALPHA, toSymbol: 'alpha', line: 8, declFile: ALPHA },
    ]);

    // file_facts is SPARSE by construction — only files with an endpoint or a
    // cron get a row. SECOND deliberately has none.
    await db.insert(t.fileFacts).values([
      { repoId, filePath: aCaller(29), endpoints: ['GET /a29'], crons: [] },
      { repoId, filePath: DIRECT, endpoints: ['GET /alpha'], crons: ['0 * * * *'] },
    ]);

    // Import graph: from_file imports to_file. Read it out loud — every edge
    // here points the opposite way to the question the walk asks.
    await db.insert(t.fileEdges).values([
      { repoId, fromFile: DIRECT, toFile: ALPHA },
      { repoId, fromFile: DUAL, toFile: ALPHA },
      { repoId, fromFile: SECOND, toFile: DIRECT },
      { repoId, fromFile: DUAL, toFile: DIRECT }, // also reachable at depth 2
      { repoId, fromFile: THIRD, toFile: SECOND }, // 3 hops from ALPHA
      { repoId, fromFile: ALPHA, toFile: DIRECT }, // cycle: ALPHA imports DIRECT
      { repoId, fromFile: ALPHA, toFile: FORWARD_ONLY }, // forward-only bait
    ]);

    svc = new RepoIntelService({
      config: { repoIntelEnabled: true },
      db,
    } as never);
  });

  afterAll(async () => {
    await pg?.stop();
  });

  describe('callers (R2, R3)', () => {
    let blast: BlastResult;
    beforeAll(async () => {
      blast = await svc.getBlastRadius(repoId, CHANGED);
    });

    it('serves the persistent path: status full, not degraded', () => {
      expect(blast.status).toBe('full');
      expect(blast.degraded).toBe(false);
      expect(blast.changedSymbols).toEqual(
        expect.arrayContaining([
          { file: ALPHA, name: 'alpha', kind: 'function' },
          { file: BETA, name: 'beta', kind: 'function' },
        ]),
      );
    });

    it('two changed symbols each keep MAX_CALLERS_PER_SYMBOL callers', () => {
      const forAlpha = blast.callers.filter((c) => c.viaSymbol === 'alpha');
      const forBeta = blast.callers.filter((c) => c.viaSymbol === 'beta');
      // The defect this catches: a total slice leaves the second symbol at 0.
      expect(forAlpha).toHaveLength(MAX_CALLERS_PER_SYMBOL);
      expect(forBeta).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    });

    it('the kept callers are the top MAX_CALLERS_PER_SYMBOL by file_rank', () => {
      const forAlpha = blast.callers.filter((c) => c.viaSymbol === 'alpha');
      const expected = Array.from({ length: MAX_CALLERS_PER_SYMBOL }, (_, i) =>
        aCaller(CALLER_COUNT - 1 - i),
      );
      expect(forAlpha.map((c) => c.file)).toEqual(expected);
      expect(forAlpha[0]?.rank).toBe(CALLER_COUNT - 1);
      expect(forAlpha.map((c) => c.rank)).toEqual(
        [...forAlpha.map((c) => c.rank)].sort((x, y) => y - x),
      );
    });

    it('two identical runs return the identical body (the order is total)', async () => {
      const again = await svc.getBlastRadius(repoId, CHANGED);
      expect(again.callers).toEqual(blast.callers);
    });

    it('a reference from the declaring file itself is not a caller', () => {
      expect(blast.callers.some((c) => c.file === ALPHA)).toBe(false);
    });

    it('attributes endpoints per caller file through factsByFile', () => {
      expect(blast.factsByFile?.[aCaller(29)]).toEqual({ endpoints: ['GET /a29'], crons: [] });
      expect(blast.impactedEndpoints).toContain('GET /a29');
      // A caller file with no file_facts row simply has no entry — that is
      // "declares no endpoint", not "not indexed".
      expect(blast.factsByFile?.[aCaller(28)]).toBeUndefined();
    });
  });

  describe('truncatedSymbols (R — N+1 truncation signal)', () => {
    let blast: BlastResult;
    beforeAll(async () => {
      blast = await svc.getBlastRadius(repoId, CHANGED);
    });

    it('a symbol over the cap (alpha, beta: 30 callers) is truncated', () => {
      expect(blast.truncatedSymbols).toEqual(expect.arrayContaining(['alpha', 'beta']));
    });

    it('a symbol with exactly MAX_CALLERS_PER_SYMBOL callers and no more is NOT truncated', () => {
      const forGamma = blast.callers.filter((c) => c.viaSymbol === 'gamma');
      expect(forGamma).toHaveLength(MAX_CALLERS_PER_SYMBOL);
      expect(blast.truncatedSymbols).not.toContain('gamma');
    });

    it('a capped set that collapses under dedup is still reported truncated', () => {
      // The defect a post-dedup count gets wrong: DELTA has 25 raw references
      // but they all share one enclosing caller symbol, so exactly ONE caller
      // row survives dedup — yet the symbol WAS cut at the cap upstream.
      const forDelta = blast.callers.filter((c) => c.viaSymbol === 'delta');
      expect(forDelta).toHaveLength(1);
      expect(blast.truncatedSymbols).toContain('delta');
    });

    it('two identical runs report the identical truncation set', async () => {
      const again = await svc.getBlastRadius(repoId, CHANGED);
      expect([...again.truncatedSymbols].sort()).toEqual([...blast.truncatedSymbols].sort());
    });
  });

  describe('reverse dependents (R4)', () => {
    let rows: ReverseDependentRow[];
    beforeAll(async () => {
      rows = await svc.getReverseDependents(repoId, [ALPHA]);
    });

    it('depth 1 and depth 2 are both returned with the right depth and via', () => {
      const direct = rows.find((r) => r.file === DIRECT);
      const second = rows.find((r) => r.file === SECOND);
      expect(direct).toMatchObject({ root: ALPHA, depth: 1, via: ALPHA });
      expect(second).toMatchObject({ root: ALPHA, depth: 2, via: DIRECT });
    });

    it('a file three hops away is absent', () => {
      expect(rows.some((r) => r.file === THIRD)).toBe(false);
    });

    it('a file the changed file IMPORTS is never a dependent (the walk is backwards)', () => {
      // A forward join (`from_file = ALPHA`) would return exactly this file.
      expect(rows.some((r) => r.file === FORWARD_ONLY)).toBe(false);
    });

    it('the changed file is never its own dependent, even inside an import cycle', () => {
      expect(rows.some((r) => r.file === ALPHA)).toBe(false);
    });

    it('a file reachable at both depths appears once, at depth 1', () => {
      const dual = rows.filter((r) => r.file === DUAL);
      expect(dual).toHaveLength(1);
      expect(dual[0]?.depth).toBe(1);
    });

    it('a dependent with no file_facts row still appears, with empty endpoints', () => {
      // file_facts is sparse; an inner join would drop every dependent that
      // registers no route — i.e. most of them.
      expect(rows.find((r) => r.file === SECOND)).toMatchObject({ endpoints: [], crons: [] });
      expect(rows.find((r) => r.file === DIRECT)).toMatchObject({
        endpoints: ['GET /alpha'],
        crons: ['0 * * * *'],
      });
    });

    it('the same edge read from the other end: rooted at the imported file, the importer IS the dependent', async () => {
      // The mirror of the case above, over the one edge ALPHA → FORWARD_ONLY.
      // Together the two pin the direction down: a forward join passes exactly
      // one of them and fails the other.
      const mirrored = await svc.getReverseDependents(repoId, [FORWARD_ONLY]);
      expect(mirrored.find((r) => r.file === ALPHA)).toMatchObject({
        root: FORWARD_ONLY,
        depth: 1,
        via: FORWARD_ONLY,
      });
    });

    it('returns nothing for a file nobody imports', async () => {
      await expect(svc.getReverseDependents(repoId, [THIRD])).resolves.toEqual([]);
    });
  });
});
