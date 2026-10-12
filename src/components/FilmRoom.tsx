'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { films, type Film, type Viewing } from '@/data/films';
import ReferenceRoom, { BAY_CAPACITY } from './ReferenceRoom';

type Mode = 'room' | 'case' | 'confirm' | 'inserting' | 'playing' | 'review' | 'catalog' | 'tickets';

type TicketEntry = { film: Film; viewing: Viewing; index: number };
type CatalogSort = 'shelf' | 'title' | 'year' | 'rating' | 'recent';
type TicketSort = 'newest' | 'oldest' | 'rating' | 'title';

const allTickets: TicketEntry[] = films
  .flatMap((film) => film.viewings.map((viewing, index) => ({ film, viewing, index })))
  .sort((a, b) => Date.parse(b.viewing.date) - Date.parse(a.viewing.date));

function averageRating(film: Film) {
  if (film.viewings.length === 0) return 0;
  return film.viewings.reduce((total, viewing) => total + viewing.rating, 0) / film.viewings.length;
}

function latestViewingTime(film: Film) {
  return Math.max(...film.viewings.map((viewing) => Date.parse(viewing.date)));
}

const compactTicketDate = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' });

// Shared texture cache so repeated films across many shelf instances don't
// regenerate identical canvases.
const textureCache = new Map<string, THREE.CanvasTexture>();
function cachedTexture(key: string, factory: () => THREE.CanvasTexture): THREE.CanvasTexture {
  const hit = textureCache.get(key);
  if (hit) return hit;
  const tex = factory();
  textureCache.set(key, tex);
  return tex;
}

function makeSpineTexture(film: Film): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = film.color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // accent stripe near the top
  ctx.fillStyle = film.accent;
  ctx.fillRect(canvas.width * 0.38, 18, canvas.width * 0.24, canvas.height * 0.88);
  // title text, reading bottom-to-top like a real spine
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#f4dfbf';
  ctx.font = '700 30px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(film.title.toUpperCase(), 0, -6);
  ctx.restore();
  // year, small, near bottom
  ctx.fillStyle = '#f2d6a5';
  ctx.font = '700 22px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(film.year), canvas.width / 2, canvas.height - 22);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeDiscTexture(film: Film): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const cx = 256;
  const cy = 256;
  // label field
  const grad = ctx.createRadialGradient(cx, cy, 40, cx, cy, 256);
  grad.addColorStop(0, film.accent);
  grad.addColorStop(0.62, film.color);
  grad.addColorStop(1, '#0d0906');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 256, 0, Math.PI * 2);
  ctx.fill();
  // concentric data rings
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let r = 70; r < 250; r += 10) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // title curved across the label
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#fff3dc';
  ctx.font = '700 26px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(film.title.toUpperCase(), 0, -118);
  ctx.font = '700 15px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(String(film.year), 0, -94);
  ctx.restore();
  // center hub hole
  ctx.fillStyle = '#100b08';
  ctx.beginPath();
  ctx.arc(cx, cy, 40, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeCoverTexture(film: Film): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 540;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, film.accent);
  grad.addColorStop(1, film.color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(255,240,213,0.4)';
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
  ctx.fillStyle = '#fff3dc';
  ctx.font = '700 40px Georgia, serif';
  ctx.textAlign = 'center';
  const words = film.title.toUpperCase().split(' ');
  let line = '';
  const lines: string[] = [];
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > canvas.width - 70 && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const ty = canvas.height * 0.38;
  lines.forEach((l, i) => ctx.fillText(l, canvas.width / 2, ty + i * 48));
  ctx.font = '700 18px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fillText(`${film.director.toUpperCase()} · ${film.year}`, canvas.width / 2, canvas.height * 0.86);
  ctx.font = '700 13px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText("AARAV'S FILMS", canvas.width / 2, canvas.height * 0.93);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function CaseStage({ film, open, inserting, onToggleOpen, onDiscClick }: {
  film: Film; open: boolean; inserting: boolean; onToggleOpen: () => void; onDiscClick: () => void;
}) {
  const cover = useMemo(() => makeCoverTexture(film), [film]);
  const label = useMemo(() => makeDiscTexture(film), [film]);
  return <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 2.8], fov: 36 }} gl={{ antialias: true }}>
    <color attach="background" args={['#120a06']} />
    <ambientLight intensity={1.2} color="#ffdec1" />
    <directionalLight position={[2, 3, 4]} intensity={2} color="#ffd9ab" />
    <group position={[open ? -.34 : 0, 0, 0]} rotation={[0, open ? -.7 : -.12, 0]} onClick={e => { e.stopPropagation(); onToggleOpen(); }}>
      <RoundedBox args={[.86, 1.2, .09]} radius={.025} smoothness={3}><meshStandardMaterial color="#191815" roughness={.7} /></RoundedBox>
      <mesh position={[0, 0, .052]}><planeGeometry args={[.8, 1.14]} /><meshStandardMaterial map={cover} roughness={.8} /></mesh>
    </group>
    {open && <mesh position={[.36, 0, .35]} rotation={[0, -.15, inserting ? .5 : 0]} onClick={e => { e.stopPropagation(); onDiscClick(); }}>
      <ringGeometry args={[.045, .4, 64]} /><meshStandardMaterial map={label} color="#e4dac8" metalness={.45} roughness={.3} side={THREE.DoubleSide} />
    </mesh>}
  </Canvas>;
}

