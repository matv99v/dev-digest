/* hooks/blast.ts — React Query hooks for the Blast Radius card (L04).
   GET /pulls/:id/blast is a pure read: it never calls a model, so it is safe to
   fetch on every page load. POST /pulls/:id/blast/explain makes exactly one
   model call, persists it, and returns the same body with `explanation` filled —
   so the mutation seeds the query cache rather than invalidating it.
   Shape copied from useIntent/useDeriveIntent. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PrBlastRadius } from "@/lib/types";

export function useBlast(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast", prId],
    queryFn: () => api.get<PrBlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}

export function useExplainBlast(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBlastRadius>(`/pulls/${prId}/blast/explain`),
    onSuccess: (data) => {
      qc.setQueryData(["blast", prId], data);
    },
  });
}
