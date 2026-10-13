import { gunzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { films as seedFilms, type Film, type LetterboxdEntry, type TmdbFilmData, type Viewing } from '@/data/films';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/';
const LETTERBOXD_EXPORT_DIR = 'letterboxd_export';
const PLACEHOLDER_POSTER = '/posters/letterboxd-placeholder.svg';

type SourceState = 'configured' | 'missing-config' | 'error';

export type FilmsApiResponse = {
  films: Film[];
  sources: {
    tmdb: { state: SourceState; message?: string };
    letterboxd: { state: SourceState; username: string | null; message?: string };
    export: { state: SourceState; rows: number; films: number; message?: string };
  };
};

type CsvRow = Record<string, string>;
type FavoriteExportEntry = { rank: number; title: string; year: number; link: string; listDate: string };


type TmdbMovieResponse = {
  id: number;
  overview?: string;
  tagline?: string;
  runtime?: number | null;
  vote_average?: number | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  homepage?: string | null;
  genres?: { name: string }[];
  credits?: { crew?: { job?: string; name?: string }[] };
};

type TmdbSearchResponse = { results?: { id: number; title?: string; release_date?: string; popularity?: number }[] };

type ExportBuild = {
  films: Film[];
  entriesById: Record<string, LetterboxdEntry[]>;
  rows: number;
};

function tmdbImage(pathname: string | null | undefined, size: 'w500' | 'w780' | 'w1280') {
  return pathname ? `${TMDB_IMAGE_BASE}${size}${pathname}` : null;
}

function tmdbCredentials() {
  const bearer = process.env.TMDB_READ_ACCESS_TOKEN ?? process.env.TMDB_ACCESS_TOKEN;
  const apiKey = process.env.TMDB_API_KEY;
  return { bearer, apiKey };
}

function tmdbHeaders(): HeadersInit {
  const { bearer } = tmdbCredentials();
  return bearer ? { Authorization: `Bearer ${bearer}`, accept: 'application/json' } : { accept: 'application/json' };
}

function withApiKey(url: URL) {
  const { bearer, apiKey } = tmdbCredentials();
  if (!bearer && apiKey) url.searchParams.set('api_key', apiKey);
}

function hasTmdbCredentials() {
  const { bearer, apiKey } = tmdbCredentials();
  return Boolean(bearer || apiKey);
}

async function fetchTmdbFilmById(tmdbId: number): Promise<TmdbFilmData> {
  const url = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`);
  url.searchParams.set('language', 'en-US');
  url.searchParams.set('append_to_response', 'credits');
  withApiKey(url);

  const response = await fetch(url, { headers: tmdbHeaders(), next: { revalidate: 60 * 60 * 24 } });
  if (!response.ok) throw new Error(`TMDB ${tmdbId}: ${response.status} ${response.statusText}`);

  const movie = await response.json() as TmdbMovieResponse;
  const director = movie.credits?.crew?.find((person) => person.job === 'Director')?.name ?? null;
  return {
    id: movie.id,
    overview: movie.overview ?? '',
    tagline: movie.tagline ?? '',
    runtime: movie.runtime ?? null,
    voteAverage: typeof movie.vote_average === 'number' ? movie.vote_average : null,
    posterUrl: tmdbImage(movie.poster_path, 'w500'),
    backdropUrl: tmdbImage(movie.backdrop_path, 'w1280'),
    homepage: movie.homepage || null,
    genres: movie.genres?.map((genre) => genre.name) ?? [],
    director
  };
}

async function searchTmdbFilm(title: string, year: number): Promise<number | null> {
  const url = new URL('https://api.themoviedb.org/3/search/movie');
  url.searchParams.set('query', title);
  url.searchParams.set('include_adult', 'false');
  url.searchParams.set('language', 'en-US');
  if (Number.isFinite(year) && year > 0) url.searchParams.set('year', String(year));
  withApiKey(url);

  const response = await fetch(url, { headers: tmdbHeaders(), next: { revalidate: 60 * 60 * 24 } });
  if (!response.ok) throw new Error(`TMDB search ${title}: ${response.status} ${response.statusText}`);
  const search = await response.json() as TmdbSearchResponse;
  const results = search.results ?? [];
  if (results.length === 0) return null;
  // Prefer the result whose release year matches when we know one; fall back to highest-popularity hit.
  const yearMatch = year > 0 ? results.find((r) => r.release_date?.startsWith(String(year))) : undefined;
  return (yearMatch ?? results.reduce((best, r) => (r.popularity ?? 0) > (best.popularity ?? 0) ? r : best))?.id ?? null;
}

function decodeXml(value: string | null) {
  if (!value) return null;
  return value
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function tagValue(item: string, tag: string) {
  const escaped = tag.replace(':', '\\:');
  const match = item.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)</${escaped}>`));
  return decodeXml(match?.[1] ?? null);
}

