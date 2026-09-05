/* hooks/intent.ts — React Query hooks for the PR Intent Layer (L03).
   GET /pulls/:id/intent returns PrIntentDetail | null (never derives, never
   404s for "not derived yet"); POST /pulls/:id/intent always derives and
   upserts. Shape copied from useConventions/useExtractConventions. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PrIntentDetail } from "@/lib/types";

export function useIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["intent", prId],
    queryFn: () => api.get<PrIntentDetail | null>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

export function useDeriveIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentDetail>(`/pulls/${prId}/intent`),
    onSuccess: (data) => {
      qc.setQueryData(["intent", prId], data);
    },
  });
}
