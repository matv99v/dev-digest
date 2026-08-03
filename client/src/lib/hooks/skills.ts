/* hooks/skills.ts — React Query hooks for the Skills lab + agent skill links.
   Mirrors hooks/agents.ts conventions exactly (query key shapes, invalidation-
   on-success, `enabled: !!id` guards). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Skill,
  SkillType,
  SkillSource,
  SkillVersion,
  SkillImportPreview,
  SkillStats,
  AgentSkillLink,
} from "@devdigest/shared";

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description?: string;
  type: SkillType;
  source?: SkillSource;
  body: string;
  enabled?: boolean;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: {
    name?: string;
    description?: string;
    type?: SkillType;
    body?: string;
    enabled?: boolean;
    message?: string;
  };
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      // A body change writes a new version — invalidate the versions list too,
      // even when this particular patch didn't touch body: cheap and correct.
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill", data.id] });
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
      qc.setQueryData(["skill", data.id], data);
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
    },
  });
}

/** Newest first — as returned by the API. */
export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export function useSkillVersion(id: string | null | undefined, version: number | null | undefined) {
  return useQuery({
    queryKey: ["skill-version", id, version],
    queryFn: () => api.get<SkillVersion>(`/skills/${id}/versions/${version}`),
    enabled: !!id && version != null,
  });
}

export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["skill", id] });
      qc.invalidateQueries({ queryKey: ["skill-versions", id] });
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-stats", id],
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

/** GET-shaped: token counting needs the body in the request, so it's a POST
 *  under the hood, but callers use it like any other read (query key = text). */
export function useCountTokens(text: string) {
  return useQuery({
    queryKey: ["skill-tokens", text],
    queryFn: () => api.post<{ tokens: number }>("/skills/tokens", { text }),
    enabled: text.length > 0,
  });
}

/** Preview only — nothing persists server-side, so there's nothing to invalidate. */
export function useImportPreview() {
  return useMutation({
    mutationFn: (input: { filename: string; content: string }) =>
      api.post<SkillImportPreview>("/skills/import/preview", input),
  });
}

export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      skills,
    }: {
      agentId: string;
      skills: Array<{ skill_id: string; enabled?: boolean }>;
    }) => api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skills }),
    onSuccess: (_data, { agentId }) => {
      qc.invalidateQueries({ queryKey: ["agent-skills", agentId] });
      // The agents list shows a per-agent skill count read off this link table.
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}
