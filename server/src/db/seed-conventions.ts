/**
 * Seed data for the Conventions Extractor (L02, the other half) — a small,
 * plausible-looking scan result for the demo repo (acme/payments-api) so the
 * Conventions tab has something to show without running a real extraction.
 * Mirrors the shape/spirit of `seed-skills.ts`: a plain data array, inserted
 * idempotently by `seed.ts`.
 *
 * Deliberately mixes all three statuses so the UI's accept/reject flow and
 * `GET .../skill-draft` (accepted-only) both have something real to render:
 * one accepted, one still pending review, one already rejected.
 */

export interface SeedConventionDef {
  rule: string;
  category: string;
  evidencePath: string;
  evidenceSnippet: string;
  evidenceLineStart: number;
  evidenceLineEnd: number;
  confidence: number;
  status: 'pending' | 'accepted' | 'rejected';
}

/** Same head sha the seeded PR #482 uses (`seed.ts`), so it reads as one scan of that commit. */
export const SEED_CONVENTIONS_SCANNED_SHA = 'a1b2c3d4e5f6';

export const SEED_CONVENTIONS: SeedConventionDef[] = [
  {
    rule: 'Always use async/await instead of .then() promise chains.',
    category: 'async-await',
    evidencePath: 'src/api/users.ts',
    evidenceSnippet: 'for (const id of userIds) {\n  const user = await db.users.find(id);',
    evidenceLineStart: 45,
    evidenceLineEnd: 46,
    confidence: 0.86,
    status: 'accepted',
  },
  {
    rule: 'Validate request bodies with a zod schema before handling them.',
    category: 'validation',
    evidencePath: 'src/api/public/webhooks.ts',
    evidenceSnippet: 'const body = WebhookPayload.parse(req.body);',
    evidenceLineStart: 12,
    evidenceLineEnd: 12,
    confidence: 0.71,
    status: 'pending',
  },
  {
    rule: 'Keep every environment variable read together at the top of src/config.ts.',
    category: 'config',
    evidencePath: 'src/config.ts',
    evidenceSnippet: 'port: 3000,\nstripeKey: "sk_live_xxx",',
    evidenceLineStart: 10,
    evidenceLineEnd: 11,
    confidence: 0.54,
    status: 'rejected',
  },
];
