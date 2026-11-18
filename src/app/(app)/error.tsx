"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-24 text-center">
      <h1 className="text-page-title">Something went wrong</h1>
      <p className="text-muted-strong mt-3 mb-6 text-lg font-light">
        We could not load this page. Try again in a moment.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
