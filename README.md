# Aarav's Films

A personal film journal inside a warm, VHS-filled screening room. Next.js, React Three Fiber and Three.js.

## Run locally

```sh
npm ci
npm run dev
# http://localhost:3000
```

```sh
npm run typecheck
npm run build
```

## Add your movies

Edit `src/data/films.ts`. Every object in `films` is one journal entry and gets one labeled spine. `viewings` holds the dates, ratings, people, places and memories for repeat watches. The existing sample data is unchanged, not a claim about your actual viewing history.

The room grows automatically: 28 columns x 4 rows = 112 entries per bay. More movies add another bay to the left, and the camera pulls back. The unlabeled archival/blank sleeves are decorative, not clickable duplicates of your movies. A few entries are also displayed cover-forward as highlights. Catalog search is the easiest way to find a movie in a large collection.

## Scene editing

- `src/components/ReferenceRoom.tsx`: shelves, tape textures, CRT static, film-reel lamp, plush figures, cables, rug, posters and prop placement.
- `src/components/FilmRoom.tsx`: camera, lighting and journal interactions (catalog, tickets, case inspection, disc playback and reviews).
- `src/app/globals.css`: overlay and mobile layout.

The scene uses a close, slightly off-center camera, a localized tungsten lamp, subdued fill, and cool CRT light instead of the previous uniform orange flood lighting. The rug is one instanced draw call for 18,000 fibers. The case-inspection preview is now procedural too, fixing the original imported case clipping on small screens. Shelf wood, sleeves, graphic cover art, CRT noise and glow are generated locally; no remote texture service or additional account is needed.

The film-reel lamp, CRT, shelves, VHS sleeves, plush figures, cables and graphic poster art are original procedural geometry/textures. The two DeLorean miniatures and popcorn use models already included in this repository. No new third-party models were downloaded. Existing asset licenses should still be checked before public/commercial reuse; this update does not establish rights to existing fan models. Poster graphics are stylized original placeholder sleeves, not actual movie posters.

## Current limits

This is an art-direction and room implementation pass, not a photorealistic scan of the reference. Figures remain stylized; actual poster art and higher-quality licensed character models are good next steps. The journal remains source-data-driven, with no persistence/editor backend added. Very large collections can use the searchable catalog; test device performance before loading thousands of entries at once.
