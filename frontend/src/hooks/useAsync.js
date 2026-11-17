import { useCallback, useEffect, useRef, useState } from 'react';

// Runs an async loader; returns { data, loading, error, reload }.
export function useAsync(fn, deps = [], { pollMs } = {}) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);
  const inFlight = useRef(null);

  const run = useCallback(async (silent = false) => {
    if (silent && inFlight.current) return inFlight.current.promise;

    const id = ++seq.current;
    if (!silent) setState((s) => ({ ...s, loading: s.data == null, error: null }));
    const promise = (async () => {
      try {
        const data = await fnRef.current();
        if (id === seq.current) setState({ data, loading: false, error: null });
      } catch (error) {
        if (id === seq.current) setState((s) => ({ ...s, loading: false, error }));
      } finally {
        if (inFlight.current?.id === id) inFlight.current = null;
      }
    })();
    inFlight.current = { id, promise };
    return promise;
  }, []);

  useEffect(() => {
    run();
    return () => { seq.current++; };
  }, deps); // eslint-disable-line
  useEffect(() => {
    if (!pollMs) return undefined;
    let timer;
    let stopped = false;
    let polling = false;
    const tick = async () => {
      if (stopped || polling) return;
      polling = true;
      try {
        if (document.visibilityState === 'visible') await run(true);
      } finally {
        polling = false;
        if (!stopped) timer = setTimeout(tick, pollMs);
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      tick();
    };
    timer = setTimeout(tick, pollMs);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [pollMs, run]);

  return {
    ...state,
    reload: () => run(),
    setData: (data) => {
      seq.current++;
      inFlight.current = null;
      setState((s) => ({ ...s, data: typeof data === 'function' ? data(s.data) : data }));
    },
  };
}
