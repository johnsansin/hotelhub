'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, qs } from './api';

export function useList(path, params = {}, { enabled = true, deps = [] } = {}) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const lastParams = useRef(JSON.stringify(params));

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const key = JSON.stringify(params);
    const changed = key !== lastParams.current;
    lastParams.current = key;
    if (changed) setLoading(true);
    api
      .get(`${path}${qs(params)}`)
      .then((d) => {
        if (!alive) return;
        setItems(d.items || d.rows || d || []);
        setTotal(d.total ?? (Array.isArray(d) ? d.length : (d.items || []).length));
        setError(null);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e);
        if (changed) setItems([]);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, JSON.stringify(params), version, enabled, ...deps]);

  return { items, total, loading, error, reload, setItems };
}

export function useFetch(path, { enabled = true, deps = [] } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!enabled || !path) return undefined;
    let alive = true;
    api
      .get(path)
      .then((d) => {
        if (alive) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, version, enabled, ...deps]);

  return { data, loading, error, reload, setData };
}

export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
