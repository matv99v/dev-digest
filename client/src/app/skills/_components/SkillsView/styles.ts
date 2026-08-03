import type { CSSProperties } from "react";

export const s = {
  shell: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  placeholder: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } satisfies CSSProperties,
} as const;
