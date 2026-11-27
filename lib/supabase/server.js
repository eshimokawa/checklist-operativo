import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

function env(nombre) {
  const v = process.env[nombre];
  if (!v) throw new Error(`Falta la variable de entorno ${nombre}`);
  return v;
}

/** Cliente con la sesión del usuario (cookies). Solo se usa para autenticación. */
export function supabaseSesion() {
  const store = cookies();
  return createServerClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(lista) {
        try {
          lista.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // En Server Components no se pueden escribir cookies; el middleware las refresca.
        }
      },
    },
  });
}

let _admin;
/** Cliente con service_role: omite RLS. Todas las rutas aplican el alcance por unidad/área en código (lib/alcance.js). */
export function supabaseAdmin() {
  if (!_admin) {
    _admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}
