'use client';

import { useEffect } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { Film } from '@/data/films';

export function useFilmPosterTexture(film: Pick<Film, 'poster'>) {
  const texture = useTexture(film.poster);

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [texture]);

  return texture;
}
