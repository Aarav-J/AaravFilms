'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Text, RoundedBox, useGLTF } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { films, type Film, type Viewing } from '@/data/films';

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

const CRT_MODEL_PATH = '/models/crt-tv-voxel.glb';
const MODEL_PATHS = {
  filmReel: '/models/film-reel.glb',
  dvdPlayer: '/models/dvd-player.glb',
  popcorn: '/models/popcorn-box.glb',
  rug: '/models/rug.glb',
  gizmo: '/models/gizmo.glb',
  delorean: '/models/delorean.glb',
  spot: '/models/spot.glb',
  chessGantry: '/models/chess-gantry.glb',
  tssBatch: '/models/tss-batch-0002.glb',
  medievalBookshelf: '/models/medieval-bookshelves.glb',
  dvdCase: '/models/dvd-case.glb'
} as const;

function Block({
  position,
  rotation = [0, 0, 0],
  size,
  color,
  roughness = 0.9,
  metalness = 0,
  onClick
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  size: [number, number, number];
  color: string;
  roughness?: number;
  metalness?: number;
  onClick?: () => void;
}) {
  return (
    <mesh position={position} rotation={rotation} onClick={onClick} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

function ImportedModel({
  path,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1
}: {
  path: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}) {
  const { scene } = useGLTF(path);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);

  return <primitive object={model} position={position} rotation={rotation} scale={scale} />;
}

// Warm walnut material colours keyed to mesh name fragment
const WALNUT_DARK  = '#4a2810';
const WALNUT_MID   = '#6b3918';
const WALNUT_LIGHT = '#9c5c2e';

function BookshelfModel({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1
}: {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}) {
  const { scene } = useGLTF(MODEL_PATHS.medievalBookshelf);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const n = object.name.toLowerCase();
      const col = n.includes('shelf') || n.includes('top') || n.includes('under')
        ? WALNUT_LIGHT
        : n.includes('leg') || n.includes('base') || n.includes('beam')
          ? WALNUT_DARK
          : WALNUT_MID;
      object.material = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.74,
        metalness: 0.02,
        envMapIntensity: 0.6,
      });
    });
    return clone;
  }, [scene]);

  return <primitive object={model} position={position} rotation={rotation} scale={scale} />;
}

// ── DVD case model: spine + disc + front cover painted per-film via canvas ──
// Raw model bounds: size=[0.1351, 0.19, 0.014] (W×H×Thickness), center=[0,0.095,0].
//
// Spine_Art_Plane sits at local x=-0.0675 (the left/thin edge) — its normal
// faces -X. After rotation=[0,π/2,0] that normal maps to world +Z (camera),
// local Y (height) is untouched, and local Z (thickness, 0.014) becomes the
// WORLD-X axis — i.e. the spacing between neighboring cases on a shelf.
//
// The model's real 14mm thickness is far too thin to read as a shelf pitch,
// so each local axis is scaled independently (scale applies before rotation
// in THREE's TRS composition, so this is safe):
//   scale.y → case height
//   scale.z → spine width / stacking pitch (what WAS 0.014 becomes this)
//   scale.x → how deep the case sits into the shelf
const CASE_HEIGHT_SCALE = 5.0;   // 0.19   * 5.0  = 0.95  (case height)
const CASE_THICK_SCALE  = 16.0;  // 0.014  * 16.0 = 0.224 (shelf pitch / spine width)
const CASE_DEPTH_SCALE  = 4.2;   // 0.1351 * 4.2  = 0.567 (depth into shelf)
const CASE_SCALE: [number, number, number] = [CASE_DEPTH_SCALE, CASE_HEIGHT_SCALE, CASE_THICK_SCALE];
const DVD_CASE_CENTER_Y = 0.095; // raw local center height, pre-scale

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

