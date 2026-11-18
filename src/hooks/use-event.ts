"use client";

import { useCallback, useEffect, useRef } from "react";

/** A stable function identity that always calls the latest `fn` (safe to hand to long-lived editors). */
export function useEvent<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