function CameraRig({ mode, dragAngle }: { mode: Mode; dragAngle: React.MutableRefObject<number> }) {
  const { camera, pointer, size } = useThree();
  const target = useMemo(() => new THREE.Vector3(0, 2.9, 0), []);
  useFrame((_, dt) => {
    const close = mode === 'inserting' || mode === 'playing' || mode === 'review';
    const extraBays = Math.max(0, Math.ceil(films.length / BAY_CAPACITY) - 1);
    const aspect = size.width / size.height;
    const angle = dragAngle.current + pointer.x * .014;
    const distance = Math.max(12.8, (6 + extraBays * 3.8) / (Math.tan(THREE.MathUtils.degToRad(43 / 2)) * aspect));
    const desired = close ? new THREE.Vector3(4.9, 2.6, 6.4) : new THREE.Vector3(2.4 + Math.sin(angle) * 7, 3.6 + pointer.y * .05, distance);
    const look = close ? new THREE.Vector3(3.4, 1.4, .8) : new THREE.Vector3(-extraBays * 3.6, 2.85, 0);
    camera.position.lerp(desired, 1 - Math.exp(-dt * 3)); target.lerp(look, 1 - Math.exp(-dt * 3)); camera.lookAt(target);
  });
  return null;
}

// Attaches pointer-drag listeners directly to the WebGL canvas so the user
// can swing the camera left/right. Does NOT interfere with R3F click events
// (a tiny movement threshold distinguishes click from drag).
function DragLook({ dragAngle }: { dragAngle: React.MutableRefObject<number> }) {
  const { gl } = useThree();

  useEffect(() => {
    const el = gl.domElement;
    let active    = false;
    let startX    = 0;
    let lastX     = 0;
    let didDrag   = false;

    const onDown = (e: PointerEvent) => {
      active  = true;
      startX  = e.clientX;
      lastX   = e.clientX;
      didDrag = false;
    };

    const onMove = (e: PointerEvent) => {
      if (!active) return;
      if (Math.abs(e.clientX - startX) > 5) didDrag = true;
      if (!didDrag) return;
      const dx = e.clientX - lastX;
      // ±0.70 rad keeps camera inside walls at x=±9 (sin(0.70)*12.5 ≈ 8.1)
      dragAngle.current = Math.max(-0.70, Math.min(0.70, dragAngle.current - dx * 0.005));
      lastX = e.clientX;
      document.body.style.cursor = 'grabbing';
    };

    const onUp = () => {
      active = false;
      if (didDrag) document.body.style.cursor = '';
    };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',   onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',   onUp);
    };
  }, [gl, dragAngle]);

  return null;
}