function paintCaseMaterials(clone: THREE.Object3D, film: Film) {
  const spineTex = cachedTexture(`spine-${film.id}`, () => makeSpineTexture(film));
  const discTex  = cachedTexture(`disc-${film.id}`,  () => makeDiscTexture(film));
  const coverTex = cachedTexture(`cover-${film.id}`, () => makeCoverTexture(film));

  clone.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (object.name === 'Spine_Art_Plane') {
      object.material = new THREE.MeshStandardMaterial({ map: spineTex, roughness: 0.55, metalness: 0.02, side: THREE.DoubleSide });
    } else if (object.name === 'Cylinder') {
      object.material = new THREE.MeshStandardMaterial({ map: discTex, roughness: 0.3, metalness: 0.65, side: THREE.DoubleSide });
    } else if (object.name === 'Case_Back') {
      object.material = new THREE.MeshStandardMaterial({ map: coverTex, roughness: 0.5, metalness: 0.02, side: THREE.DoubleSide });
    } else {
      object.material = new THREE.MeshStandardMaterial({ color: '#141210', roughness: 0.42, metalness: 0.1, side: THREE.DoubleSide });
    }
  });
}

function DvdCase3D({ film }: { film: Film }) {
  const { scene } = useGLTF(MODEL_PATHS.dvdCase);

  const model = useMemo(() => {
    const clone = scene.clone(true);
    paintCaseMaterials(clone, film);
    return clone;
  }, [scene, film]);

  return (
    <primitive
      object={model}
      rotation={[0, Math.PI / 2, 0]}
      scale={CASE_SCALE}
      position={[0, -DVD_CASE_CENTER_Y * CASE_HEIGHT_SCALE, 0]}
    />
  );
}

// ── Case inspection rig: the real GLB case, openable + a spinning disc ──
// Closed: rotation.y = π makes Case_Back (front cover) face the camera.
// Opening: the shell (everything except the disc) swings further around the
// hinge pivot (the spine edge, local x=-0.0675) while the disc undocks
// forward and begins spinning around its own face-normal (Z) axis.
const CASE_HINGE_LOCAL_X = -0.0675;
const CASE_CLOSED_YAW = Math.PI;
const CASE_OPEN_YAW_DELTA = -1.85;

