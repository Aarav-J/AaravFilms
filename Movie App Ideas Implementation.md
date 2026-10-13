# Aarav's Films — Technical Implementation

## Architecture recommendation
- **App:** Next.js (App Router), React, TypeScript.
- **Styling:** Tailwind CSS and CSS variables/design tokens.
- **3D:** Three.js via React Three Fiber and Drei; selectively use GLB assets made in Blender later, not for the first prototype.
- **Motion:** React Spring for Three objects; CSS/Motion for HTML overlays. Avoid overlapping animation ownership.
- **Persistence:** local editable JSON/fixture data first. Supabase Postgres, Storage, and Auth can come later only if owner editing/publishing becomes worth it.
- **Film metadata:** local JSON first; Letterboxd import/linking is a later integration. TMDB can be deferred until real metadata/image automation is needed.
- **Editor:** Markdown first; consider Tiptap only when richer review layouts are needed.
- **Testing:** Vitest + React Testing Library for logic/UI, Playwright for end-to-end flows.

## Architectural principle
Keep film, viewing, review, and shelf data independent of the 3D scene. React UI owns dialogs, forms, menus, and accessible reading surfaces; the 3D scene owns shelf/case/disc visual presentation. Both use one shared interaction state machine.

## Suggested structure
```text
data/
  films.json                  # hand-editable temporary source of truth
src/
  app/
    page.tsx
    film/[slug]/page.tsx      # direct-link and accessible fallback
  components/
    scene/LibraryScene.tsx
    scene/ShelfWall.tsx
    scene/DvdSpine.tsx
    scene/DvdCase.tsx
    scene/Disc.tsx
    scene/DvdPlayer.tsx
    ui/CaseDetails.tsx
    ui/ViewTicket.tsx
    ui/InsertDiscDialog.tsx
    ui/DvdMenu.tsx
    ui/ReviewReader.tsx
    ui/CardCatalog.tsx
    ui/TicketBox.tsx
  lib/
    models.ts
    repository.ts             # reads/parses data/films.json for v1
    scene-state.ts
    ratings.ts
  styles/
```

## Data model
Keep a stable internal UUID for each entity; do not use the external metadata ID as the primary key.

### films
- `id uuid primary key`
- `slug text unique not null`
- `tmdb_id integer unique null`
- `title text not null`, `release_year integer`, `director text`
- `overall_rating numeric(3,1) null`, `synopsis text null`, `poster_url text null`, `cover_url text null`
- `genres text[]`, `created_at timestamptz`

### viewings
- `id uuid primary key`
- `film_id uuid references films(id)`
- `watched_at date null`, `location_label text null`, `format text null` (cinema/home/etc.)
- `rating numeric(3,1) null` for per-watch rating (choose and enforce a 0–5 scale)
- `memory_note text null`, `visibility text not null default 'private'` for future-proofing, even if privacy is not part of v1
- `created_at timestamptz`

### people and viewing_people
- `people`: `id uuid`, `display_name text`, `is_public boolean default false`
- `viewing_people`: `viewing_id uuid`, `person_id uuid` with composite primary key
- Only return public names on public routes when viewing visibility and person permissions allow.

### reviews
- `id uuid primary key`, `film_id uuid references films(id)`
- `title text null`, `body jsonb` (structured editor document) or `body_markdown text` for MVP
- `published boolean default false`, `created_at`, `updated_at`
- Optional later: `review_sections` for favorite moments and afterthoughts.

### shelf_slots
- `id uuid primary key`, `film_id uuid unique references films(id)`
- `section_key text`, `shelf_index integer`, `slot_index integer`
- `spine_color text null`, `edition_style text null`
- Unique constraint on (`section_key`, `shelf_index`, `slot_index`).

## Interaction state machine
Use an explicit discriminated union or XState, not unrelated booleans.