function htmlToText(html: string | null) {
  if (!html) return null;
  const withoutTags = html
    .replace(/<br\s*\/?>(\s*)/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return withoutTags.length > 0 ? withoutTags : null;
}

function numericRating(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLetterboxdRssEntries(xml: string): LetterboxdEntry[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => ({
    title: tagValue(item, 'letterboxd:filmTitle') ?? tagValue(item, 'title') ?? 'Untitled',
    watchedDate: tagValue(item, 'letterboxd:watchedDate'),
    link: tagValue(item, 'link') ?? '',
    rating: numericRating(tagValue(item, 'letterboxd:memberRating')),
    review: htmlToText(tagValue(item, 'description'))
  })).filter((entry) => entry.link.length > 0);
}

async function fetchLetterboxdEntries(username: string): Promise<LetterboxdEntry[]> {
  const response = await fetch(`https://letterboxd.com/${encodeURIComponent(username)}/rss/`, {
    headers: { accept: 'application/rss+xml, application/xml, text/xml' },
    next: { revalidate: 60 * 30 }
  });

  if (!response.ok) throw new Error(`Letterboxd RSS: ${response.status} ${response.statusText}`);
  return parseLetterboxdRssEntries(await response.text());
}

function csvRows(text: string): CsvRow[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') { field += '"'; index += 1; continue; }
      if (char === '"') { quoted = false; continue; }
      field += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ',') { row.push(field); field = ''; continue; }
    if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    if (char !== '\r') field += char;
  }
  row.push(field);
  if (row.some((value) => value.length > 0)) rows.push(row);

  const [headers = [], ...records] = rows;
  return records.map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ''])));
}

// On Vercel set LETTERBOXD_EXPORT_BUNDLE to the output of:
//   node scripts/bundle-export.mjs
// That script gzips all letterboxd_export/*.csv files into one base64 blob.
// Local dev falls back to reading the files directly from the filesystem.
let _bundle: Record<string, string> | null = null;
function exportBundle(): Record<string, string> {
  if (_bundle) return _bundle;
  const raw = process.env.LETTERBOXD_EXPORT_BUNDLE;
  if (!raw) return {};
  try {
    _bundle = JSON.parse(gunzipSync(Buffer.from(raw, 'base64')).toString('utf8'));
    return _bundle ?? {};
  } catch {
    return {};
  }
}

async function readExportText(filename: string) {
  const bundle = exportBundle();
  if (filename in bundle) return bundle[filename];
  try {
    return await readFile(path.join(process.cwd(), LETTERBOXD_EXPORT_DIR, filename), 'utf8');
  } catch {
    return null;
  }
}

async function readExportCsv(filename: string) {
  const text = await readExportText(filename);
  return text ? csvRows(text) : [];
}