function DvdCaseRig({
  film,
  open,
  inserting,
  onToggleOpen,
  onDiscClick
}: {
  film: Film;
  open: boolean;
  inserting: boolean;
  onToggleOpen: () => void;
  onDiscClick: () => void;
}) {
  const { scene } = useGLTF(MODEL_PATHS.dvdCase);

  const { shell, disc } = useMemo(() => {
    const clone = scene.clone(true);
    paintCaseMaterials(clone, film);
    const discObj = clone.getObjectByName('Cylinder') ?? null;
    if (discObj && discObj.parent) discObj.parent.remove(discObj);
    return { shell: clone, disc: discObj };
  }, [scene, film]);

  const openAmount = useRef(0);
  const spin = useRef(0);
  const shellPivotRef = useRef<THREE.Group>(null);
  const discGroupRef = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    openAmount.current = THREE.MathUtils.damp(openAmount.current, open ? 1 : 0, 3.6, dt);
    const t = openAmount.current;

    if (shellPivotRef.current) {
      shellPivotRef.current.rotation.y = CASE_CLOSED_YAW + t * CASE_OPEN_YAW_DELTA;
    }

    if (discGroupRef.current) {
      discGroupRef.current.position.x = THREE.MathUtils.lerp(0, -0.18, t);
      discGroupRef.current.position.y = THREE.MathUtils.lerp(0, 0.06, t);
      discGroupRef.current.position.z = THREE.MathUtils.lerp(0, 0.62, t);
      const spinSpeed = 0.5 + t * 1.6 + (inserting ? 4.5 : 0);
      spin.current += dt * spinSpeed;
      discGroupRef.current.rotation.z = spin.current;
      const reveal = Math.min(1, t * 3);
      discGroupRef.current.scale.setScalar(THREE.MathUtils.lerp(0.001, 1, reveal));
      discGroupRef.current.visible = reveal > 0.02;
    }
  });

  return (
    <group>
      <group
        ref={shellPivotRef}
        position={[CASE_HINGE_LOCAL_X * CASE_DEPTH_SCALE, 0, 0]}
        onClick={(event) => {
          event.stopPropagation();
          if (!open) onToggleOpen();
        }}
        onPointerOver={() => { if (!open) document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'auto'; }}
      >
        <primitive
          object={shell}
          position={[-CASE_HINGE_LOCAL_X * CASE_DEPTH_SCALE, -DVD_CASE_CENTER_Y * CASE_HEIGHT_SCALE, 0]}
          scale={CASE_SCALE}
        />
      </group>
      {disc && (
        <group ref={discGroupRef}>
          <primitive
            object={disc}
            scale={CASE_SCALE}
            onClick={(event: THREE.Event & { stopPropagation: () => void }) => {
              event.stopPropagation();
              if (open) onDiscClick();
            }}
            onPointerOver={() => { if (open) document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = 'auto'; }}
          />
          {/* generous invisible hitbox so the thin disc is easy to click */}
          <mesh
            onClick={(event) => { event.stopPropagation(); if (open) onDiscClick(); }}
            onPointerOver={() => { if (open) document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = 'auto'; }}
          >
            <circleGeometry args={[0.42, 24]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function CaseStage({
  film,
  open,
  inserting,
  onToggleOpen,
  onDiscClick
}: {
  film: Film;
  open: boolean;
  inserting: boolean;
  onToggleOpen: () => void;
  onDiscClick: () => void;
}) {
  return (
    <Canvas shadows dpr={[1, 1.7]} camera={{ position: [0, 0.1, 2.35], fov: 36 }} gl={{ antialias: true }}>
      <color attach="background" args={['#120a06']} />
      <ambientLight intensity={0.58} color="#ffcf9a" />
      <directionalLight position={[1.4, 2.0, 2.3]} intensity={1.55} color="#ffd9ab" castShadow shadow-mapSize={[512, 512]} />
      <pointLight position={[-1.1, 0.9, 1.5]} intensity={12} distance={6} color="#ff9a44" />
      <Suspense fallback={null}>
        <DvdCaseRig film={film} open={open} inserting={inserting} onToggleOpen={onToggleOpen} onDiscClick={onDiscClick} />
      </Suspense>
    </Canvas>
  );
}

function CameraRig({ mode, dragAngle }: { mode: Mode; dragAngle: React.MutableRefObject<number> }) {
  const { camera, pointer } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);

  // Orbit pivot sits at the room centre-back; radius = distance to default camera position
  const PIVOT_Z = 3.5;
  const RADIUS  = 12.5; // camera at z=16 = pivot(3.5) + radius(12.5)

  useFrame((_, dt) => {
    const roomLike = mode === 'room' || mode === 'catalog' || mode === 'tickets'
                  || mode === 'case'  || mode === 'confirm';

    let desired: THREE.Vector3;
    let look:    THREE.Vector3;

    if (roomLike) {
      // Drag angle orbits the camera; pointer.x adds a tiny live parallax on top
      const angle = dragAngle.current + pointer.x * 0.04;
      const cx = Math.sin(angle) * RADIUS;
      const cz = PIVOT_Z + Math.cos(angle) * RADIUS;
      const cy = 2.2 + pointer.y * 0.4;
      desired = new THREE.Vector3(cx, cy, cz);
      // Look slightly past the pivot in the opposite-X direction so side shelves reveal naturally
      // Lead the look-at strongly opposite to the camera X so side shelves enter frame
      look = new THREE.Vector3(Math.sin(angle) * -5.0, 2.0 + pointer.y * 0.25, 0.0);
    } else if (mode === 'inserting') {
      desired = new THREE.Vector3(1.55, 1.38, 5.7);
      look    = new THREE.Vector3(2.85, 1.12, 1.05);
    } else {
      desired = new THREE.Vector3(3.15, 1.52, 6.25);
      look    = new THREE.Vector3(3.05, 1.45, 0.7);
    }

    camera.position.lerp(desired, 1 - Math.exp(-dt * 2.7));
    target.lerp(look,            1 - Math.exp(-dt * 3.2));
    camera.lookAt(target);
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

function DvdSpine({ film, x, y, z, idx, onSelect }: {
  film: Film; x: number; y: number; z: number; idx: number; onSelect: () => void;
}) {
  const [hover, setHover] = useState(false);
  const ref = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.position.z = THREE.MathUtils.damp(ref.current.position.z, hover ? z + 0.18 : z, 12, dt);
    ref.current.rotation.y = THREE.MathUtils.damp(ref.current.rotation.y, hover ? -0.1 : 0, 12, dt);
  });

  return (
    <group
      ref={ref}
      position={[x, y, z]}
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
      onPointerOver={(event) => { event.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = 'auto'; }}
    >
      {/* generous invisible hitbox — real case geometry is thin on the spine axis */}
      <mesh position={[0, 0.475, CASE_DEPTH_SCALE * 0.0676]} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
        <boxGeometry args={[CASE_THICK_SCALE * 0.03, CASE_HEIGHT_SCALE * 0.19 + 0.12, CASE_DEPTH_SCALE * 0.1351 + 0.12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <DvdCase3D film={film} />
      {hover && (
        <Html position={[0, 0.72, 0.16]} center distanceFactor={7}>
          <div className="hover-label">
            {film.title}
            <small>Open case</small>
          </div>
        </Html>
      )}
    </group>
  );
}

function CoverFace({ film, position }: { film: Film; position: [number, number, number] }) {
  return (
    <group position={position}>
      <RoundedBox args={[0.86, 1.16, 0.06]} radius={0.018} smoothness={3} castShadow receiveShadow>
        <meshStandardMaterial color={film.color} roughness={0.62} />
      </RoundedBox>
      <Text position={[0, 0.12, 0.04]} maxWidth={0.68} fontSize={0.11} lineHeight={1.06} textAlign="center" color={film.accent}>
        {film.title}
      </Text>
      <Text position={[0, -0.38, 0.04]} fontSize={0.048} color="#f7dfb8">
        {film.year}
      </Text>
    </group>
  );
}

function MediaShelf({ onSelect }: { onSelect: (film: Film) => void }) {
  // scale=0.72 → width=8.42, height=7.78, depth=2.03
  // Local center at scale=0.72: x=-5.34, y=3.89, z=-5.51
  //
  // Back wall: center at x=0, front face z≈-0.5
  //   px = 5.34, pz = -0.5 + 0.72*6.242 = 3.99
  //
  // Left wall (R_y+π/2, back at x=−9):
  //   local_z_back*0.72=-6.53 → px=-9+6.53=-2.47
  //   world_z_center=2.5 → pz=2.5-5.34=-2.84
  //
  // Right wall (R_y−π/2, back at x=+9):
  //   px=9-6.53=2.47,  pz=2.5+5.34=7.84

  const S = 0.72;
  // Real case footprint after non-uniform scale: thickness(pitch)=0.224, height=0.95
  const COLS = 24;
  const ROWS = 4;
  const CASE_W = 0.25;
  const CASE_H = 1.05;
  const spineEntries = Array.from({ length: COLS * ROWS }, (_, idx) => ({
    film: films[idx % films.length],
    x: -(COLS - 1) * CASE_W * 0.5 + (idx % COLS) * CASE_W,
    y: 4.3 - Math.floor(idx / COLS) * CASE_H,
    z: -0.40,
    idx,
  }));

  return (
    <group>
      {/* ── Back wall ─────────────────────────────── */}
      <BookshelfModel position={[5.34, 0, 3.99]} scale={S} />

      {/* ── Left wall ─────────────────────────────── */}
      <BookshelfModel position={[-2.47, 0, -2.84]} rotation={[0, Math.PI / 2, 0]} scale={S} />

      {/* ── Right wall ────────────────────────────── */}
      <BookshelfModel position={[2.47, 0, 7.84]} rotation={[0, -Math.PI / 2, 0]} scale={S} />

      {/* ── Interactive DVD spines on back wall ───── */}
      {spineEntries.map(({ film, x, y, z, idx }) => (
        <DvdSpine key={idx} film={film} x={x} y={y} z={z} idx={idx} onSelect={() => onSelect(film)} />
      ))}

      <CoverFace film={films[0]}  position={[-3.4, 2.32, -0.38]} />
      <CoverFace film={films[6]}  position={[-3.4, 1.28, -0.38]} />
      <CoverFace film={films[10]} position={[-3.4, 0.22, -0.38]} />

      <Text position={[0, 6.0, -0.85]} fontSize={0.16} letterSpacing={0.14} color="#e2bd80">
        AARAV'S FILMS
      </Text>
    </group>
  );
}

function CardCatalog({ onClick }: { onClick: () => void }) {
  return (
    <group
      position={[-3.8, 0, 4.2]}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = 'auto')}
    >
      <Block position={[0, 0.7, 0]} size={[1.08, 1.38, 0.78]} color="#633a22" />
      {[0, 1, 2].map((i) => (
        <group key={i}>
          <Block position={[0, 0.31 + i * 0.39, 0.43]} size={[0.96, 0.31, 0.06]} color="#935830" />
          <Block position={[0, 0.31 + i * 0.39, 0.475]} size={[0.23, 0.058, 0.015]} color="#d7a968" metalness={0.8} />
        </group>
      ))}
      <Text position={[0, 1.55, 0.28]} fontSize={0.1} color="#f2d8ab">
        CATALOG
      </Text>
    </group>
  );
}

function TicketBox({ onClick }: { onClick: () => void }) {
  return (
    <group
      position={[-2.2, 0, 5.0]}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = 'auto')}
    >
      <Block position={[0, 0.36, 0]} size={[1.2, 0.5, 0.72]} color="#8a4a28" />
      <Block position={[0, 0.67, -0.06]} size={[1.25, 0.11, 0.78]} color="#b0723b" />
      <Text position={[0, 0.39, 0.37]} fontSize={0.09} color="#f4dcb1">
        TICKETS
      </Text>
    </group>
  );
}

function RoomShell() {
  return (
    <group>
      {/* back wall — wider and pushed deeper */}
      <Block position={[0, 4.5, -4.0]} size={[26, 11, 0.28]} color="#2e1d12" />
      {/* side walls — taller and running the full depth */}
      <Block position={[-9.0, 4.5, 4.5]} size={[0.28, 11, 28]} color="#1e1410" />
      <Block position={[ 9.0, 4.5, 4.5]} size={[0.28, 11, 28]} color="#221510" />
      {/* floor */}
      <Block position={[0, -0.12, 4.5]} size={[26, 0.2, 32]} color="#3c2214" />
      {/* floor planks */}
      {[-8, -5, -2.5, 0, 2.5, 5, 8].map((x) => (
        <Block key={x} position={[x, -0.005, 4.5]} size={[0.022, 0.016, 31]} color="#4f2d18" />
      ))}
      {/* ceiling — adds the enclosed library feel */}
      <Block position={[0, 9.6, 4.5]} size={[26, 0.3, 32]} color="#1c110c" />
      {/* rug */}
      <mesh position={[0.8, -0.035, 5.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[4.0, 64]} />
        <meshStandardMaterial color="#5b4434" roughness={0.98} />
      </mesh>
      <mesh position={[0.8, -0.025, 5.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[3.0, 64]} />
        <meshStandardMaterial color="#654735" roughness={0.98} />
      </mesh>
    </group>
  );
}


function GizmoFigure({ position, scale = 1, rotation = [0, 0, 0] }: { position: [number, number, number]; scale?: number; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <ImportedModel path={MODEL_PATHS.gizmo} />
    </group>
  );
}

function DvdPlayer({ position, rotation = [0, 0, 0] }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      <ImportedModel path={MODEL_PATHS.dvdPlayer} scale={0.001} />
    </group>
  );
}

function RoomRug() {
  return (
    <group position={[1.2, 0.002, 5.8]} rotation={[0, Math.PI / 6, 0]}>
      <ImportedModel path={MODEL_PATHS.rug} scale={1.42} />
    </group>
  );
}

function PopcornCup({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0, -0.25, 0]} scale={0.45}>
      <ImportedModel path={MODEL_PATHS.popcorn} />
    </group>
  );
}

function DeLorean({ position, rotation = [0, 0, 0] }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    // Model center Y=-0.077, half-height=0.8 → bottom at -0.877. At scale=0.17, bottom=-0.149 → lift by 0.15
    <group position={position} rotation={rotation}>
      <ImportedModel path={MODEL_PATHS.delorean} scale={0.17} position={[0, 0.15, 0]} />
    </group>
  );
}


