'use client';

import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { Film } from '@/data/films';

function placeholderTexture(src: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 384;
  const ctx = canvas.getContext('2d')!;

  const hue = [...src].reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 0) % 360;
  const gradient = ctx.createLinearGradient(0, 0, 256, 384);
  gradient.addColorStop(0, `hsl(${hue} 34% 24%)`);
  gradient.addColorStop(0.58, `hsl(${(hue + 24) % 360} 30% 15%)`);
  gradient.addColorStop(1, '#120b08');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 384);

  ctx.fillStyle = 'rgba(244, 214, 169, 0.18)';
  ctx.fillRect(22, 22, 212, 340);
  ctx.strokeStyle = 'rgba(244, 214, 169, 0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 28, 200, 328);
  ctx.fillStyle = 'rgba(255, 236, 204, 0.7)';
  ctx.font = '700 18px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '2px';
  ctx.fillText('POSTER', 128, 182);
  ctx.font = '700 12px Arial, sans-serif';
  ctx.fillText('LOADING', 128, 206);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function useFilmPosterTexture(film: Pick<Film, 'poster'>) {
  const fallback = useMemo(() => placeholderTexture(film.poster), [film.poster]);
  const [texture, setTexture] = useState<THREE.Texture>(fallback);

  useEffect(() => {
    let cancelled = false;
    setTexture(fallback);

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      film.poster,
      (loaded) => {
        if (cancelled) {
          loaded.dispose();
          return;
        }
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.anisotropy = 8;
        loaded.needsUpdate = true;
        setTexture(loaded);
      },
      undefined,
      () => {
        // Keep the generated placeholder on broken/missing poster URLs.
      },
    );

    return () => {
      cancelled = true;
    };
  }, [fallback, film.poster]);

  return texture;
}
