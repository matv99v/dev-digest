import { describe, it, expect } from "vitest";
import type { AgentSkillLink } from "@devdigest/shared";
import { initialOrder } from "./helpers";

describe("initialOrder", () => {
  it("puts linked skills first, sorted by their persisted order", () => {
    const links: AgentSkillLink[] = [
      { agent_id: "a", skill_id: "s2", order: 1 },
      { agent_id: "a", skill_id: "s1", order: 0 },
    ];
    expect(initialOrder(["s1", "s2", "s3"], links)).toEqual(["s1", "s2", "s3"]);
  });

  it("appends unlinked skills after, in catalog order", () => {
    const links: AgentSkillLink[] = [{ agent_id: "a", skill_id: "s3", order: 0 }];
    expect(initialOrder(["s1", "s2", "s3"], links)).toEqual(["s3", "s1", "s2"]);
  });

  it("returns the catalog order unchanged when nothing is linked", () => {
    expect(initialOrder(["s1", "s2", "s3"], [])).toEqual(["s1", "s2", "s3"]);
  });
});
