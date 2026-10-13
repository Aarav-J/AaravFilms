import { getMergedFilms } from '@/lib/external-film-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const response = await getMergedFilms();
  return Response.json(response);
}