```ts
type JournalState =
  | { kind: 'browsing' }
  | { kind: 'case-opening'; filmId: string }
  | { kind: 'case-open'; filmId: string }
  | { kind: 'insert-prompt'; filmId: string }
  | { kind: 'inserting'; filmId: string }
  | { kind: 'dvd-menu'; filmId: string }
  | { kind: 'reading'; filmId: string; section: 'review' | 'moments' | 'afterthoughts' };
```

Transitions:
- `SELECT_FILM` → case-opening → case-open (on animation complete)
- `CLICK_DISC` → insert-prompt
- `CANCEL` → case-open
- `CONFIRM_INSERT` → inserting → dvd-menu
- `OPEN_REVIEW` → reading
- `BACK` from reading → dvd-menu; `EJECT` → case-open; `CLOSE_CASE` → browsing
- Animation-completion events should be guarded against stale film selections.

## 3D approach
1. Prototype the wall using simple boxes, planes, and procedural textures; no Blender dependency initially.
2. Use repeated/instanced geometry for many shelf spines and only mount a detailed interactive case for the selected film.
3. Store film-to-slot mapping in data; convert shelf/slot indices to scene positions.
4. On selection, animate the spine/case toward a stable foreground inspection pose.
5. Open the selected case via a hinge pivot; keep metadata as an accessible HTML panel aligned with or beside the case.
6. The disc is a clickable mesh with a focusable DOM counterpart; selecting it opens a real accessible dialog.
7. On confirmation, animate a short disc insertion; crossfade or camera-shift to the TV. The actual DVD menu and review are HTML for readability.
8. Limit device pixel ratio, compress textures, lazy-load high-detail assets, and avoid unnecessary dynamic shadows.

## Dialog specification
Title: **Insert this disc?**
Body: **Insert the disc into the DVD player to read my review and thoughts.**
Actions: **Cancel**, **Insert Disc**.
- Modal traps focus; Escape cancels; on close restore focus to the disc trigger.
- Confirmation triggers the insertion state; no dragging required.
- Reduced-motion mode uses a quick crossfade rather than a long animated trajectory.

## Card catalog and ticket box
- Card catalog opens an HTML drawer styled as a vintage index cabinet; first iteration supports text search over title and director.
- Selecting a result scrolls/pans to its shelf slot, highlights it, then allows case opening.
- Ticket box lists viewings newest-first; selecting a ticket opens the associated case and selects that viewing record.
- Later filters: person, year watched, location, rating, genre, director.
- Treat search/filter state as URL parameters when useful for shareable links.

## Public/private content security
- Not a first-build priority because this is personal-use first.
- Still keep visibility fields in the data model so public/private rules can be added later without reshaping records.
- If Supabase/public routes are added later, never rely on client-side filtering to hide private names or locations; filter in server queries/RLS.
- Do not expose service-role credentials or metadata API secrets in the client.

## Responsive and fallback strategy
- Desktop: immersive shelf scene with HTML overlays.
- Tablet: simplified shelf and reduced camera motion.
- Mobile/low-power: 2D shelf or poster list, same case metadata, dialog, DVD menu, and reader.
- Deep links (`/film/[slug]`) must work without first visiting the shelf wall.
- Provide a non-WebGL fallback when canvas initialization fails.

## Milestone breakdown

### M0 — Foundation
- [ ] Initialize Next.js, TypeScript, Tailwind, linting and formatting.
- [ ] Define design tokens (wood, brass, cream, amber), typography, and responsive breakpoints.
- [ ] Create typed fixtures backed by an easy-to-edit JSON file for 10–20 films, 1–3 viewings each, and sample Markdown reviews.
- [ ] Define interaction state machine and unit tests.

**Done when:** fixtures render in a simple searchable list and all state transitions are testable.

### M1 — Shelf wall
- [ ] Render 3–4 shelves with procedural DVD spines and readable labels on focus/hover.
- [ ] Add pan/scroll and camera bounds.
- [ ] Select a film with mouse and keyboard.
- [ ] Preserve selected shelf position when returning.

**Done when:** every sample film is selectable and discoverable without knowing its location.

