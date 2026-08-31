"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");
  const pathname = usePathname();

  useEffect(() => {
    console.error(error);
  }, [error]);

  // A route change (a different PR, a different repo) should retry rendering
  // instead of keeping the previous page's crash on screen.
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return <ErrorState fullScreen title={t("crash.title")} body={t("crash.body")} onRetry={reset} />;
}
