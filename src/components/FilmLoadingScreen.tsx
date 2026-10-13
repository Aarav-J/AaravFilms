"use client";

import { useEffect, useRef } from "react";
import styles from "./FilmLoadingScreen.module.css";
import {
  useFilmsLoader,
  type FilmsPayload,
  type LoadError,
} from "./useFilmsLoader";

type Props<F> = {
  onReady: (payload: FilmsPayload<F>) => void;
  onSkip?: () => void;
  url?: string;
  timeoutMs?: number;
  slowAfterMs?: number;
  readyHoldMs?: number;
  fetcher?: typeof fetch;
  backgroundUrl?: string | null;
};

const errorTitle: Record<LoadError["kind"], string> = {
  network: "Unable to reach your journal",
  http: "Your journal could not load",
  timeout: "This is taking too long",
  empty: "No films came back",
  parse: "The response could not be read",
};

function Reel() {
  return (
    <svg viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <defs>
        <linearGradient
          id="af-reel-gold"
          x1="14"
          y1="8"
          x2="62"
          y2="72"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#f1d7ac" />
          <stop offset=".5" stopColor="#c79657" />
          <stop offset="1" stopColor="#795333" />
        </linearGradient>
      </defs>
      <circle
        cx="40"
        cy="40"
        r="32"
        fill="url(#af-reel-gold)"
        stroke="#eac794"
        strokeWidth=".7"
      />
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse
          key={a}
          cx="40"
          cy="21"
          rx="7"
          ry="9"
          fill="#302015"
          transform={`rotate(${a} 40 40)`}
        />
      ))}
      <circle cx="40" cy="40" r="5" fill="#f3d9b2" />
      <circle cx="40" cy="40" r="1.8" fill="#7a5536" />
    </svg>
  );
}

export default function FilmLoadingScreen<F = unknown>({
  onReady,
  onSkip,
  url,
  timeoutMs,
  slowAfterMs,
  readyHoldMs = 1100,
  fetcher,
  backgroundUrl = "/room-background.webp",
}: Props<F>) {
  const { state, retry } = useFilmsLoader<F>({
    url,
    timeoutMs,
    slowAfterMs,
    fetcher,
  });
  const fired = useRef(false);
  const latestOnReady = useRef(onReady);
  latestOnReady.current = onReady;
  const phase = state.phase;
  const payload = phase === "done" ? state.payload : null;
  const issues = payload
    ? Object.entries(payload.sources).filter(
        ([, s]) => s.state !== "configured",
      )
    : [];
  const caption =
    phase === "error"
      ? "A moment, please"
      : phase === "done"
        ? "Your journal is ready"
        : "Loading your film journal";

  useEffect(() => {
    if (state.phase !== "done") {
      fired.current = false;
      return;
    }
    if (fired.current) return;
    const timer = setTimeout(() => {
      fired.current = true;
      latestOnReady.current(state.payload);
    }, readyHoldMs);
    return () => clearTimeout(timer);
  }, [state, readyHoldMs]);

  return (
    <main className={styles.root} data-phase={phase}>
      {backgroundUrl && (
        <img className={styles.background} src={backgroundUrl} alt="" />
      )}
      <div className={styles.shade} />
      <section className={styles.content} aria-label="Film journal loading">
        <div className={styles.reel}>
          <Reel />
        </div>
        <h1 className={styles.title}>Aarav&apos;s Films</h1>
        <p className={styles.tagline}>
          Larp representation of the movies I've watched
        </p>
        <div className={styles.status} role="status" aria-live="polite">
          <p className={styles.caption}>{caption}</p>
          <div
            className={styles.bar}
            role="progressbar"
            aria-label="Loading journal"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={phase === "done" ? 100 : undefined}
            aria-valuetext={
              phase === "loading"
                ? "Waiting for the film server"
                : phase === "done"
                  ? "Complete"
                  : "Loading failed"
            }
          >
            <span className={styles.fill} />
          </div>
          <p className={styles.hint}>
            {phase === "loading" &&
              (state.slow
                ? "Still gathering your diary and film details."
                : "Diary, posters and recent watches.")}
            {phase === "done" &&
              (issues.length
                ? `${payload!.films.length} films loaded. Some sources are unavailable.`
                : `${payload!.films.length} films, ready for the shelf.`)}
            {phase === "error" && errorTitle[state.error.kind]}
          </p>
        </div>
        {phase === "done" && issues.length > 0 && (
          <details className={styles.details}>
            <summary>Source details</summary>
            <ul>
              {issues.map(([key, source]) => (
                <li key={key}>
                  {key === "export"
                    ? "Diary export"
                    : key === "tmdb"
                      ? "Posters and details"
                      : "Letterboxd RSS"}
                  :{" "}
                  {source.state === "missing-config"
                    ? "not configured"
                    : "unavailable"}
                </li>
              ))}
            </ul>
          </details>
        )}
        {phase === "error" && (
          <div className={styles.error}>
            <p>
              {state.error.kind === "timeout"
                ? "The server has not answered. You can try again."
                : state.error.kind === "empty"
                  ? "The server returned an empty journal."
                  : state.error.kind === "http"
                    ? `Server response: ${state.error.status}. Please try again.`
                    : state.error.kind === "parse"
                      ? "The server returned an unexpected response."
                      : "Check your connection and try again."}
            </p>
            <div className={styles.actions}>
              <button type="button" onClick={retry}>
                Try again <span aria-hidden="true">↗</span>
              </button>
              {onSkip && (
                <button
                  className={styles.secondary}
                  type="button"
                  onClick={onSkip}
                >
                  Enter with sample films
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