async function readFavoriteExportEntries(): Promise<FavoriteExportEntry[]> {
  const [profile] = await readExportCsv('profile.csv');
  const favoriteLinks = (profile?.['Favorite Films'] ?? '')
    .split(',')
    .map((link) => link.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (favoriteLinks.length === 0) return [];

  const ratingRows = await readExportCsv('ratings.csv');
  const watchedRows = await readExportCsv('watched.csv');
  const byLink = new Map<string, CsvRow>();
  for (const row of watchedRows) byLink.set(row['Letterboxd URI'] ?? '', row);
  for (const row of ratingRows) byLink.set(row['Letterboxd URI'] ?? '', row);

  return favoriteLinks.flatMap((link, index) => {
    const row = byLink.get(link);
    if (!row) return [];
    return [{
      rank: index + 1,
      title: row.Name || 'Untitled',
      year: Number(row.Year) || 0,
      link,
      listDate: row.Date || profile?.['Date Joined'] || 'Unknown date'
    }];
  });
}


function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'film';
}

function hash(value: string) {
  let total = 0;
  for (let index = 0; index < value.length; index += 1) total = (total * 31 + value.charCodeAt(index)) >>> 0;
  return total;
}

function colorPair(value: string) {
  const hue = hash(value) % 360;
  return { color: `hsl(${hue} 34% 32%)`, accent: `hsl(${(hue + 42) % 360} 58% 72%)` };
}

function exportEntry(row: CsvRow, reviewByUri: Record<string, string>): LetterboxdEntry {
  const link = row['Letterboxd URI'] ?? '';
  const review = reviewByUri[link] || null;
  return {
    title: row.Name ?? 'Untitled',
    watchedDate: row['Watched Date'] || row.Date || null,
    link,
    rating: numericRating(row.Rating),
    review
  };
}

function viewingFromEntry(entry: LetterboxdEntry): Viewing {
  return {
    date: entry.watchedDate ?? 'Unknown date',
    with: 'Letterboxd diary',
    where: 'Letterboxd',
    rating: entry.rating ?? 0,
    memory: entry.review ?? 'Logged on Letterboxd.',
    review: entry.review ?? undefined
  };
}

function latestFilmTime(film: Film) {
  return Math.max(...film.viewings.map((viewing) => Date.parse(viewing.date)).filter(Number.isFinite), 0);
}