function Scene({
  mode,
  selected,
  viewing,
  onSelect,
  onCatalog,
  onTickets,
  onDisc,
  onPlayer
}: {
  mode: Mode;
  selected: Film;
  viewing: Viewing;
  onSelect: (film: Film) => void;
  onCatalog: () => void;
  onTickets: () => void;
  onDisc: () => void;
  onPlayer: () => void;
}) {
  const dragAngle = useRef(0);
  return (
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [2.4, 3.6, 12.8], fov: 43 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}>
      <color attach="background" args={['#171310']} />
      <ambientLight intensity={.45} color="#b5b7b6" />
      <directionalLight position={[-4, 7, 6]} intensity={.65} color="#dfc5a3" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-5} shadow-bias={-.0005} />
      <pointLight position={[-3, 4.4, 3.5]} intensity={14} color="#d6ab76" distance={12} />
      <CameraRig mode={mode} dragAngle={dragAngle} />
      <DragLook dragAngle={dragAngle} />
      <ReferenceRoom onSelect={onSelect} active={mode === 'inserting' || mode === 'playing' || mode === 'review'} onPlayer={onPlayer} />
    </Canvas>
  );
}

export default function FilmRoom() {
  const [mode, setMode] = useState<Mode>('room');
  const [selected, setSelected] = useState<Film>(films[0]);
  const [caseOpen, setCaseOpen] = useState(false);
  const [watch, setWatch] = useState(0);
  const [query, setQuery] = useState('');
  const [catalogSort, setCatalogSort] = useState<CatalogSort>('shelf');
  const [genreFilter, setGenreFilter] = useState('all');
  const [ticketQuery, setTicketQuery] = useState('');
  const [ticketSort, setTicketSort] = useState<TicketSort>('newest');

  const genres = useMemo(() => ['all', ...Array.from(new Set(films.map((film) => film.genre))).sort()], []);
  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return films
      .filter((film) => {
        const haystack = `${film.title} ${film.director} ${film.year} ${film.genre}`.toLowerCase();
        return (genreFilter === 'all' || film.genre === genreFilter) && (normalized.length === 0 || haystack.includes(normalized));
      })
      .sort((left, right) => {
        if (catalogSort === 'title') return left.title.localeCompare(right.title);
        if (catalogSort === 'year') return right.year - left.year;
        if (catalogSort === 'rating') return averageRating(right) - averageRating(left);
        if (catalogSort === 'recent') return latestViewingTime(right) - latestViewingTime(left);
        return Number(left.spine) - Number(right.spine);
      });
  }, [catalogSort, genreFilter, query]);
  const ticketMatches = useMemo(() => {
    const normalized = ticketQuery.trim().toLowerCase();

    return allTickets
      .filter(({ film, viewing: ticketViewing }) => {
        const haystack = `${film.title} ${film.director} ${film.genre} ${ticketViewing.date} ${ticketViewing.with} ${ticketViewing.where} ${ticketViewing.memory}`.toLowerCase();
        return normalized.length === 0 || haystack.includes(normalized);
      })
      .sort((left, right) => {
        if (ticketSort === 'oldest') return Date.parse(left.viewing.date) - Date.parse(right.viewing.date);
        if (ticketSort === 'rating') return right.viewing.rating - left.viewing.rating;
        if (ticketSort === 'title') return left.film.title.localeCompare(right.film.title);
        return Date.parse(right.viewing.date) - Date.parse(left.viewing.date);
      });
  }, [ticketQuery, ticketSort]);
  const viewing = selected.viewings[watch];

  function select(film: Film, index = 0) {
    setSelected(film);
    setWatch(index);
    setCaseOpen(false);
    setMode('case');
  }

  function back() {
    setMode((current) => {
      if (current === 'confirm' || current === 'inserting') return 'case';
      if (current === 'review') return 'playing';
      setCaseOpen(false);
      return 'room';
    });
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') back();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (mode !== 'inserting') return;
    const timeout = window.setTimeout(() => setMode('playing'), 900);
    return () => window.clearTimeout(timeout);
  }, [mode]);

  return (
    <main className="cinema">
      {!(mode === 'case' || mode === 'confirm' || mode === 'inserting') && <Suspense fallback={<div className="loading">Preparing the screening room...</div>}>
        <Scene
          mode={mode}
          selected={selected}
          viewing={viewing}
          onSelect={select}
          onCatalog={() => setMode('catalog')}
          onTickets={() => setMode('tickets')}
          onDisc={() => setMode('confirm')}
          onPlayer={() => setMode('playing')}
        />
      </Suspense>}

      <header className="hud">
        <div className="brand">
          <span className="monogram">AF</span>
          <span>
            <strong>Aarav's Films</strong>
            <small>A PERSONAL FILM JOURNAL</small>
          </span>
        </div>
        <nav>
          <button onClick={() => setMode('catalog')}>CARD CATALOG</button>
          <button onClick={() => setMode('tickets')}>TICKET BOX</button>
          <button onClick={() => setMode('room')}>THE ROOM</button>
        </nav>
      </header>

      {mode === 'room' && (
        <div className="room-caption">
          <span>THE ROOM • {films.length} FILMS</span>
          <p>A shelf of films. A box of memories. Pick a labeled tape to begin.</p>
        </div>
      )}

      {(mode === 'case' || mode === 'confirm' || mode === 'inserting') && (
        <div className="case-shade" onClick={(event) => event.target === event.currentTarget && setMode('room')}>
          <section className="case-info" role="dialog" aria-modal="true" aria-labelledby="case-heading">
            <button className="panel-close" onClick={() => setMode('room')} aria-label="Return to shelf">
              ×
            </button>
            <div className="case-ticket-side">
              <span className="eyebrow">PULLED FROM THE SHELF • {selected.spine}</span>
              <h1 id="case-heading">{selected.title}</h1>
              <p>
                {selected.director} • {selected.year} • {selected.genre}
              </p>
              <div className="ticket-card">
                <span className="eyebrow">MOVIE TICKET + MEMORY</span>
                <div className="ticket-grid">
                  <div>
                    <small>WATCHED</small>
                    <strong>{viewing.date}</strong>
                  </div>
                  <div>
                    <small>RATING</small>
                    <strong>{viewing.rating} / 5</strong>
                  </div>
                  <div>
                    <small>WITH</small>
                    <strong>{viewing.with}</strong>
                  </div>
                  <div>
                    <small>WHERE</small>
                    <strong>{viewing.where}</strong>
                  </div>
                </div>
                <p>“{viewing.memory}”</p>
                {selected.viewings.length > 1 && (
                  <div className="watch-buttons">
                    {selected.viewings.map((_, index) => (
                      <button className={index === watch ? 'active' : ''} key={index} onClick={() => setWatch(index)}>
                        TICKET {index + 1}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="case-disc-side">
              <span className="eyebrow">THE DISC</span>
              <div className="case-stage">
                <CaseStage
                  film={selected}
                  open={caseOpen}
                  inserting={mode === 'inserting'}
                  onToggleOpen={() => setCaseOpen(true)}
                  onDiscClick={() => setMode('confirm')}
                />
              </div>
              {mode === 'confirm' ? (
                <div className="disc-actions">
                  <p>Insert this disc into the TV player?</p>
                  <div className="actions">
                    <button onClick={() => setMode('case')}>CANCEL</button>
                    <button className="primary" onClick={() => setMode('inserting')}>
                      INSERT DISC
                    </button>
                  </div>
                </div>
              ) : mode === 'inserting' ? (
                <p className="disc-status">Moving disc to the TV player...</p>
              ) : caseOpen ? (
                <button className="subtle" onClick={() => setMode('confirm')}>PLAY THIS MEMORY</button>
              ) : (
                <button className="subtle" onClick={() => setCaseOpen(true)}>OPEN CASE</button>
              )}
            </div>
          </section>
        </div>
      )}

      {(mode === 'catalog' || mode === 'tickets') && (
        <div className="drawer-shade" onClick={(event) => event.target === event.currentTarget && setMode('room')}>
          <section className="drawer" role="dialog" aria-modal="true" aria-label={mode === 'catalog' ? 'Card catalog' : 'Ticket box'}>
            <div className="drawer-top">
              <div>
                <span className="eyebrow">{mode === 'catalog' ? 'THE CARD CATALOG' : 'THE TICKET BOX'}</span>
                <h2>{mode === 'catalog' ? 'Find a film.' : 'Memories on paper.'}</h2>
              </div>
              <button aria-label="Return to room" onClick={() => setMode('room')}>×</button>
            </div>
            {mode === 'catalog' ? (
              <>
                <input autoFocus placeholder="Search title, director, year, genre..." value={query} onChange={(event) => setQuery(event.target.value)} />
                <div className="drawer-controls" aria-label="Catalog filters">
                  <label>
                    <span>Genre</span>
                    <select value={genreFilter} onChange={(event) => setGenreFilter(event.target.value)}>
                      {genres.map((genre) => (
                        <option key={genre} value={genre}>
                          {genre === 'all' ? 'All genres' : genre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Sort</span>
                    <select value={catalogSort} onChange={(event) => setCatalogSort(event.target.value as CatalogSort)}>
                      <option value="shelf">Shelf order</option>
                      <option value="recent">Recently watched</option>
                      <option value="rating">Highest rated</option>
                      <option value="year">Release year</option>
                      <option value="title">Title A-Z</option>
                    </select>
                  </label>
                </div>
                <p className="drawer-count">{matches.length} films found</p>
                <div className="drawer-scroll">
                  {matches.map((film) => (
                    <button className="index-card" key={film.id} onClick={() => select(film)}>
                      <span>{film.spine}</span>
                      <strong>
                        {film.title}
                        <small>
                          {film.director} • {film.year} • {film.genre}
                        </small>
                        <em>
                          {film.viewings.length} {film.viewings.length === 1 ? 'watch' : 'watches'} • {averageRating(film).toFixed(1)} / 5
                        </em>
                      </strong>
                      <span>Open</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <input autoFocus placeholder="Search film, person, place, memory..." value={ticketQuery} onChange={(event) => setTicketQuery(event.target.value)} />
                <div className="drawer-controls" aria-label="Ticket filters">
                  <label>
                    <span>Sort</span>
                    <select value={ticketSort} onChange={(event) => setTicketSort(event.target.value as TicketSort)}>
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="rating">Highest rated</option>
                      <option value="title">Film title</option>
                    </select>
                  </label>
                </div>
                <p className="drawer-count">{ticketMatches.length} viewing tickets found</p>
                <div className="drawer-scroll ticket-groups">
                  {ticketMatches.map(({ film, viewing: ticketViewing, index }) => (
                    <button className="paper-ticket" key={film.id + index} onClick={() => select(film, index)}>
                      <span>
                        ADMIT
                        <br />
                        ONE
                      </span>
                      <strong>
                        {film.title}
                        <small>
                          {compactTicketDate.format(new Date(ticketViewing.date))} • {ticketViewing.with} • {ticketViewing.where}
                        </small>
                        <em>{ticketViewing.rating} / 5 • {ticketViewing.memory}</em>
                      </strong>
                      <span>Open</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {(mode === 'playing' || mode === 'review') && (
        <div className="player-screen">
          <div className="tv-closeup" role="dialog" aria-label={`${selected.title} DVD screen`}>
            <div className="tv-glass">
              <div className="player-toolbar">
                <span>
                  ● DVD VIDEO <small>THE FILM ROOM</small>
                </span>
                <button onClick={() => setMode('case')}>EJECT DISC</button>
              </div>
              {mode === 'playing' ? (
                <div className="dvd-home">
                  <span className="eyebrow">A PERSONAL SCREENING • {selected.year}</span>
                  <h1>{selected.title}</h1>
                  <p>{selected.director}</p>
                  <button onClick={() => setMode('review')}>READ MY REVIEW</button>
                  <small>NOT A FILM STREAM • A PERSONAL JOURNAL</small>
                </div>
              ) : (
                <article className="review">
                  <span className="eyebrow">NOTES FROM THE COLLECTION</span>
                  <h1>{selected.title}</h1>
                  <p className="byline">
                    {selected.director} • {selected.year}
                  </p>
                  {selected.review.map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                  <div className="review-end">
                    <span>THE END.</span>
                    <button onClick={() => setMode('playing')}>DVD MENU</button>
                  </div>
                </article>
              )}
            </div>
            <div className="tv-controls" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="tv-speaker" aria-hidden="true" />
          </div>
        </div>
      )}
    </main>
  );
}
