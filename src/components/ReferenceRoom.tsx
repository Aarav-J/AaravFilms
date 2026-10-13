'use client';

import { useFrame } from '@react-three/fiber';
import { Html, RoundedBox, useGLTF } from '@react-three/drei';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { type Film } from '@/data/films';
import { useFilmPosterTexture } from './useFilmPosterTexture';
import JournalFurniture from './JournalFurniture';
import ChessTable from './ChessTable';

// All dimensions are in room units. A bay holds 112 journal entries.
export const SHELF_COLUMNS = 28;
export const SHELF_ROWS = 4;
export const BAY_CAPACITY = SHELF_COLUMNS * SHELF_ROWS;
const palette = ['#b1a58b', '#25252a', '#703b30', '#a3906a', '#3d5055', '#6c715e', '#997357', '#bdb7a0', '#843e30', '#d0bfa4', '#283e4b', '#d4c6ad', '#34322e'];
function random(seed: number) { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function texture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c.getContext('2d')!); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function woodTexture() {
  return texture(256, 1024, ctx => {
    ctx.fillStyle = '#755037'; ctx.fillRect(0, 0, 256, 1024);
    for (let i = 0; i < 1800; i++) {
      ctx.strokeStyle = `rgba(${i % 3 ? '32,15,5' : '209,151,93'},${0.04 + random(i) * .15})`;
      ctx.lineWidth = .4 + random(i + 3) * 1.6; ctx.beginPath();
      const x = random(i + 1) * 256;
      ctx.moveTo(x, 0); for (let y = 0; y <= 1024; y += 32) ctx.lineTo(x + Math.sin(y * .009 + i) * 2.8, y); ctx.stroke();
    }
  });
}
function spineTexture(film: Film | undefined, index: number) {
  // Rendered at 2x and downsampled by the GPU so titles stay crisp at a
  // grazing shelf-viewing angle instead of smearing into illegible noise.
  return texture(192, 1024, ctx => {
    ctx.scale(2, 2);
    ctx.fillStyle = film?.color ?? palette[Math.floor(random(index + 90) * palette.length)]; ctx.fillRect(0, 0, 96, 512);
    ctx.fillStyle = '#d6c6a3'; ctx.fillRect(5, 12, 86, 44); ctx.fillRect(5, 451, 86, 49);
    if (!film && index % 5 === 0) { ctx.fillStyle = '#d4c7a8'; ctx.fillRect(8, 64, 80, 376); }
    ctx.fillStyle = '#28241f'; ctx.textAlign = 'center'; ctx.font = 'bold 15px monospace';
    ctx.fillText(film ? `AF ${film.spine}` : 'VHS', 48, 32); ctx.font = 'bold 11px monospace'; ctx.fillText('HI-FI STEREO', 48, 47);
    ctx.save(); ctx.translate(48, 252); ctx.rotate(-Math.PI / 2);
    const label = film?.title.toUpperCase() ?? ['VIDEO ARCHIVE', 'BLANK TAPE', 'HOME VIDEO', 'STEREO / VHS'][index % 4];
    ctx.font = `800 ${film && film.title.length > 22 ? 27 : 33}px Arial, sans-serif`;
    ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(8,6,4,.6)';
    ctx.strokeText(label, 0, 8, 370);
    ctx.fillStyle = film?.accent ?? (index % 5 === 0 ? '#382d23' : '#e5dcc6'); ctx.fillText(label, 0, 8, 370);
    ctx.restore();
    ctx.font = 'bold 17px monospace'; ctx.fillStyle = '#30261e'; ctx.fillText(film ? String(film.year) : 'T-120', 48, 476);
    for (let n = 0; n < 22; n++) { ctx.fillStyle = '#1f1d1a'; ctx.fillRect(13 + n * 3, 481, random(n) > .5 ? 2 : 1, 12); }
    // Paper wear, fading, and rubbed edges, deterministic across reloads.
    for (let n = 0; n < 180; n++) { ctx.fillStyle = `rgba(235,213,178,${random(n + index) * .12})`; ctx.fillRect(random(n + 2) * 96, random(n + 7) * 512, 1 + random(n + 3) * 12, 1); }
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(0, 0, 3, 512); ctx.fillRect(93, 0, 3, 512);
  });
}
function Box({ position, size, material }: { position: [number, number, number]; size: [number, number, number]; material: THREE.Material }) {
  return <mesh position={position} material={material} castShadow receiveShadow><boxGeometry args={size} /></mesh>;
}
function Tape({ film, index, position, onSelect, stacked = false }: { film?: Film; index: number; position: [number, number, number]; onSelect: (film: Film) => void; stacked?: boolean }) {
  const map = useMemo(() => spineTexture(film, index), [film, index]);
  const [hover, setHover] = useState(false); const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.position.z = THREE.MathUtils.damp(ref.current.position.z, position[2] + (hover ? .17 : 0), 10, dt); });
  const disorderedLean = !stacked && random(index + (film ? 47 : 31)) > (film ? .72 : .58);
  const zRotation = stacked ? Math.PI / 2 : (random(index) - .5) * (film ? (disorderedLean ? .11 : .045) : (disorderedLean ? .18 : .045));
  const caseHeight = 1.12 + random(index) * (film ? .08 : .13);
  return <group ref={ref} position={position} rotation={[0, 0, zRotation]}
    onClick={film ? e => { e.stopPropagation(); onSelect(film); } : undefined}
    onPointerOver={film ? e => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; } : undefined}
    onPointerOut={() => { setHover(false); document.body.style.cursor = 'grab'; }}>
    <mesh castShadow receiveShadow><boxGeometry args={[.19, caseHeight, .66]} /><meshStandardMaterial color="#191817" roughness={.86} /></mesh>
    <mesh position={[0, 0, .333]}><planeGeometry args={[.184, 1.115]} /><meshStandardMaterial map={map} roughness={.86} emissive={hover ? '#d0a467' : '#000000'} emissiveIntensity={.12} /></mesh>
    {hover && film && <Html position={[0, .8, .4]} center><div className="hover-label">{film.title}<small>Open journal entry</small></div></Html>}
  </group>;
}
function CoverTape({ film, index, position, onSelect }: { film: Film; index: number; position: [number, number, number]; onSelect: (film: Film) => void }) {
  const map = useFilmPosterTexture(film);
  const [hover, setHover] = useState(false); const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.position.z = THREE.MathUtils.damp(ref.current.position.z, position[2] + (hover ? .17 : 0), 10, dt); });
  return <group ref={ref} position={position} rotation={[0, 0, -.045]}
    onClick={e => { e.stopPropagation(); onSelect(film); }}
    onPointerOver={e => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
    onPointerOut={() => { setHover(false); document.body.style.cursor = 'grab'; }}>
    <mesh castShadow receiveShadow><boxGeometry args={[.69, 1.12 + random(index) * .05, .14]} /><meshStandardMaterial color="#191817" roughness={.86} /></mesh>
    <mesh position={[0, 0, .073]}><planeGeometry args={[.685, 1.115]} /><meshStandardMaterial map={map} roughness={.58} emissive={hover ? '#d0a467' : '#000000'} emissiveIntensity={.1} /></mesh>
    {hover && <Html position={[0, .8, .4]} center><div className="hover-label">{film.title}<small>Open journal entry</small></div></Html>}
  </group>;
}
function ShelfBay({ entries, bay, onSelect }: { entries: Film[]; bay: number; onSelect: (film: Film) => void }) {
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: .76, color: '#ffffff' }), []);
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: '#302319', roughness: 1 }), []);
  return <group position={[-1.65 - bay * 7.25, 0, 0]}>
    <Box position={[0, 2.9, -.39]} size={[7.08, 5.8, .1]} material={dark} />
    {[-3.53, 3.53].map(x => <Box key={x} position={[x, 2.94, 0]} size={[.17, 5.88, 1]} material={wood} />)}
    {[0, 1.43, 2.86, 4.29, 5.72].map(y => <group key={y}><Box position={[0, y + .09, 0]} size={[7.2, .18, 1.02]} material={wood} /><Box position={[0, y + .09, .51]} size={[7.2, .12, .05]} material={wood} /></group>)}
    {Array.from({ length: BAY_CAPACITY }, (_, i) => {
      const row = Math.floor(i / SHELF_COLUMNS); const col = i % SHELF_COLUMNS; const film = entries[i];
      if (!film) return null;
      const caseShuffle = random(i + bay * 19) > .76;
      const shuffleX = caseShuffle ? (random(i + 41) - .5) * .045 : 0;
      const shuffleY = caseShuffle ? (random(i + 43) - .5) * .055 : 0;
      const shuffleZ = random(i) * (caseShuffle ? .06 : .035);
      return <Tape key={film.id} film={film} index={i + bay * BAY_CAPACITY} position={[-3.26 + col * .24 + shuffleX, 5.07 - row * 1.43 + shuffleY, .06 + shuffleZ]} onSelect={onSelect} />;
    })}
    {[entries[2], entries[6], entries[10]].map((film, i) => film && <CoverTape key={`cover-${film.id}`} film={film} index={i} position={[-2.25 + i * 2.15, 3.65 - (i % 2) * 1.43, .69]} onSelect={onSelect} />)}
  </group>;
}
function NormalizedModel({ path, position, width, rotation = 0 }: { path: string; position: [number, number, number]; width: number; rotation?: number }) {
  const { scene } = useGLTF(path);
  const model = useMemo(() => {
    const root = new THREE.Group(); const clone = scene.clone(true); clone.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(clone); const size = bounds.getSize(new THREE.Vector3()); const center = bounds.getCenter(new THREE.Vector3());
    const scale = width / Math.max(size.x, size.z); clone.scale.multiplyScalar(scale);
    clone.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    clone.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } }); root.add(clone); return root;
  }, [scene, width]);
  return <primitive object={model} position={position} rotation={[0, rotation, 0]} />;
}
function ReelLamp() {
  const shape = useMemo(() => {
    const s = new THREE.Shape(); s.absarc(0, 0, .77, 0, Math.PI * 2, false);
    const hub = new THREE.Path(); hub.absarc(0, 0, .19, 0, Math.PI * 2, true); s.holes.push(hub);
    for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; const h = new THREE.Path(); h.absellipse(Math.cos(a) * .48, Math.sin(a) * .48, .19, .255, 0, Math.PI * 2, true, a - Math.PI / 2); s.holes.push(h); } return s;
  }, []);
  return <group position={[4.15, 2.1, .18]}>
    <mesh position={[0, .045, 0]} castShadow><cylinderGeometry args={[.65, .69, .09, 48]} /><meshStandardMaterial color="#3b2d22" metalness={.6} roughness={.35} /></mesh>
    <mesh position={[0, .28, 0]} castShadow><cylinderGeometry args={[.04, .05, .45, 12]} /><meshStandardMaterial color="#5c4030" metalness={.7} roughness={.35} /></mesh>
    <group position={[0, 1.04, 0]}>
      {[-.06, .06].map(z => <mesh key={z} position={[0, 0, z]} castShadow><extrudeGeometry args={[shape, { depth: .045, bevelEnabled: true, bevelSize: .013, bevelThickness: .01, bevelSegments: 2, steps: 1 }]} /><meshStandardMaterial color="#a17b4c" metalness={.72} roughness={.39} /></mesh>)}
      <mesh position={[0, 0, .14]}><sphereGeometry args={[.18, 24, 24]} /><meshStandardMaterial color="#ffd080" transparent opacity={.8} emissive="#ffb34e" emissiveIntensity={2.8} /></mesh>
      {[0, 1, 2].map(i => <mesh key={i} position={[(i - 1) * .048, 0, .3]}><tubeGeometry args={[new THREE.CatmullRomCurve3([new THREE.Vector3(-.015, -.1, 0), new THREE.Vector3(.012, 0, 0), new THREE.Vector3(-.015, .1, 0)]), 12, .007, 5, false]} /><meshBasicMaterial color="#fff2b4" /></mesh>)}
      <pointLight position={[0, 0, .5]} color="#ffad54" intensity={23} distance={10} decay={2} />
      <sprite position={[0, 0, .35]} scale={[1.3, 1.3, 1]}><spriteMaterial map={useMemo(() => texture(128, 128, ctx => { const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,183,76,.5)'); g.addColorStop(.2, 'rgba(255,145,35,.13)'); g.addColorStop(1, 'rgba(255,145,35,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128); }), [])} transparent depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>
    </group>
  </group>;
}
function Television({ active, onClick }: { active: boolean; onClick: () => void }) {
  const map = useMemo(() => texture(256, 192, ctx => {
    const image = ctx.createImageData(256, 192); for (let i = 0; i < image.data.length; i += 4) { const n = 45 + random(i) * 110; image.data[i] = n * .8; image.data[i + 1] = n * .93; image.data[i + 2] = n; image.data[i + 3] = 255; } ctx.putImageData(image, 0, 0);
    ctx.fillStyle = 'rgba(220,235,240,.45)'; ctx.fillRect(0, 130, 256, 38); for (let i = 0; i < 192; i += 3) { ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(0, i, 256, 1); }
  }), []);
  const screenGeometry = useMemo(() => {
    const w = 1.89, h = 1.37, r = .17, x = -w / 2, y = -h / 2;
    const shape = new THREE.Shape(); shape.moveTo(x + r, y); shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r); shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h); shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r); shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
    const geometry = new THREE.ShapeGeometry(shape); const positions = geometry.attributes.position; const uv = geometry.attributes.uv;
    for (let i = 0; i < positions.count; i++) uv.setXY(i, (positions.getX(i) + w / 2) / w, (positions.getY(i) + h / 2) / h);
    return geometry;
  }, []);
  const screen = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => { if (screen.current) (screen.current.material as THREE.MeshStandardMaterial).emissiveIntensity = .55 + Math.sin(clock.elapsedTime * 17) * .035; });
  return <group position={[3.37, 1.03, .42]} rotation={[0, -.06, 0]} onClick={e => { e.stopPropagation(); onClick(); }} onPointerOver={() => document.body.style.cursor = 'pointer'} onPointerOut={() => document.body.style.cursor = 'grab'}>
    <RoundedBox args={[2.85, 2.04, 1.3]} radius={.1} smoothness={3} castShadow receiveShadow><meshStandardMaterial color="#574733" roughness={.6} /></RoundedBox>
    <RoundedBox args={[2.62, 1.87, .16]} position={[0, 0, .68]} radius={.14} smoothness={4} castShadow><meshStandardMaterial color="#242421" roughness={.7} /></RoundedBox>
    <RoundedBox args={[2.04, 1.53, .15]} position={[-.23, .04, .78]} radius={.2} smoothness={5}><meshStandardMaterial color="#111817" roughness={.45} /></RoundedBox>
    <mesh ref={screen} geometry={screenGeometry} position={[-.23, .04, .915]}><meshStandardMaterial map={map} emissiveMap={map} emissive="#bbd4e5" emissiveIntensity={.6} roughness={1} /></mesh>
    {[.48, .1].map(y => <mesh key={y} position={[1.02, y, .82]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.13, .13, .1, 24]} /><meshStandardMaterial color="#666052" metalness={.5} roughness={.5} /></mesh>)}
    {Array.from({ length: 14 }, (_, i) => <mesh key={i} position={[1.03, -.25 - i * .031, .785]}><boxGeometry args={[.28, .014, .014]} /><meshStandardMaterial color="#090b0b" /></mesh>)}
    <pointLight position={[-.23, 0, 1.18]} color="#a0c4df" intensity={active ? 5 : 3.3} distance={4} decay={2} />
  </group>;
}
function Cables() {
  const curves = useMemo(() => Array.from({ length: 5 }, (_, i) => new THREE.CatmullRomCurve3([
    new THREE.Vector3(.3 + i * .12, .46, .8), new THREE.Vector3(1.6, .2, 1.4 + i * .1), new THREE.Vector3(2.2 + i * .1, .07, 2.5), new THREE.Vector3(1.3 - i * .12, .06, 2.7 + i * .15), new THREE.Vector3(1, .1, 1.75), new THREE.Vector3(2.8, .16, 1.25)
  ])), []);
  return <group>{curves.map((curve, i) => <mesh key={i} castShadow><tubeGeometry args={[curve, 56, .021, 6, false]} /><meshStandardMaterial color={i === 1 ? '#a08953' : '#171918'} roughness={.9} /></mesh>)}</group>;
}
function Rug() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const transforms = useMemo(() => Array.from({ length: 18000 }, (_, i) => {
    const m = new THREE.Object3D(); m.position.set(-.1 + random(i) * 8.2, .05 + random(i + 3) * .07, 1.65 + random(i + 1) * 4.5); m.rotation.set((random(i + 7) - .5) * .7, random(i + 4) * 6, (random(i + 5) - .5) * .5); m.scale.set(.8, .7 + random(i + 6) * .6, .8); m.updateMatrix(); return m.matrix;
  }), []);
  return <instancedMesh ref={ref} args={[undefined, undefined, transforms.length]} receiveShadow castShadow onUpdate={mesh => { transforms.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, new THREE.Color().setHSL(.085, .13, .18 + random(i) * .14)); }); mesh.instanceMatrix.needsUpdate = true; }}><boxGeometry args={[.028, .16, .027]} /><meshStandardMaterial roughness={1} /></instancedMesh>;
}
function Plush() {
  const parts: [number, number, number, number, number, number][] = [[0, .35, 0, .26, .4, .18], [0, .82, 0, .32, .22, .2], [-.32, .75, 0, .17, .12, .16], [.32, .75, 0, .17, .12, .16], [-.25, .27, .03, .07, .3, .08], [.25, .27, .03, .07, .3, .08], [-.13, .05, .12, .14, .08, .22], [.13, .05, .12, .14, .08, .22]];
  return <group position={[2.72, 2.08, .46]}>{parts.map((v, i) => <mesh key={i} position={v.slice(0, 3) as [number, number, number]} scale={v.slice(3) as [number, number, number]} castShadow><sphereGeometry args={[1, 24, 16]} /><meshStandardMaterial color="#aa8053" roughness={1} /></mesh>)}{[-.18, .18].map(x => <group key={x} position={[x, .82, .175]}><mesh><sphereGeometry args={[.07, 16, 12]} /><meshStandardMaterial color="#a79872" /></mesh><mesh position={[0, 0, .045]}><sphereGeometry args={[.033, 16, 12]} /><meshStandardMaterial color="#111714" roughness={.2} /></mesh></group>)}</group>;
}
function Gremlin() {
  return <group position={[1.05, 3.02, .52]} scale={.75}>
    <mesh position={[0, .31, 0]} scale={[.22, .31, .14]} castShadow><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color="#674633" roughness={1} /></mesh>
    <mesh position={[0, .65, 0]} scale={[.3, .23, .18]} castShadow><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color="#ab8f68" roughness={1} /></mesh>
    {[-1, 1].map(sign => <group key={sign}>
      <mesh position={[sign * .39, .7, 0]} rotation={[0, 0, sign * -.4]} scale={[.23, .12, .05]} castShadow><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color="#906047" /></mesh>
      <mesh position={[sign * .13, .68, .16]}><sphereGeometry args={[.07, 16, 12]} /><meshStandardMaterial color="#141511" roughness={.25} /></mesh>
      <mesh position={[sign * .16, .04, .08]} scale={[.13, .065, .13]} castShadow><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color="#674633" /></mesh>
    </group>)}
  </group>;
}
function WallPoster({ film, position }: { film: Film; position: [number, number, number] }) {
  const map = useFilmPosterTexture(film);
  const w = 1.02, h = 1.53;
  return <group position={position}>
    <mesh position={[0, 0, -.045]} castShadow receiveShadow><boxGeometry args={[w + .1, h + .1, .05]} /><meshStandardMaterial color="#1a1410" roughness={.85} /></mesh>
    <mesh position={[0, 0, -.015]}><boxGeometry args={[w + .03, h + .03, .01]} /><meshStandardMaterial color="#cbb78a" metalness={.3} roughness={.5} /></mesh>
    <mesh castShadow><planeGeometry args={[w, h]} /><meshStandardMaterial map={map} roughness={.5} side={THREE.DoubleSide} /></mesh>
  </group>;
}
export default function ReferenceRoom({ films, onSelect, active, onPlayer, onCatalog, onTickets }: { films: Film[]; onSelect: (film: Film) => void; active: boolean; onPlayer: () => void; onCatalog: () => void; onTickets: () => void }) {
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: .85 }), []);
  const wall = useMemo(() => new THREE.MeshStandardMaterial({ color: '#645044', roughness: 1 }), []);
  const black = useMemo(() => new THREE.MeshStandardMaterial({ color: '#393934', roughness: .65 }), []);
  const bays = Math.max(1, Math.ceil(films.length / BAY_CAPACITY));
  const wallFilms = useMemo(() => {
    const avgRating = (film: Film) => film.viewings.length === 0 ? 0 : film.viewings.reduce((sum, v) => sum + v.rating, 0) / film.viewings.length;
    return [...films].sort((a, b) => (a.favoriteRank ?? 999) - (b.favoriteRank ?? 999) || avgRating(b) - avgRating(a)).slice(0, 4);
  }, [films]);
  return <group>
    <Box position={[0, 4, -1.05]} size={[40, 10, .18]} material={wall} />
    <Box position={[-5.7 - (bays - 1) * 7.25, 4, 3]} size={[.18, 10, 8]} material={wall} />
    {Array.from({ length: 27 + (bays - 1) * 11 }, (_, i) => <Box key={i} position={[-8 - (bays - 1) * 7.7 + i * .7, -.07, 3]} size={[.684, .1, 18]} material={wood} />)}
    {Array.from({ length: bays }, (_, bay) => <ShelfBay key={bay} entries={films.slice(bay * BAY_CAPACITY, (bay + 1) * BAY_CAPACITY)} bay={bay} onSelect={onSelect} />)}
    {wallFilms.map((film, i) => <WallPoster key={film.id} film={film} position={[3.8 + i * 1.35, 5.3 + (i % 2) * .15, -.85]} />)}
    <JournalFurniture bays={bays} filmCount={films.length} ticketCount={films.reduce((n, film) => n + film.viewings.length, 0)} onCatalog={onCatalog} onTickets={onTickets} />
    <ChessTable />
    <Television active={active} onClick={onPlayer} /><ReelLamp /><Plush /><Rug /><Cables />
    <NormalizedModel path="/models/delorean.glb" width={1.07} position={[2.53, 2.1, 1]} rotation={-.2} />
    <Gremlin />
    <NormalizedModel path="/models/popcorn-box.glb" width={.5} position={[.7, 2.96, .16]} />
    <Box position={[.85, .42, .23]} size={[1.65, .36, .75]} material={black} />
    <Box position={[.85, .43, .62]} size={[1.45, .06, .03]} material={black} />
    <mesh position={[1.3, .48, .642]}><planeGeometry args={[.25, .09]} /><meshBasicMaterial color="#689b85" /></mesh>
    <Box position={[.85, .2, .25]} size={[1.7, .15, .8]} material={black} />
  </group>;
}
