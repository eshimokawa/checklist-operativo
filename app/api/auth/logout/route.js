import { NextResponse } from 'next/server';
import { supabaseSesion } from '@/lib/supabase/server';

export async function POST() {
  await supabaseSesion().auth.signOut();
  return NextResponse.json({ ok: true });
}
