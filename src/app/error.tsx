"use client";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Unhandled page error", error);
  }, [error]);

  return (
    <main className="wrap">
      <h1>Something went wrong</h1>
      <p className="muted" style={{ marginTop: 12 }}>
        We could not load this page. Please try again in a moment.
      </p>
      {error.digest && <p className="mono muted" style={{ marginTop: 8, fontSize: 12 }}>Ref: {error.digest}</p>}
      <button onClick={reset} style={{ marginTop: 24 }}>Try again</button>
    </main>
  );
}
