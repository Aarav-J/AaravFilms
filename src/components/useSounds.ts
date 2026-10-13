"use client";
import { useCallback, useRef } from "react";

function ctx(): AudioContext {
  const w = window as typeof window & { __sfxCtx?: AudioContext };
  return (w.__sfxCtx ??= new AudioContext());
}

// Short burst of filtered noise — the workhorse for mechanical sounds.
function noise(
  ac: AudioContext,
  dest: AudioNode,
  {
    duration = 0.08,
    startTime = ac.currentTime,
    gainPeak = 0.35,
    lowFreq = 200,
    highFreq = 1800,
    peakTime = 0.006,
    color = "white" as "white" | "pink",
  } = {},
) {
  const bufLen = Math.ceil(ac.sampleRate * duration);
  const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
  const data = buf.getChannelData(0);
  if (color === "pink") {
    // One-pole pink approximation
    let b = 0;
    for (let i = 0; i < bufLen; i++) {
      const w = Math.random() * 2 - 1;
      b = 0.99765 * b + w * 0.0990460;
      data[i] = b;
    }
  } else {
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  }

  const src = ac.createBufferSource();
  src.buffer = buf;

  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = highFreq;

  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = lowFreq;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + peakTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  src.connect(lp).connect(hp).connect(gain).connect(dest);
  src.start(startTime);
  src.stop(startTime + duration + 0.01);
}

// Single-sample transient click using a short sine chirp.
function click(
  ac: AudioContext,
  dest: AudioNode,
  {
    startTime = ac.currentTime,
    freq = 420,
    duration = 0.018,
    gain = 0.28,
  } = {},
) {
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, startTime);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.4, startTime + duration);

  const g = ac.createGain();
  g.gain.setValueAtTime(gain, startTime);
  g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(g).connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.005);
}

// ─── Individual sounds ────────────────────────────────────────────────────────

/** Tape sliding out of a cardboard sleeve — soft scrape then thud. */
function playTapePull(ac: AudioContext) {
  const master = ac.createGain();
  master.gain.value = 0.9;
  master.connect(ac.destination);

  const t = ac.currentTime;
  // Scrape: medium-freq noise sweep
  noise(ac, master, {
    startTime: t,
    duration: 0.13,
    gainPeak: 0.22,
    lowFreq: 300,
    highFreq: 1400,
    peakTime: 0.025,
    color: "pink",
  });
  // Thud at the end: low noise burst
  noise(ac, master, {
    startTime: t + 0.11,
    duration: 0.07,
    gainPeak: 0.18,
    lowFreq: 40,
    highFreq: 320,
    peakTime: 0.004,
  });
}

/** Light plastic click when tapping the disc. */
function playDiscClick(ac: AudioContext) {
  const master = ac.createGain();
  master.gain.value = 0.8;
  master.connect(ac.destination);

  click(ac, master, { freq: 520, duration: 0.022, gain: 0.32 });
  noise(ac, master, {
    duration: 0.03,
    gainPeak: 0.08,
    lowFreq: 800,
    highFreq: 6000,
    peakTime: 0.002,
  });
}

/** Mechanical slot: whirr then seating thud. */
function playInsert(ac: AudioContext) {
  const master = ac.createGain();
  master.gain.value = 0.85;
  master.connect(ac.destination);

  const t = ac.currentTime;
  // Mechanical feed noise
  noise(ac, master, {
    startTime: t,
    duration: 0.26,
    gainPeak: 0.14,
    lowFreq: 80,
    highFreq: 900,
    peakTime: 0.04,
    color: "pink",
  });
  // Motor-ish tone
  const osc = ac.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(55, t);
  osc.frequency.linearRampToValueAtTime(38, t + 0.22);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.06, t);
  g.gain.linearRampToValueAtTime(0, t + 0.24);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + 0.25);
  // Seating thud
  noise(ac, master, {
    startTime: t + 0.22,
    duration: 0.09,
    gainPeak: 0.28,
    lowFreq: 30,
    highFreq: 260,
    peakTime: 0.003,
  });
  click(ac, master, { startTime: t + 0.22, freq: 180, duration: 0.03, gain: 0.15 });
}

/** CRT power-on: high-frequency whine + static pop. */
function playCrtOn(ac: AudioContext) {
  const master = ac.createGain();
  master.gain.value = 0.75;
  master.connect(ac.destination);

  const t = ac.currentTime;
  // Flyback whine — CRTs emit ~15.7 kHz; we bring it to ~9 kHz so it's audible
  // on most speakers and not annoying.
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(9200, t);
  osc.frequency.exponentialRampToValueAtTime(7800, t + 0.45);
  const wg = ac.createGain();
  wg.gain.setValueAtTime(0.001, t);
  wg.gain.linearRampToValueAtTime(0.07, t + 0.04);
  wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.46);
  osc.connect(wg).connect(master);
  osc.start(t);
  osc.stop(t + 0.5);
  // Static pop
  noise(ac, master, {
    startTime: t,
    duration: 0.08,
    gainPeak: 0.19,
    lowFreq: 600,
    highFreq: 8000,
    peakTime: 0.003,
  });
  // Low thump (phosphor charge)
  noise(ac, master, {
    startTime: t + 0.02,
    duration: 0.14,
    gainPeak: 0.13,
    lowFreq: 40,
    highFreq: 200,
    peakTime: 0.01,
  });
}

/** Disc eject: reverse feed + click release. */
function playEject(ac: AudioContext) {
  const master = ac.createGain();
  master.gain.value = 0.8;
  master.connect(ac.destination);

  const t = ac.currentTime;
  click(ac, master, { startTime: t, freq: 200, duration: 0.025, gain: 0.18 });
  noise(ac, master, {
    startTime: t + 0.01,
    duration: 0.18,
    gainPeak: 0.12,
    lowFreq: 90,
    highFreq: 750,
    peakTime: 0.005,
    color: "pink",
  });
  noise(ac, master, {
    startTime: t + 0.16,
    duration: 0.06,
    gainPeak: 0.1,
    lowFreq: 60,
    highFreq: 300,
    peakTime: 0.003,
  });
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export type Sounds = {
  tapePull: () => void;
  discClick: () => void;
  insert: () => void;
  crtOn: () => void;
  eject: () => void;
};

export function useSounds(): Sounds {
  // Resume context on first user gesture (browser autoplay policy).
  const resumed = useRef(false);

  function resume() {
    if (resumed.current) return;
    const ac = ctx();
    if (ac.state === "suspended") ac.resume();
    resumed.current = true;
  }

  const tapePull = useCallback(() => { resume(); playTapePull(ctx()); }, []);
  const discClick = useCallback(() => { resume(); playDiscClick(ctx()); }, []);
  const insert = useCallback(() => { resume(); playInsert(ctx()); }, []);
  const crtOn = useCallback(() => { resume(); playCrtOn(ctx()); }, []);
  const eject = useCallback(() => { resume(); playEject(ctx()); }, []);

  return { tapePull, discClick, insert, crtOn, eject };
}
