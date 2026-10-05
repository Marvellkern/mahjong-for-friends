import { useCallback, useState } from 'react';

/** A boolean remembered in localStorage (falls back to memory in private mode). */
export function usePersistentFlag(key: string, initial: boolean): [boolean, (on: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? initial : v === '1';
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (on: boolean) => {
      setValue(on);
      try {
        localStorage.setItem(key, on ? '1' : '0');
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [value, set];
}
