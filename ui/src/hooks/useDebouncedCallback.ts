// src/hooks/useDebouncedCallback.ts
import { useRef } from "react";

export function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, ms: number) {
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (...args: Parameters<T>) => {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => fn(...args), ms);
  };
}