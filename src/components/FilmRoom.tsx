"use client";
import Image from "next/image";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { films as seedFilms, type Film, type Viewing } from "@/data/films";
import ReferenceRoom, { BAY_CAPACITY } from "./ReferenceRoom";
import { useFilmPosterTexture } from "./useFilmPosterTexture";
import { useSounds } from "./useSounds";
import FilmLoadingScreen from "./FilmLoadingScreen";
import { type FilmsPayload } from "./useFilmsLoader";

type Mode =
  | "room"
  | "case"
  | "confirm"
  | "inserting"
  | "playing"
  | "review"
  | "catalog"
  | "tickets";

type TicketEntry = { film: Film; viewing: Viewing; index: number };
type CatalogSort = "shelf" | "title" | "year" | "rating" | "recent";
type TicketSort = "newest" | "oldest" | "rating" | "title";

function averageRating(film: Film) {
  if (film.viewings.length === 0) return 0;
  return (
    film.viewings.reduce((total, viewing) => total + viewing.rating, 0) /
    film.viewings.length
  );
}

function latestViewingTime(film: Film) {
  return Math.max(...film.viewings.map((viewing) => Date.parse(viewing.date)));
}

const compactTicketDate = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function reviewParagraphs(film: Film, viewing: Viewing) {
  const diaryReview = viewing.review?.trim();
  if (diaryReview)
    return diaryReview
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
  if (film.review.length > 0) return film.review;
  return ["No written review for this watch yet."];
}

function DiscMesh({
  poster,
  inserting,
  onDiscClick,
}: {
  poster: THREE.Texture;
  inserting: boolean;
  onDiscClick: () => void;
}) {
  const ref = useRef<THREE.Group>(null);
  // Skipped for users who asked the OS for reduced motion.
  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  useFrame((_, dt) => {
    if (ref.current && !reducedMotion) ref.current.rotation.z += dt * 0.5;
  });

  return (
    <group
      ref={ref}
      rotation={[0, 0, inserting ? 0.6 : 0]}
      onClick={(e) => {
        e.stopPropagation();
        onDiscClick();
      }}
    >
      <mesh>
        <ringGeometry args={[0.1, 0.66, 128]} />
        <meshStandardMaterial
          map={poster}
          color="#f3e8d8"
          metalness={0.45}
          roughness={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0, 0.004]}>
        <ringGeometry args={[0.1, 0.66, 128]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.008]}>
        <ringGeometry args={[0.1, 0.66, 128]} />
        <meshBasicMaterial
          color="#0d0906"
          transparent
          opacity={0.18}
          wireframe
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.012]}>
        <circleGeometry args={[0.105, 64]} />
        <meshStandardMaterial
          color="#100b08"
          metalness={0.35}
          roughness={0.22}
        />
      </mesh>
    </group>
  );
}

function DiscScene({
  film,
  inserting,
  onDiscClick,
}: {
  film: Film;
  inserting: boolean;
  onDiscClick: () => void;
}) {
  const poster = useFilmPosterTexture(film);

  return (
    <>
      <ambientLight intensity={1.3} color="#fff2e0" />
      <directionalLight position={[2, 3, 4]} intensity={2.2} color="#ffd9ab" />
      <directionalLight
        position={[-3, -1.5, 2.5]}
        intensity={0.7}
        color="#c9d7ff"
      />
      <pointLight
        position={[0, 0, 2]}
        intensity={0.8}
        color="#ffe6bf"
        distance={5}
      />
      <DiscMesh
        poster={poster}
        inserting={inserting}
        onDiscClick={onDiscClick}
      />
    </>
  );
}

function DiscViewer({
  film,
  inserting,
  onDiscClick,
}: {
  film: Film;
  inserting: boolean;
  onDiscClick: () => void;
}) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 2.55], fov: 36 }}
      gl={{ antialias: true, alpha: true }}
    >
      <DiscScene film={film} inserting={inserting} onDiscClick={onDiscClick} />
    </Canvas>
  );
}

