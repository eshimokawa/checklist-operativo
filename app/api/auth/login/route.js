import { NextResponse } from 'next/server';
import { supabaseSesion, supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req) {
  try {
    const { correo, password } = await req.json();
    if (!correo || !password) return NextResponse.json({ error: 'Ingrese su correo y contraseña.' }, { status: 400 });
    const sb = supabaseSesion();
    const { data, error } = await sb.auth.signInWithPassword({ email: String(correo).trim().toLowerCase(), password });
    if (error) {
      const msg = /banned/i.test(error.message) ? 'Su cuenta está desactivada. Contacte al administrador.' : 'Correo o contraseña incorrectos.';
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    const { data: perfil } = await supabaseAdmin().from('usuarios').select('rol,activo').eq('id', data.user.id).maybeSingle();
    if (!perfil || !perfil.activo) {
      await sb.auth.signOut();
      return NextResponse.json({ error: 'Su usuario no está habilitado en la aplicación. Contacte al administrador.' }, { status: 403 });
    }
    const destino = perfil.rol === 'administrador_aplicacion' ? '/configuracion' : perfil.rol === 'administrador_restaurante' ? '/dashboard' : '/tareas';
    return NextResponse.json({ ok: true, destino });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'No se pudo iniciar sesión.' }, { status: 500 });
  }
}