function letterboxdSlugFromLink(link: string) {
  return link.match(/\/film\/([^/?#]+)/)?.[1] ?? '';
}

function entryKey(entry: LetterboxdEntry) {
  const slug = letterboxdSlugFromLink(entry.link);
  return `${slug || entry.title.toLowerCase()}|${entry.watchedDate ?? ''}|${entry.rating ?? ''}`;
}

function hasEntry(entries: LetterboxdEntry[], candidate: LetterboxdEntry) {
  const key = entryKey(candidate);
  return entries.some((entry) =>
    entryKey(entry) === key ||
    (entry.title.toLowerCase() === candidate.title.toLowerCase() && entry.watchedDate === candidate.watchedDate)
  );
}

function matchesRssEntry(film: Film, entry: LetterboxdEntry) {
  const slug = letterboxdSlugFromLink(entry.link);
  if (slug && film.letterboxdSlug === slug) return true;
  if (slug && film.letterboxd?.url.includes(`/film/${slug}/`)) return true;
  return film.title.toLowerCase() === entry.title.toLowerCase();
}

function mergeRssEntriesIntoFilms(films: Film[], rssEntries: LetterboxdEntry[]) {
  if (rssEntries.length === 0) return films;
  const merged = films.map((film) => ({
    ...film,
    viewings: [...film.viewings],
    letterboxd: film.letterboxd ? { ...film.letterboxd, entries: [...film.letterboxd.entries] } : undefined
  }));

  for (const entry of rssEntries) {
    const slug = letterboxdSlugFromLink(entry.link);
    const existing = merged.find((film) => matchesRssEntry(film, entry));
    if (existing) {
      const entries = existing.letterboxd?.entries ?? [];
      if (hasEntry(entries, entry)) continue;
      const mergedEntries = [...entries, entry]
        .sort((left, right) => Date.parse(right.watchedDate ?? '') - Date.parse(left.watchedDate ?? ''));
      existing.letterboxd = {
        url: existing.letterboxd?.url || (slug ? `https://letterboxd.com/film/${slug}/` : entry.link),
        entries: mergedEntries
      };
      existing.viewings = entries.length > 0
        ? mergedEntries.map(viewingFromEntry)
        : [...existing.viewings, viewingFromEntry(entry)];
      continue;
    }

    const id = `${slug || slugify(entry.title)}-rss`;
    const colors = colorPair(`${entry.title}-rss`);
    merged.push({
      id,
      title: entry.title,
      year: 0,
      director: 'Letterboxd RSS',
      genre: 'Diary',
      color: colors.color,
      accent: colors.accent,
      spine: String(merged.length + 1).padStart(2, '0'),
      poster: PLACEHOLDER_POSTER,
      tmdbId: null,
      letterboxdSlug: slug,
      review: [],
      viewings: [viewingFromEntry(entry)],
      letterboxd: { url: slug ? `https://letterboxd.com/film/${slug}/` : entry.link, entries: [entry] }
    });
  }

  return merged
    .sort((left, right) => latestFilmTime(left) - latestFilmTime(right))
    .map((film, index) => ({ ...film, spine: String(index + 1).padStart(2, '0') }));
}

async function buildExportFilms(): Promise<ExportBuild | null> {
  const diaryRows = await readExportCsv('diary.csv');
  if (diaryRows.length === 0) return null;

  const reviewRows = await readExportCsv('reviews.csv');
  const reviewByUri = Object.fromEntries(reviewRows.map((row) => [row['Letterboxd URI'] ?? '', row.Review ?? '']).filter(([uri, review]) => uri && review));
  const favoriteRows = await readFavoriteExportEntries();
  const favoriteByTitleYear = Object.fromEntries(favoriteRows.map((favorite) => [`${favorite.title.toLowerCase()}-${favorite.year}`, favorite]));
  const seedByTitleYear = Object.fromEntries(seedFilms.map((film) => [`${film.title.toLowerCase()}-${film.year}`, film]));
  const grouped: Record<string, { title: string; year: number; link: string; entries: LetterboxdEntry[] }> = {};

  for (const row of diaryRows) {
    const title = row.Name || 'Untitled';
    const year = Number(row.Year) || 0;
    const link = row['Letterboxd URI'] || '';
    const key = link || `${title.toLowerCase()}-${year}`;
    grouped[key] ??= { title, year, link, entries: [] };
    grouped[key].entries.push(exportEntry(row, reviewByUri));
  }


  const entriesById: Record<string, LetterboxdEntry[]> = {};
  const filmsRaw = Object.values(grouped).map((group, index) => {
    const seed = seedByTitleYear[`${group.title.toLowerCase()}-${group.year}`];
    const favorite = favoriteByTitleYear[`${group.title.toLowerCase()}-${group.year}`];
    const id = seed?.id ?? `${slugify(group.title)}-${group.year || index}`;
    const colors = seed ? { color: seed.color, accent: seed.accent } : colorPair(`${group.title}-${group.year}`);
    const sortedEntries = group.entries.sort((left, right) => Date.parse(right.watchedDate ?? '') - Date.parse(left.watchedDate ?? ''));
    entriesById[id] = [...(entriesById[id] ?? []), ...sortedEntries]
      .sort((left, right) => Date.parse(right.watchedDate ?? '') - Date.parse(left.watchedDate ?? ''));

    return {
      ...(seed ?? {}),
      id,
      title: seed?.title ?? group.title,
      year: seed?.year ?? group.year,
      director: seed?.director ?? 'Letterboxd diary',
      genre: seed?.genre ?? 'Diary',
      color: colors.color,
      accent: colors.accent,
      spine: String(index + 1).padStart(2, '0'),
      poster: seed?.poster ?? PLACEHOLDER_POSTER,
      tmdbId: seed?.tmdbId ?? null,
      letterboxdSlug: seed?.letterboxdSlug ?? '',
      review: seed?.review ?? [],
      favoriteRank: favorite?.rank,
      viewings: entriesById[id].map(viewingFromEntry),
      letterboxd: { url: group.link, entries: entriesById[id] }
    } satisfies Film;
  });

  // Merge any films that resolved to the same ID (e.g. two diary-grouped
  // entries both matching the same seed), keeping the richer merged viewings.
  const seenIds = new Map<string, Film>();
  for (const film of filmsRaw) {
    const existing = seenIds.get(film.id);
    if (existing) {
      const mergedEntries = entriesById[film.id];
      seenIds.set(film.id, {
        ...existing,
        viewings: mergedEntries.map(viewingFromEntry),
        letterboxd: { url: existing.letterboxd?.url ?? '', entries: mergedEntries }
      });
    } else {
      seenIds.set(film.id, film);
    }
  }
  const films = Array.from(seenIds.values());

  const filmsByWatched = films
    .sort((left, right) => latestFilmTime(left) - latestFilmTime(right))
    .map((film, index) => ({ ...film, spine: String(index + 1).padStart(2, '0') }));

  return { films: filmsByWatched, entriesById, rows: diaryRows.length };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function hydrateTmdb(film: Film) {
  if (!hasTmdbCredentials()) return film;
  const tmdbId = film.tmdbId ?? await searchTmdbFilm(film.title, film.year);
  if (!tmdbId) return film;
  const tmdb = await fetchTmdbFilmById(tmdbId);
  return {
    ...film,
    tmdbId,
    director: tmdb.director ?? film.director,
    genre: tmdb.genres?.[0] ?? film.genre,
    poster: tmdb.posterUrl ?? film.poster,
    tmdb
  };
}

function withLetterboxdFallback(film: Film): Film {
  return {
    ...film,
    letterboxd: film.letterboxd ?? {
      url: film.letterboxdSlug ? `https://letterboxd.com/film/${film.letterboxdSlug}/` : '',
      entries: []
    }
  };
}

export async function getMergedFilms(): Promise<FilmsApiResponse> {
  const letterboxdUsername = process.env.LETTERBOXD_USERNAME ?? null;
  const exportBuild = await buildExportFilms();
  const baseFilms = exportBuild?.films ?? seedFilms;

  let tmdbState: FilmsApiResponse['sources']['tmdb'] = hasTmdbCredentials()
    ? { state: 'configured' }
    : { state: 'missing-config', message: 'Set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY to hydrate TMDB metadata.' };
  let letterboxdState: FilmsApiResponse['sources']['letterboxd'] = letterboxdUsername
    ? { state: 'configured', username: letterboxdUsername }
    : { state: 'missing-config', username: null, message: 'Set LETTERBOXD_USERNAME to hydrate Letterboxd RSS entries.' };
  const exportState: FilmsApiResponse['sources']['export'] = exportBuild
    ? { state: 'configured', rows: exportBuild.rows, films: exportBuild.films.length }
    : { state: 'missing-config', rows: 0, films: 0, message: `Add ${LETTERBOXD_EXPORT_DIR}/diary.csv to import the full diary.` };

  let rssEntries: LetterboxdEntry[] = [];
  if (letterboxdUsername) {
    try {
      rssEntries = await fetchLetterboxdEntries(letterboxdUsername);
    } catch (error) {
      letterboxdState = { state: 'error', username: letterboxdUsername, message: error instanceof Error ? error.message : 'Letterboxd RSS request failed.' };
    }
  }

  const mergedFilms = mergeRssEntriesIntoFilms(baseFilms, rssEntries);
  let hydratedFilms = mergedFilms;
  if (hasTmdbCredentials()) {
    hydratedFilms = await mapWithConcurrency(mergedFilms, 6, async (film) => {
      try {
        return await hydrateTmdb(film);
      } catch (error) {
        tmdbState = { state: 'error', message: error instanceof Error ? error.message : 'TMDB request failed.' };
        return film;
      }
    });
  }

  return {
    films: hydratedFilms.map(withLetterboxdFallback),
    sources: {
      tmdb: tmdbState,
      letterboxd: letterboxdState,
      export: exportState
    }
  };
}
