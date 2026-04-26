import { useEffect, useState } from "react";

/**
 * Returns the input value, delayed by `delayMs`. Resets the timer on every
 * change. Used in search inputs to avoid firing the API on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
