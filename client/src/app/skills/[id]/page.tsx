"use client";

import { useParams } from "next/navigation";
import { SkillsView } from "../_components/SkillsView";

/* Route: /skills/:id (Skills list + detail). Same shell as /skills; the
   selected skill's id just picks which detail panel renders. */
export default function SkillDetailPage() {
  const params = useParams<{ id: string }>();
  return <SkillsView id={params.id} />;
}
