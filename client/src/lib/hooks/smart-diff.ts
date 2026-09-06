/* hooks/smart-diff.ts — React Query hook for the Smart Diff read model.
   GET /pulls/:id/smart-diff is computed on read (no persistence, no model
   call — see docs/plans/04-smart-diff.md), so this is a plain query with no
   mutation, shaped like useIntent (hooks/intent.ts:11-17). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SmartDiff } from "@/lib/types";

export function useSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["smart-diff", prId],
    queryFn: () => api.get<SmartDiff>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}
