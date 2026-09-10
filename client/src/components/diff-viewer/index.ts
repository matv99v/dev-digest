/* diff-viewer — unified-diff viewer with optional inline GitHub comments.
   Public surface: the DiffViewer component + the DiffCommentApi contract,
   plus SmartDiffViewer — the reviewer-ordered alternative rendered behind
   the Smart/Original toggle in DiffTab (never together with DiffViewer). */
export { DiffViewer } from "./DiffViewer";
export { SmartDiffViewer } from "./SmartDiffViewer";
export type { DiffCommentApi } from "./comments";
