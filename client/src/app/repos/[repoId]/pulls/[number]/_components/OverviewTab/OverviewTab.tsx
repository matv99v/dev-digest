"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { BlastCard } from "../BlastCard";
import { IntentCard } from "../IntentCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
}

export function OverviewTab({ prId, prBody }: OverviewTabProps) {
  return (
    <>
      {/* The intent is the summary; the body is the raw source — intent
          renders above Description. */}
      <IntentCard prId={prId} />

      {/* Intent is what the PR means, blast is what it touches, the body is the
          raw source — so the map sits between them. */}
      <BlastCard prId={prId} />

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