### M2 — Case and metadata
- [ ] Create reusable DVD case model with hinged cover and disc.
- [ ] Animate pull-out and opening.
- [ ] Display film info and multiple viewing tickets.
- [ ] Add close/back behavior and mobile case fallback.

**Done when:** selecting a film reliably reveals its viewing metadata.

### M3 — Disc and review (core vertical slice)
- [ ] Make disc clickable and keyboard operable.
- [ ] Implement accessible Insert Disc dialog.
- [ ] Animate confirmation to DVD player/TV state.
- [ ] Build DVD menu and full-screen readable review.
- [ ] Implement back/eject/return-to-shelf flow.
- [ ] Support reduced-motion and animation skipping.

**Done when:** a first-time visitor completes the full shelf → case → disc → review → shelf journey.

### M4 — Discovery objects
- [ ] Implement card catalog search and jump-to-film.
- [ ] Implement ticket box chronological list and view-to-film linking.
- [ ] Add optional person/date filters with public-visibility rules.

**Done when:** both objects provide genuinely useful alternative navigation.

### M5 — Real data and imports
- [ ] Keep the repo JSON data path easy to edit by hand; it remains the source of truth until browser editing is truly needed.
- [ ] Add a local Letterboxd importer before any database work. Input should be the Letterboxd export ZIP/CSVs; output should be a reviewed `data/films.json` patch, not an automatic production write.
- [ ] Map Letterboxd diary rows to `viewings` first: film title/year, watched date, rating, rewatch flag if present, tags, notes/review text, and Letterboxd URI. Preserve unmatched rows in an import report for manual cleanup.
- [ ] Merge Letterboxd ratings/reviews into existing film records by stable internal slug plus title/year confirmation. Never use Letterboxd or TMDB IDs as primary keys.
- [ ] Add TMDB lookup only after local data feels worth enriching. Use TMDB for candidate matching, release year/director/poster/backdrop metadata, and store `tmdb_id` as an external reference.
- [ ] Put TMDB API access behind a server-side adapter with caching, attribution text/logo support, and image-source metadata. Do not expose API credentials in client bundles.
- [ ] Add Supabase schema, migrations, RLS, and protected owner CRUD only if editing in the browser becomes worth the operational cost.

**Done when:** Aarav can import a Letterboxd export, review a diff/report, optionally enrich matched films from TMDB, and update films, viewing tickets, and reviews without fighting the codebase.

### M6 — Polish and launch
- [ ] Add textures, lighting, tasteful ambient details, and optional audio only if desired later.
- [ ] Profile performance on desktop and mobile; set asset budgets.
- [ ] Add tests for keyboard, dialog, navigation, reduced motion, and deep links.
- [ ] Add empty/loading/error states, SEO metadata, and deployment monitoring.

**Done when:** the core experience works smoothly and accessibly across supported devices.

## Testing scenarios
1. Open a film, inspect two distinct viewing dates, close, and reopen without losing position.
2. Click disc → Cancel → still in case; click again → Insert → DVD menu.
3. Read review → Back → Eject → Close case → shelf.
4. Search via card catalog → locate correct film even on upper shelf.
5. Open a ticket from ticket box → correct film and viewing selected.
6. Verify private viewing names/locations never appear in public API responses.
7. Complete all key flows with keyboard only and reduced motion enabled.
8. Load directly into `/film/[slug]` on mobile or without WebGL.

## First development sprint (recommended order)
1. Build a static, visually convincing shelf wall with fixture data.
2. Make a single DVD case animate outward and open.
3. Overlay a ticket-style metadata panel with multiple viewings.
4. Add disc click → Insert Disc dialog → simple TV/review screen.
5. Generalize the same flow to all fixture films.
6. Only then add catalog/ticket objects, persistence, and richer 3D assets.

## Open decisions (non-blocking)
- Final exact name/logo beyond the working **Aarav's Films** direction.
- Exact art direction for TV screen and disc menus.
- How to visually balance per-watch ratings on tickets with an optional overall rating on the disc.
- Whether review content stays Markdown long-term or moves to structured blocks.
