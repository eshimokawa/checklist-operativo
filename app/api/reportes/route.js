import { ruta, ROLES } from '@/lib/api';
import { buscarEjecuciones, leerFiltros } from '@/lib/consultas';
export const dynamic = 'force-dynamic';

export const GET = ruta(async ({ req, sesion, db }) => {
  const filas = await buscarEjecuciones(db, sesion.perfil, leerFiltros(req));
  return { total: filas.length, filas: filas.slice(0, 1000) };
}, { roles: [ROLES.ADMIN_APP, ROLES.ADMIN_REST] });
