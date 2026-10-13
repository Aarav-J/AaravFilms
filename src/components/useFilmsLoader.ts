import { useCallback, useEffect, useRef, useState } from 'react';

// Mirrors FilmsApiResponse in src/lib/external-film-data.ts (kept local so this file has no app imports).
export type SourceState = 'configured' | 'missing-config' | 'error';
export type FilmsPayload<F = unknown> = {
  films: F[];
  sources: {
    tmdb: { state: SourceState; message?: string };
    letterboxd: { state: SourceState; username: string | null; message?: string };
    export: { state: SourceState; rows: number; films: number; message?: string };
  };
};

export type LoadError = {
  kind: 'network' | 'http' | 'timeout' | 'empty' | 'parse';
  message: string;
  status?: number;
};

export type LoaderState<F> =
  | { phase: 'loading'; elapsedMs: number; slow: boolean }
  | { phase: 'done'; elapsedMs: number; payload: FilmsPayload<F> }
  | { phase: 'error'; elapsedMs: number; error: LoadError };

type Options = {
  url?: string;
  /** Hard stop. The route does CSV + one TMDB call per film + RSS in a single request, so be generous. */
  timeoutMs?: number;
  /** After this long, the screen shows a "still working" hint. */
  slowAfterMs?: number;
  /** Test/demo hook. Defaults to window.fetch. */
  fetcher?: typeof fetch;
};

/**
 * Loads /api/films once and exposes real states. The endpoint returns a single JSON body
 * (no streaming), so there is no honest percentage: we report loading / done / error and
 * the per-source `sources` block once it arrives.
 */
export function useFilmsLoader<F = unknown>({
  url = '/api/films',
  timeoutMs = 90_000,
  slowAfterMs = 12_000,
  fetcher
}: Options = {}) {
  const [state, setState] = useState<LoaderState<F>>({ phase: 'loading', elapsedMs: 0, slow: false });
  const [attempt, setAttempt] = useState(0);
  const startedAt = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    let timedOut = false;
    let finished = false;
    startedAt.current = Date.now();
    setState({ phase: 'loading', elapsedMs: 0, slow: false });

    const tick = setInterval(() => {
      if (finished) return;
      const elapsedMs = Date.now() - startedAt.current;
      setState({ phase: 'loading', elapsedMs, slow: elapsedMs >= slowAfterMs });
    }, 200);
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      finish({ phase: 'error', elapsedMs: Date.now() - startedAt.current, error: { kind: 'timeout', message: `No answer after ${Math.round(timeoutMs / 1000)} seconds.` } });
    }, timeoutMs);

    const finish = (next: LoaderState<F>) => {
      if (finished || (controller.signal.aborted && !timedOut)) return; // unmounted / superseded
      finished = true;
      clearInterval(tick);
      clearTimeout(timer);
      setState(next);
    };

    (async () => {
      const elapsed = () => Date.now() - startedAt.current;
      try {
        const response = await (fetcher ?? fetch)(url, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) {
          return finish({ phase: 'error', elapsedMs: elapsed(), error: { kind: 'http', status: response.status, message: `The film server answered ${response.status}${response.statusText ? ` ${response.statusText}` : ''}.` } });
        }
        let payload: FilmsPayload<F>;
        try { payload = await response.json(); } catch {
          return finish({ phase: 'error', elapsedMs: elapsed(), error: { kind: 'parse', message: 'The film server sent something that was not valid JSON.' } });
        }
        const validSource = (s: unknown) => !!s && typeof s === 'object' && ['configured', 'missing-config', 'error'].includes((s as { state: string }).state);
        if (!payload || !Array.isArray(payload.films) || !payload.sources || !validSource(payload.sources.export) || !validSource(payload.sources.tmdb) || !validSource(payload.sources.letterboxd)) {
          return finish({ phase: 'error', elapsedMs: elapsed(), error: { kind: 'parse', message: 'The film server returned an unexpected response shape.' } });
        }
        if (!payload.films.length) {
          return finish({ phase: 'error', elapsedMs: elapsed(), error: { kind: 'empty', message: 'The server answered, but it returned zero films.' } });
        }
        finish({ phase: 'done', elapsedMs: elapsed(), payload });
      } catch (err) {
        if (timedOut) {
          return finish({ phase: 'error', elapsedMs: elapsed(), error: { kind: 'timeout', message: `No answer after ${Math.round(timeoutMs / 1000)} seconds.` } });
        }
        finish({ phase: 'error', elapsedMs: elapsed(), error: { kind: 'network', message: err instanceof Error ? err.message : 'Could not reach the film server.' } });
      }
    })();

    return () => { finished = true; controller.abort(); clearInterval(tick); clearTimeout(timer); };
  }, [url, timeoutMs, slowAfterMs, fetcher, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