function ReelLamp() {
  // Stands on the floor at world [4.82, 0, 1.9] — right of TV, visible from camera
  return (
    <group position={[4.6, 0, 3.4]} rotation={[0, -0.35, 0]}>
      {/* warm amber bulb tucked inside the reel hub */}
      <pointLight position={[0, 1.62, 0.08]} intensity={52} distance={5.2} color="#ff9e47" />
      {/* the film reel — rotate 90° on X so it stands upright like a wheel */}
      <group position={[0, 1.58, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ImportedModel path={MODEL_PATHS.filmReel} scale={0.72} />
      </group>
      {/* glowing bulb at the centre */}
      <mesh position={[0, 1.58, 0.04]}>
        <sphereGeometry args={[0.14, 20, 14]} />
        <meshStandardMaterial color="#ffbf69" emissive="#ff8a2f" emissiveIntensity={3.2} />
      </mesh>
      {/* halo disc */}
      <mesh position={[0, 1.58, 0.08]} rotation={[0, 0, 0]}>
        <circleGeometry args={[0.38, 48]} />
        <meshBasicMaterial color="#ffb160" transparent opacity={0.1} side={THREE.DoubleSide} />
      </mesh>
      {/* pole */}
      <Block position={[0, 0.82, 0]} size={[0.07, 1.64, 0.07]} color="#4b3225" metalness={0.45} roughness={0.5} />
      {/* weighted base */}
      <Block position={[0, 0.04, 0]} size={[0.62, 0.08, 0.42]} color="#3e2a1c" metalness={0.4} roughness={0.55} />
    </group>
  );
}

function VoxelCrt({ active }: { active: boolean }) {
  const { scene } = useGLTF(CRT_MODEL_PATH);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);

  return (
    <group>
      <primitive object={model} position={[1.55, -0.04, 0.86]} scale={0.14} />
      {active && <pointLight position={[-0.24, 0.64, 0.68]} intensity={9} distance={2.2} color="#f19a54" />}
    </group>
  );
}

useGLTF.preload(CRT_MODEL_PATH);
Object.values(MODEL_PATHS).forEach((p) => useGLTF.preload(p));

function Television({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <group
      position={[3.86, 0, 1.2]}
      rotation={[0, -0.08, 0]}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = 'auto')}
    >
      <VoxelCrt active={active} />
      <mesh position={[-0.24, 0.64, 0.56]}>
        <planeGeometry args={[1.03, 0.62]} />
        <meshBasicMaterial color={active ? '#d89a55' : '#d8f0eb'} transparent opacity={active ? 0.18 : 0.16} />
      </mesh>
      <Text position={[-0.24, 0.65, 0.59]} fontSize={0.092} color={active ? '#f1c88e' : '#26312f'}>
        {active ? 'DVD MENU' : 'STATIC'}
      </Text>
      <Block position={[0, -0.11, 0.12]} size={[2.05, 0.2, 1.04]} color="#704528" />
      <Block position={[-0.22, -0.02, 0.66]} size={[1.1, 0.05, 0.035]} color="#17100d" />
      <Block position={[0.52, -0.01, 0.67]} size={[0.08, 0.055, 0.035]} color={active ? '#f3a142' : '#433226'} />
      <Text position={[0.35, -0.035, 0.69]} fontSize={0.048} color="#ddc89c">
        DISC PLAYER
      </Text>
    </group>
  );
}



