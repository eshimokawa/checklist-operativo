import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLICAS = ['/login', '/api/auth/login', '/api/cron'];

export async function middleware(request) {
  let response = NextResponse.next({ request });
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return response;

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(lista) {
        lista.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        lista.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Refresca el token si está por expirar
  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  const esPublica = PUBLICAS.some((p) => pathname.startsWith(p));

  if (!user && !esPublica) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Sesión expirada. Inicie sesión nuevamente.' }, { status: 401 });
    }
    const destino = request.nextUrl.clone();
    destino.pathname = '/login';
    destino.search = '';
    return NextResponse.redirect(destino);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.png|icon.png|.*\\.(?:png|jpg|svg|ico|ttf|woff2?)$).*)'],
};
