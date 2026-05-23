'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readModuleField, writeModuleField } from '../utils/moduleFilterStorage';

type SetStateAction<T> = T | ((prev: T) => T);

export function usePersistedFilterState<T>(
  moduleKey: string,
  fieldKey: string,
  initialValue: T,
  userId?: string | null
): [T, (value: SetStateAction<T>) => void] {
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const [value, setValueInternal] = useState<T>(() =>
    readModuleField(moduleKey, fieldKey, initialValue, userId)
  );

  useEffect(() => {
    setValueInternal(readModuleField(moduleKey, fieldKey, initialValue, userId));
  }, [moduleKey, fieldKey, userId]);

  const setValue = useCallback(
    (next: SetStateAction<T>) => {
      setValueInternal((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        writeModuleField(moduleKey, fieldKey, resolved, userIdRef.current);
        return resolved;
      });
    },
    [moduleKey, fieldKey]
  );

  return [value, setValue];
}

/** Persiste un Set<string> como array en localStorage. */
export function usePersistedStringSetFilter(
  moduleKey: string,
  fieldKey: string,
  userId?: string | null
): [Set<string>, (next: Set<string> | ((prev: Set<string>) => Set<string>)) => void] {
  const [items, setItems] = usePersistedFilterState<string[]>(moduleKey, fieldKey, [], userId);

  const set = useMemo(() => new Set(items), [items]);

  const setSet = useCallback(
    (next: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      setItems((prevItems) => {
        const prev = new Set(prevItems);
        const resolved = typeof next === 'function' ? next(prev) : next;
        return [...resolved];
      });
    },
    [setItems]
  );

  return [set, setSet];
}
