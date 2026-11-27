import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';

// Job periódico (Render Cron Job). Protegido con CRON_SECRET.
async function ejecutar(req) {
  const secreto = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') || '';
  if (!secreto || auth !== `Bearer ${secreto}`) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { data, error } = await supabaseAdmin().rpc('fn_motor_frecuencias', { p_usuario: null });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  console.log('[motor]', new Date().toISOString(), JSON.stringify(data));
  return NextResponse.json(data);
}
export const GET = ejecutar;
export const POST = ejecutar;
