"use client";

/* Replaces the ENTIRE root layout (its own <html>/<body>) when the layout
   itself throws — so it can't depend on NextIntlClientProvider or Providers,
   which may be what crashed. Deliberately static and English-only; this is
   the last-resort fallback, not a place to add product UI. */

import "./globals.css";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            gap: 12,
            textAlign: "center",
            padding: 24,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 380, lineHeight: 1.5 }}>
            The app hit an unexpected error and couldn&apos;t recover automatically.
          </div>
          <button
            onClick={() => reset()}
            style={{
              marginTop: 8,
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-primary)",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