function CameraRig({
  mode,
  dragAngle,
  zoom,
  films,
}: {
  mode: Mode;
  dragAngle: React.MutableRefObject<number>;
  zoom: React.MutableRefObject<number>;
  films: Film[];
}) {
  const { camera, pointer, size } = useThree();
  const target = useMemo(() => new THREE.Vector3(0, 2.9, 0), []);
  useFrame((_, dt) => {
    const close =
      mode === "inserting" || mode === "playing" || mode === "review";
    const extraBays = Math.max(0, Math.ceil(films.length / BAY_CAPACITY) - 1);
    const aspect = size.width / size.height;
    const angle = dragAngle.current + pointer.x * 0.009;
    const distance = Math.max(
      12.8,
      (6 + extraBays * 3.8) /
        (Math.tan(THREE.MathUtils.degToRad(43 / 2)) * aspect),
    );
    const baseZ = distance * zoom.current;
    const desired = close
      ? new THREE.Vector3(4.9, 2.6, 6.4)
      : new THREE.Vector3(
          2.4 + Math.sin(angle) * 8.5,
          3.6 + pointer.y * 0.05,
          // cos term gives a circular orbital arc: z pulls in as you pan left/right
          baseZ * 0.38 + baseZ * 0.62 * Math.cos(angle * 0.72),
        );
    // Look target tracks drag so panning left actually reveals the left bookcase edge.
    const look = close
      ? new THREE.Vector3(3.4, 1.4, 0.8)
      : new THREE.Vector3(
          -extraBays * 2.5 + Math.sin(dragAngle.current) * (7 + extraBays * 5),
          2.85,
          0,
        );
    camera.position.lerp(desired, 1 - Math.exp(-dt * 3));
    target.lerp(look, 1 - Math.exp(-dt * 3));
    camera.lookAt(target);
  });
  return null;
}

// Attaches pointer-drag listeners directly to the WebGL canvas so the user
// can swing the camera left/right. Does NOT interfere with R3F click events
// (a tiny movement threshold distinguishes click from drag).
function DragLook({
  dragAngle,
  zoom,
}: {
  dragAngle: React.MutableRefObject<number>;
  zoom: React.MutableRefObject<number>;
}) {
  const { gl } = useThree();

  useEffect(() => {
    const el = gl.domElement;
    let active = false;
    let startX = 0;
    let lastX = 0;
    let didDrag = false;

    const onDown = (e: PointerEvent) => {
      active = true;
      startX = e.clientX;
      lastX = e.clientX;
      didDrag = false;
    };

    const onMove = (e: PointerEvent) => {
      if (!active) return;
      if (Math.abs(e.clientX - startX) > 5) didDrag = true;
      if (!didDrag) return;
      const dx = e.clientX - lastX;
      // ±1.7 rad: left clamp reaches the far-left bookcase edge; right matches.
      dragAngle.current = Math.max(
        -1.7,
        Math.min(0.7, dragAngle.current - dx * 0.0025),
      );
      lastX = e.clientX;
      document.body.style.cursor = "grabbing";
    };

    const onUp = () => {
      active = false;
      if (didDrag) document.body.style.cursor = "";
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom.current = THREE.MathUtils.clamp(
        zoom.current + e.deltaY * 0.00065,
        0.5,
        1.48,
      );
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [gl, dragAngle, zoom]);

  return null;
}

function Scene({
  films,
  mode,
  onSelect,
  onPlayer,
  onCatalog,
  onTickets,
}: {
  films: Film[];
  mode: Mode;
  onSelect: (film: Film) => void;
  onPlayer: () => void;
  onCatalog: () => void;
  onTickets: () => void;
}) {
  const dragAngle = useRef(0);
  const zoom = useRef(1);
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [2.4, 3.6, 12.8], fov: 43 }}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.2,
      }}
    >
      <color attach="background" args={["#171310"]} />
      <ambientLight intensity={0.45} color="#b5b7b6" />
      <directionalLight
        position={[-4, 7, 6]}
        intensity={0.65}
        color="#dfc5a3"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-5}
        shadow-bias={-0.0005}
      />
      <pointLight
        position={[-3, 4.4, 3.5]}
        intensity={14}
        color="#d6ab76"
        distance={12}
      />
      {/* Left-side fill lights so the far bookshelf and journal furniture stay readable */}
      <pointLight
        position={[-8, 4.2, 1.5]}
        intensity={22}
        color="#d4a97a"
        distance={14}
        decay={2}
      />
      <pointLight
        position={[-4, 3.6, 3.8]}
        intensity={12}
        color="#c9b48a"
        distance={10}
        decay={2}
      />
      <CameraRig mode={mode} dragAngle={dragAngle} zoom={zoom} films={films} />
      <DragLook dragAngle={dragAngle} zoom={zoom} />
      <ReferenceRoom
        films={films}
        onSelect={onSelect}
        active={mode === "inserting" || mode === "playing" || mode === "review"}
        onPlayer={onPlayer}
        onCatalog={onCatalog}
        onTickets={onTickets}
      />
    </Canvas>
  );
}

