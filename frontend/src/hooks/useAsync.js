import { useCallback, useEffect, useRef, useState } from 'react';

// Runs an async loader; returns { data, loading, error, reload }.
export function useAsync(fn, deps = [], { pollMs } = {}) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const run = useCallback(async (silent = false) => {
    const id = ++seq.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      if (id === seq.current) setState({ data, loading: false, error: null });
    } catch (error) {
      if (id === seq.current) setState((s) => ({ data: silent ? s.data : null, loading: false, error }));
    }
  }, []);

  useEffect(() => { run(); }, deps); // eslint-disable-line
  useEffect(() => {
    if (!pollMs) return undefined;
    const t = setInterval(() => run(true), pollMs);
    return () => clearInterval(t);
  }, [pollMs, run]);

  return { ...state, reload: () => run(), setData: (data) => setState((s) => ({ ...s, data })) };
}
