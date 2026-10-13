"use client";

import { Html, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

// Fixed-size journal furniture: the film list lives in the existing searchable
// panels, not one mesh per card or viewing. Shelf growth stays independent.
function paperLabel(title: string, detail: string, color = "#e6d7b6") {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color; ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = "#8d7453"; ctx.lineWidth = 3; ctx.strokeRect(10, 10, 492, 140);
  ctx.textAlign = "center"; ctx.fillStyle = "#37291e";
  ctx.font = "bold 36px Georgia"; ctx.fillText(title, 256, 68);
  ctx.font = "22px monospace"; ctx.fillText(detail, 256, 112);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}
function Block({at, size, color = "#705039"}: {at: [number, number, number]; size: [number, number, number]; color?: string}) {
  return <mesh position={at} castShadow receiveShadow><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={.8}/></mesh>;
}
function Label({map, at, size}: {map: THREE.Texture; at: [number, number, number]; size: [number, number]}) {
  return <mesh position={at}><planeGeometry args={size}/><meshStandardMaterial map={map} roughness={.9}/></mesh>;
}
export default function JournalFurniture({filmCount, ticketCount, bays, onCatalog, onTickets}: {
  filmCount: number; ticketCount: number; bays: number; onCatalog: () => void; onTickets: () => void;
}) {
  const [hover, setHover] = useState<"catalog" | "tickets" | null>(null);
  const drawer = useRef<THREE.Group>(null);
  const maps = useMemo(() => ({
    catalog: paperLabel("CARD CATALOG", `${filmCount} FILMS / A-Z`),
    tickets: paperLabel("TICKET BOX", `${ticketCount} VIEWING MEMORIES`, "#d7b77e"),
    ranges: ["A - F", "G - L", "M - R", "S - Z"].map(range => paperLabel(range, "FILM JOURNAL")),
    ticket: paperLabel("ADMIT ONE", "AARAV'S FILMS", "#d3a079"),
  }), [filmCount, ticketCount]);
  useEffect(() => () => Object.values(maps).flat().forEach(map => map.dispose()), [maps]);
  useFrame((_, dt) => {
    if (drawer.current) drawer.current.position.z = THREE.MathUtils.damp(drawer.current.position.z, hover === "catalog" ? .2 : 0, 9, dt);
  });
  const enter = (which: "catalog" | "tickets") => { setHover(which); document.body.style.cursor = "pointer"; };
  const leave = () => { setHover(null); document.body.style.cursor = "grab"; };
  // Back against the side wall, beyond the shelf depth. Front faces into the room.
  return <group position={[-5.02 - (bays - 1) * 7.25, 0, 3.10]} rotation={[0, Math.PI / 2, 0]}>
    <pointLight position={[1.7, 3.5, .4]} color="#e5bf88" intensity={10} distance={5} decay={2} />
    <group onClick={e => {e.stopPropagation(); onCatalog();}} onPointerOver={e => {e.stopPropagation(); enter("catalog");}} onPointerOut={leave}>
      {/* Walnut card cabinet, eight separate drawers, brass pulls and labels. */}
      <RoundedBox args={[1.72, 2.05, 1.05]} position={[0, 1.19, 0]} radius={.025} smoothness={2} castShadow receiveShadow><meshStandardMaterial color="#66472e" roughness={.78}/></RoundedBox>
      <Block at={[0, 2.25, 0]} size={[1.86, .13, 1.18]} color="#866044"/>
      <Block at={[0, .22, 0]} size={[1.8, .14, 1.12]} color="#4f3828"/>
      {[-.66, .66].flatMap(x => [-.35, .35].map(z => <Block key={`${x}-${z}`} at={[x, .09, z]} size={[.14, .18, .14]} color="#4f3828"/>))}
      {[0,1,2,3].flatMap(row => [-1,1].map(side => <group key={`${row}-${side}`} position={[side * .415, 1.84 - row * .43, .54]}>
        <group ref={row === 0 && side === -1 ? drawer : undefined}>
          <Block at={[0,0,-.04]} size={[.77,.39,.14]} color={row % 2 ? "#815a3b" : "#916646"}/>
          <Block at={[0,.037,.043]} size={[.46,.16,.025]} color="#aa8953"/>
          <Label map={maps.ranges[row]} at={[0,.037,.06]} size={[.41,.12]}/>
          <mesh position={[0,-.106,.10]} rotation={[0,0,Math.PI]}><torusGeometry args={[.07,.012,6,16,Math.PI]}/><meshStandardMaterial color="#b79458" metalness={.75} roughness={.35}/></mesh>
        </group>
      </group>))}
      <Block at={[0, 2.08, .602]} size={[1.35,.17,.022]} color="#b7955a"/>
      <Label map={maps.catalog} at={[0, 2.08, .617]} size={[1.29,.145]}/>
      <Html position={[0,.43,.75]} center distanceFactor={11} zIndexRange={[8,0]}>
        <button className={`room-object-action ${hover === "catalog" ? "is-hovered" : ""}`} onClick={onCatalog} aria-label="Open card catalog">Card catalog <span>Browse films</span></button>
      </Html>
    </group>
    {/* Open red-brown ticket chest on the cabinet. Not a floating HUD prop. */}
    <group position={[.13,2.34,.04]} rotation={[0,-.11,0]} onClick={e => {e.stopPropagation(); onTickets();}} onPointerOver={e => {e.stopPropagation(); enter("tickets");}} onPointerOut={leave}>
      <Block at={[0,.035,0]} size={[1.16,.07,.72]} color="#59302b"/>
      <Block at={[0,.19,-.34]} size={[1.16,.34,.045]} color="#814438"/>
      <Block at={[0,.16,.34]} size={[1.16,.26,.045]} color="#934f3f"/>
      {[-.56,.56].map(x => <Block key={x} at={[x,.19,0]} size={[.045,.34,.72]} color="#814438"/>)}
      <group position={[0,.36,-.34]} rotation={[-.38,0,0]}>
        <Block at={[0,.30,0]} size={[1.2,.6,.065]} color="#784034"/>
        <Block at={[0,.30,.038]} size={[1.05,.46,.018]} color="#bda171"/>
        <Label map={maps.tickets} at={[0,.30,.052]} size={[.99,.32]}/>
      </group>
      {Array.from({length:9}, (_, i) => <group key={i} position={[-.32 + (i%3)*.3,.21+(i%2)*.04,-.22+i*.054]} rotation={[-.13+(i%3)*.12,0,(i%2 ? -.08 : .06)]}>
        <Block at={[0,0,0]} size={[.32,.27,.014]} color={i%2 ? "#dfc895" : "#ceaa86"}/>
        <Label map={maps.ticket} at={[0,0,.009]} size={[.3,.24]}/>
      </group>)}
      <Block at={[0,.13,.374]} size={[.11,.12,.027]} color="#b7955a"/>
      <Html position={[0,.86,.15]} center distanceFactor={11} zIndexRange={[8,0]}>
        <button className={`room-object-action ${hover === "tickets" ? "is-hovered" : ""}`} onClick={onTickets} aria-label="Open ticket box">Ticket box <span>Viewing memories</span></button>
      </Html>
    </group>
  </group>;
}