function RoomProps() {
  return (
    <group>
      {/* popcorn — beside lamp on floor */}
      <PopcornCup position={[5.0, 0.51, 3.8]} />
      {/* large gizmo — center floor, faces camera */}
      <GizmoFigure position={[1.8, 0, 5.2]} scale={1.1} rotation={[0, 2.6, 0]} />
      {/* small gizmo — right side near TV */}
      <GizmoFigure position={[4.6, 0, 4.6]} scale={0.7} rotation={[0, -1.2, 0]} />
      {/* DVD player flat on floor in front of TV, like a VCR */}
      <DvdPlayer position={[3.2, 0.054, 1.0]} rotation={[0, 0, 0]} />
      {/* DeLorean toy — visible center-right floor */}
      <DeLorean position={[3.0, 0, 4.2]} rotation={[0, -0.3, 0]} />
    </group>
  );
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
    <Canvas shadows dpr={[1, 1.7]} camera={{ position: [0, 2.4, 16], fov: 52 }} gl={{ antialias: true }}>
      <color attach="background" args={['#1a100c']} />
      <fog attach="fog" args={['#1a100c', 14, 30]} />
      <ambientLight intensity={0.62} color="#ffcfa0" />
      <directionalLight position={[-5, 8, 5]} intensity={1.4} color="#ffd4a8" castShadow shadow-mapSize={[1024, 1024]} />
      {/* reel lamp warm key */}
      <pointLight position={[3.7, 1.7, 1.2]} intensity={45} distance={7}  color="#ff9a44" />
      {/* ambient fill — left side */}
      <pointLight position={[-5.0, 3.0, 4.0]} intensity={20} distance={10} color="#d8662e" />
      {/* shelf fill — back wall */}
      <pointLight position={[0, 5.5, 4.5]}   intensity={28} distance={12} color="#ffcf9a" />
      {/* shelf fill — left wall shelf */}
      <pointLight position={[-5.0, 4.5, 2.5]} intensity={20} distance={9}  color="#ffbb80" />
      {/* shelf fill — right wall shelf */}
      <pointLight position={[ 5.0, 4.5, 2.5]} intensity={20} distance={9}  color="#ffbb80" />
      <CameraRig mode={mode} dragAngle={dragAngle} />
      <DragLook dragAngle={dragAngle} />
      <ReelLamp />

      <RoomShell />

      <MediaShelf onSelect={onSelect} />
      <CardCatalog onClick={onCatalog} />
      <TicketBox onClick={onTickets} />
      <Television active={mode === 'inserting' || mode === 'playing' || mode === 'review'} onClick={onPlayer} />
      <RoomRug />
      <RoomProps />
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
      <Suspense fallback={<div className="loading">Preparing the screening room...</div>}>
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
      </Suspense>

      <header className="hud">
        <div className="brand">
          <span className="monogram">AF</span>
          <span>
            <strong>Aarav's Films</strong>
            <small>AN INTERACTIVE FILM ROOM</small>
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
          <p>Choose a spine, open a drawer, or wake the TV.</p>
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
                <p className="disc-status">Click the spinning disc to begin.</p>
              ) : (
                <p className="disc-status">Click the case to open it.</p>
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
              <button onClick={() => setMode('room')}>×</button>
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
