import { ruta, lanzarSiError, ROLES } from '@/lib/api';
export const dynamic = 'force-dynamic';

// Listas para filtros, acotadas al alcance del usuario.
export const GET = ruta(async ({ sesion, db }) => {
  const p = sesion.perfil;
  const admin = p.rol === ROLES.ADMIN_APP;
  let qu = db.from('unidades').select('id,codigo,nombre').eq('activo', true).order('nombre');
  let qa = db.from('areas_trabajo').select('id,descripcion_area,unidad_id').eq('activo', true).order('descripcion_area');
  let qf = db.from('formularios').select('id,codigo,nombre,unidad_id,tipo_evaluacion').order('nombre');
  if (!admin) { qu = qu.eq('id', p.unidad_id); qa = qa.eq('unidad_id', p.unidad_id); qf = qf.eq('unidad_id', p.unidad_id); }
  const [u, a, f] = await Promise.all([qu, qa, qf]);
  lanzarSiError(u.error); lanzarSiError(a.error); lanzarSiError(f.error);
  return { unidades: u.data, areas: a.data, formularios: f.data };
});