export default function FilmRoom() {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("room");
  const [catalogFilms, setCatalogFilms] = useState<Film[]>(seedFilms);
  const [selected, setSelected] = useState<Film>(seedFilms[0]);
  const [watch, setWatch] = useState(0);
  const [query, setQuery] = useState("");
  const [catalogSort, setCatalogSort] = useState<CatalogSort>("shelf");
  const [genreFilter, setGenreFilter] = useState("all");
  const [ticketQuery, setTicketQuery] = useState("");
  const [ticketSort, setTicketSort] = useState<TicketSort>("newest");
  const sfx = useSounds();

  const allTickets: TicketEntry[] = useMemo(
    () =>
      catalogFilms
        .flatMap((film) =>
          film.viewings.map((viewing, index) => ({ film, viewing, index })),
        )
        .sort(
          (a, b) => Date.parse(b.viewing.date) - Date.parse(a.viewing.date),
        ),
    [catalogFilms],
  );
  const genres = useMemo(
    () => [
      "all",
      ...Array.from(new Set(catalogFilms.map((film) => film.genre))).sort(),
    ],
    [catalogFilms],
  );
  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return catalogFilms
      .filter((film) => {
        const haystack =
          `${film.title} ${film.director} ${film.year} ${film.genre}`.toLowerCase();
        return (
          (genreFilter === "all" || film.genre === genreFilter) &&
          (normalized.length === 0 || haystack.includes(normalized))
        );
      })
      .sort((left, right) => {
        if (catalogSort === "title")
          return left.title.localeCompare(right.title);
        if (catalogSort === "year") return right.year - left.year;
        if (catalogSort === "rating")
          return averageRating(right) - averageRating(left);
        if (catalogSort === "recent")
          return latestViewingTime(right) - latestViewingTime(left);
        return Number(left.spine) - Number(right.spine);
      });
  }, [catalogFilms, catalogSort, genreFilter, query]);
  const ticketMatches = useMemo(() => {
    const normalized = ticketQuery.trim().toLowerCase();

    return allTickets
      .filter(({ film, viewing: ticketViewing }) => {
        const haystack =
          `${film.title} ${film.director} ${film.genre} ${ticketViewing.date} ${ticketViewing.with} ${ticketViewing.where} ${ticketViewing.memory}`.toLowerCase();
        return normalized.length === 0 || haystack.includes(normalized);
      })
      .sort((left, right) => {
        if (ticketSort === "oldest")
          return Date.parse(left.viewing.date) - Date.parse(right.viewing.date);
        if (ticketSort === "rating")
          return right.viewing.rating - left.viewing.rating;
        if (ticketSort === "title")
          return left.film.title.localeCompare(right.film.title);
        return Date.parse(right.viewing.date) - Date.parse(left.viewing.date);
      });
  }, [allTickets, ticketQuery, ticketSort]);
  const viewing = selected.viewings[watch];
  const activeReviewParagraphs = reviewParagraphs(selected, viewing);

  function select(film: Film, index = 0) {
    sfx.tapePull();
    setSelected(film);
    setWatch(index);
    setMode("case");
  }

  function back() {
    setMode((current) => {
      if (current === "confirm" || current === "inserting") return "case";
      if (current === "review") return "playing";
      return "room";
    });
  }

  function handleReady(payload: FilmsPayload<Film>) {
    setCatalogFilms(payload.films);
    setSelected(payload.films[0]);
    setReady(true);
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") back();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (mode !== "inserting") return;
    const crt = window.setTimeout(() => sfx.crtOn(), 700);
    const flip = window.setTimeout(() => setMode("playing"), 900);
    return () => {
      window.clearTimeout(crt);
      window.clearTimeout(flip);
    };
  }, [mode]);

  if (!ready) {
    return (
      <FilmLoadingScreen<Film>
        onReady={handleReady}
        onSkip={() => setReady(true)}
      />
    );
  }

  return (
    <main className="cinema">
      <Suspense
        fallback={
          <div className="loading">Preparing the screening room...</div>
        }
      >
        <Scene
          films={catalogFilms}
          mode={mode}
          onSelect={select}
          onPlayer={() => setMode("playing")}
          onCatalog={() => setMode("catalog")}
          onTickets={() => setMode("tickets")}
        />
      </Suspense>

      {(mode === "case" || mode === "confirm") && (
        <div
          className="case-shade"
          onClick={(event) =>
            event.target === event.currentTarget && setMode("room")
          }
        >
          <section
            className="disc-select"
            role="dialog"
            aria-modal="true"
            aria-labelledby="case-heading"
          >
            <button
              className="panel-close"
              onClick={() => setMode("room")}
              aria-label="Return to shelf"
            >
              ×
            </button>
            <h1 id="case-heading">{selected.title}</h1>
            <p>
              {selected.director} • {selected.year} • {selected.genre}
            </p>
            <div className="disc-stage">
              <DiscViewer
                film={selected}
                inserting={false}
                onDiscClick={() => {
                  sfx.discClick();
                  setMode("confirm");
                }}
              />
            </div>
            {mode === "confirm" ? (
              <div className="disc-actions">
                <p>Insert this disc into the TV player?</p>
                <div className="actions">
                  <button onClick={() => setMode("case")}>CANCEL</button>
                  <button
                    className="primary"
                    onClick={() => {
                      sfx.insert();
                      setMode("inserting");
                    }}
                  >
                    INSERT DISC
                  </button>
                </div>
              </div>
            ) : (
              <p className="disc-hint">Click the disc</p>
            )}
          </section>
        </div>
      )}

      {(mode === "catalog" || mode === "tickets") && (
        <div
          className="drawer-shade"
          onClick={(event) =>
            event.target === event.currentTarget && setMode("room")
          }
        >
          <section
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label={mode === "catalog" ? "Card catalog" : "Ticket box"}
          >
            <div className="drawer-top">
              <div>
                <span className="eyebrow">
                  {mode === "catalog" ? "THE CARD CATALOG" : "THE TICKET BOX"}
                </span>
                <h2>
                  {mode === "catalog" ? "Find a film." : "Memories on paper."}
                </h2>
              </div>
              <button
                aria-label="Return to room"
                onClick={() => setMode("room")}
              >
                ×
              </button>
            </div>
            {mode === "catalog" ? (
              <>
                <input
                  autoFocus
                  placeholder="Search title, director, year, genre..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <div className="drawer-controls" aria-label="Catalog filters">
                  <label>
                    <span>Genre</span>
                    <select
                      value={genreFilter}
                      onChange={(event) => setGenreFilter(event.target.value)}
                    >
                      {genres.map((genre) => (
                        <option key={genre} value={genre}>
                          {genre === "all" ? "All genres" : genre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Sort</span>
                    <select
                      value={catalogSort}
                      onChange={(event) =>
                        setCatalogSort(event.target.value as CatalogSort)
                      }
                    >
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
                    <button
                      className="index-card"
                      key={film.id}
                      onClick={() => select(film)}
                    >
                      <Image
                        className="index-card-poster"
                        src={film.poster}
                        alt={`${film.title} poster`}
                        width={48}
                        height={72}
                      />
                      <span>{film.spine}</span>
                      <strong>
                        {film.title}
                        <small>
                          {film.director} • {film.year} • {film.genre}
                        </small>
                        <em>
                          {film.viewings.length}{" "}
                          {film.viewings.length === 1 ? "watch" : "watches"} •{" "}
                          {averageRating(film).toFixed(1)} / 5
                        </em>
                      </strong>
                      <span>Open</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <input
                  autoFocus
                  placeholder="Search film, person, place, memory..."
                  value={ticketQuery}
                  onChange={(event) => setTicketQuery(event.target.value)}
                />
                <div className="drawer-controls" aria-label="Ticket filters">
                  <label>
                    <span>Sort</span>
                    <select
                      value={ticketSort}
                      onChange={(event) =>
                        setTicketSort(event.target.value as TicketSort)
                      }
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="rating">Highest rated</option>
                      <option value="title">Film title</option>
                    </select>
                  </label>
                </div>
                <p className="drawer-count">
                  {ticketMatches.length} viewing tickets found
                </p>
                <div className="drawer-scroll ticket-groups">
                  {ticketMatches.map(
                    ({ film, viewing: ticketViewing, index }) => (
                      <button
                        className="paper-ticket"
                        key={film.id + index}
                        onClick={() => select(film, index)}
                      >
                        <span>
                          ADMIT
                          <br />
                          ONE
                        </span>
                        <strong>
                          {film.title}
                          <small>
                            {compactTicketDate.format(
                              new Date(ticketViewing.date),
                            )}{" "}
                            • {ticketViewing.with} • {ticketViewing.where}
                          </small>
                          <em>
                            {ticketViewing.rating} / 5 • {ticketViewing.memory}
                          </em>
                        </strong>
                        <span>Open</span>
                      </button>
                    ),
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {(mode === "playing" || mode === "review") && (
        <div className="player-screen">
          <div
            className="tv-closeup"
            role="dialog"
            aria-label={`${selected.title} DVD screen`}
          >
            <div className="tv-glass">
              <div className="player-toolbar">
                <button
                  className="eject-btn"
                  onClick={() => {
                    sfx.eject();
                    setMode("case");
                  }}
                  aria-label="Eject disc"
                >
                  <span className="eject-icon" aria-hidden="true" />
                  EJECT
                </button>
              </div>
              {mode === "playing" ? (
                <div className="dvd-home">
                  <div className="dvd-home-row">
                    <div className="dvd-poster-card">
                      <Image
                        src={selected.poster}
                        alt={`${selected.title} poster`}
                        width={320}
                        height={480}
                        priority
                      />
                    </div>
                    <div className="dvd-menu-content">
                      <div className="dvd-home-main">
                        <h1>{selected.title}</h1>
                        <div className="dvd-meta">
                          <span>{viewing.rating} / 5</span>
                          <span>
                            {compactTicketDate.format(new Date(viewing.date))}
                          </span>
                        </div>
                        <div className="source-links">
                          <a
                            href={`https://www.themoviedb.org/movie/${selected.tmdbId}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            TMDB
                          </a>
                          <a
                            href={
                              selected.letterboxd?.url ??
                              `https://letterboxd.com/film/${selected.letterboxdSlug}/`
                            }
                            target="_blank"
                            rel="noreferrer"
                          >
                            Letterboxd
                            {selected.letterboxd?.entries.length
                              ? ` · ${selected.letterboxd.entries.length}`
                              : ""}
                          </a>
                        </div>
                        <button onClick={() => setMode("review")}>
                          VIEW REVIEW
                        </button>
                      </div>
                      {selected.viewings.length > 1 && (
                        <div className="viewing-stubs">
                          {selected.viewings.map((v, index) => (
                            <button
                              key={index}
                              className={`viewing-stub${index === watch ? " active" : ""}`}
                              onClick={() => setWatch(index)}
                            >
                              <span className="stub-date">
                                {compactTicketDate.format(new Date(v.date))}
                              </span>
                              <span className="stub-rating">
                                {v.rating} / 5
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <article className="review">
                  <h1>{selected.title}</h1>
                  <p className="byline">
                    {selected.director} • {selected.year}
                  </p>
                  {activeReviewParagraphs.map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                  <div className="review-end">
                    <button onClick={() => setMode("playing")}>DVD MENU</button>
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
