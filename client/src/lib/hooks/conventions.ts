/* hooks/conventions.ts — React Query hooks for the Conventions Extractor
   (repo-scoped scan + accept/reject + skill-draft-from-conventions flow). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  Convention,
  ConventionPatch,
  ConventionScan,
  ConventionSkillDraft,
  Skill,
} from "@devdigest/shared";

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionScan>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

export function useExtractConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<ConventionScan>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data, repoId) => {
      qc.setQueryData(["conventions", repoId], data);
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
    },
  });
}

export interface UpdateConventionInput {
  id: string;
  patch: ConventionPatch;
}

export function useUpdateConvention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateConventionInput) =>
      api.patch<Convention>(`/conventions/${id}`, patch),
    // repoId isn't known cleanly at the call site — invalidate the whole
    // ["conventions"] prefix, matching how useUpdateSkill invalidates broadly.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conventions"] }),
  });
}

export function useConventionSkillDraft(
  repoId: string | null | undefined,
  mode: "merged" | "per_category",
) {
  return useQuery({
    queryKey: ["conventions-skill-draft", repoId, mode],
    queryFn: () =>
      api.get<ConventionSkillDraft[]>(
        `/repos/${repoId}/conventions/skill-draft?mode=${mode}`,
      ),
    enabled: !!repoId,
  });
}

export interface CreateConventionSkillsInput {
  repoId: string;
  drafts: ConventionSkillDraft[];
}

export function useCreateConventionSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, drafts }: CreateConventionSkillsInput) =>
      api.post<Skill[]>(`/repos/${repoId}/conventions/skills`, { drafts }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conventions"] });
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}
