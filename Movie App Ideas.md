# Aarav's Films — Product Plan

## Vision
A personal cinema journal experienced as a cozy, vintage DVD library. Aarav can explore a wall of wooden shelves, pull out a film case, inspect memories of watching it, and click the disc to be prompted to insert it into a DVD player. The player then presents the review and reflections.

**Core principle:** The case represents the film, tickets represent individual viewings, and the disc unlocks the review. Make the physical metaphor delightful without making navigation tedious.

## Experience pillars
1. **Tactile discovery:** shelf spines, subtle depth, physical case interactions.
2. **Personal memory:** dates, companions, places, ratings, and notes for each viewing.
3. **Intentional ritual:** click disc → 'Insert in DVD player?' prompt → play animation → review.
4. **Comfortable reading:** a cinematic DVD menu that transitions to readable full-screen editorial content.
5. **Accessible exploration:** keyboard, reduced motion, mobile fallback, and quick navigation.

## Visual direction
- Cozy vintage study, dark walnut shelves, brass ladder rail, warm amber lighting, cream paper, worn DVD cases.
- Subtle imperfections: gaps between cases, occasional stacked DVDs, handwritten labels, ticket stubs.
- Typography: expressive editorial serif headings paired with legible sans-serif UI and optional monospace catalog labels.
- Motion: responsive and restrained; never make the user wait through long sequences.
- Avoid an entire first-person game: a front-facing shelf with selective 3D depth and camera movement.

## Current product decisions
- Working name: **Aarav's Films** or similar; final branding can stay loose for now.
- Audience: personal-use first. Do not overbuild multi-user, public publishing, or privacy tooling in the first version.
- Data source: temporary editable repo data first in `data/films.json`. Letterboxd import/linking can come later.
- Review format: Markdown first.
- Visual style: stylized cozy realism, not photoreal and not a first-person game.
- Motion: normal but quick; reduced-motion should use crossfades or skips.
- DVD menu: only show real available sections for now.
- No admin editor, TMDB integration, real poster-art pipeline, or sound in the first build.
- Platform priority: desktop/laptop first, with mobile fallback handled later enough to avoid breakage.

## Primary user journey
1. Arrive facing a shelf wall; see a short, dismissible navigation hint.
2. Explore shelves by scroll/pan, hover/focus on cases, or search using card catalog.
3. Select a case; it slides out and opens.
4. Inspect film identity and viewing records: dates watched, personal rating(s), companions, locations, short memory notes. Multiple viewings are separate tickets.
5. Click the disc. Show dialog: **'Insert this disc into the DVD player?'** Buttons: **Cancel** / **Insert Disc**.
6. On confirmation, animate a brief disc-to-player transition; DVD player/TV presents a film-specific menu.
7. Choose **Read Review** (plus optional Favorite Moments / Afterthoughts); display readable content.
8. Close review or eject disc to return to the case/shelf, preserving navigation position.

## Information architecture
- **Shelf wall (home):** primary film browsing interface.
- **DVD case:** film metadata, artwork, viewing-ticket stack, disc interaction.
- **DVD player / TV:** gateway to reviews and optional extras.
- **Ticket box:** chronological index of individual watch sessions, searchable/filterable by date, location, companion, film.
- **Card catalog:** film index and filters (title, director, year, genre, rating, person); selecting a card locates the film on the wall.
- **Editable data file:** simple owner-maintained JSON/fixtures for films, viewings, reviews, shelf positions, and assets; richer tools can come later.

## Interaction rules
- **DVD case:** one per film, regardless of rewatches.
- **Viewing ticket:** one per viewing; a film can have multiple tickets.
- **Rating:** optionally per viewing; optional overall film rating can be separately maintained or derived.
- **Disc:** one per film; clicking it opens the insert confirmation dialog, not a drag requirement.
- **Playback:** simulated journal experience, not actual movie streaming.
- **Close/Back:** always available. Escape closes current overlay; keyboard focus returns to origin.
- **Search:** fast alternative to physical exploration, not hidden behind a mandatory animation.

## MVP scope (vertical slice)
- One attractive shelf wall with 10–20 sample films and working spine selection.
- Reusable case that slides out and opens.
- Film identity and one-to-many viewing ticket metadata inside the case.
- Clickable disc + insert confirmation popup.
- Short disc insertion / TV activation transition.
- DVD menu + one polished, readable review template.
- Basic card catalog search (title/director) and ticket box chronological view.
- Responsive fallback and reduced-motion support.
- Editable repo data file for films, viewings, reviews, and shelf positions.

## Phase 2
- Movable rolling ladder and shelf camera navigation.
- Richer card catalog drawers/filters and ticket search by people/location.
- Personalized disc labels, special editions, favorite shelves.
- Rich-text review editor with images and annotations.
- Case and ticket details polished with microinteractions.

## Phase 3
- Desk objects, lighting toggle, room personalization, and optional ambient sound only if it becomes desirable later.
- Animated recently watched stack and physically placing a new DVD.
- Rewatch timelines and cross-film connections.
- Seasonal details and optional custom review layouts.

## UX / accessibility requirements
- Mouse, touch, and keyboard equivalents for every core action.
- Focus-visible states, dialog semantics, Escape to close, screen-reader labels.
- Honor `prefers-reduced-motion`; offer skip/quick-play on long transitions.
- On mobile use a scrollable 2D shelf/contact-sheet view with case and review overlays.
- Provide high-contrast readable review mode; do not force reading on a tiny 3D TV.
- Do not build sound in v1; if added later, never autoplay and keep mute persistent.

## Privacy and content considerations
- Privacy is not a first-build concern because this is personal-use first.
- Still keep companions' names and viewing locations optional in the data so privacy controls can be added later without reshaping content.
- Avoid hosting or streaming copyrighted films; the DVD player is an interaction metaphor.
- Use licensed/allowed poster and film imagery if real art is added later.

## Decisions to defer
- Final exact name/logo and typography.
- How the disc/ticket layout should present per-watch ratings versus overall film rating; decide after seeing the UI.
- Whether reviews eventually include media/interactive sections beyond Markdown.
- Shelf taxonomy and ordering, which can be changed without changing data schema.

## Success criteria
Aarav can find a film, inspect a viewing ticket, click its disc, confirm insertion, and read a review in under a minute without instructions. The experience remains usable on desktop first, with mobile, keyboard, and reduced-motion paths not broken.
