/** Import drawer tabs. Only "file" is wired — "url" and "community" render
    their copy but stay inert (out of scope for this lesson). */
export const IMPORT_TABS = ["file", "url", "community"] as const;
export type ImportTab = (typeof IMPORT_TABS)[number];

/** Drawer width (px). */
export const DRAWER_WIDTH = 640;
