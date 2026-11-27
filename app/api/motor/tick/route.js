import { ruta, lanzarSiError } from '@/lib/api';
export const dynamic = 'force-dynamic';

// Verificación en tiempo real desde el navegador: genera instancias del día y alertas del usuario.
export const POST = ruta(async ({ sesion, db }) => {
  const { data, error } = await db.rpc('fn_motor_frecuencias', { p_usuario: sesion.perfil.id });
  lanzarSiError(error);
  return data;
});
