import { ruta, ROLES, lanzarSiError, HttpError } from '@/lib/api';
import { actualizarFormulario } from '@/lib/formularios';
export const dynamic = 'force-dynamic';
const SOLO_ADMIN = { roles: [ROLES.ADMIN_APP] };

export const GET = ruta(async ({ params, db }) => {
  const { data: f, error } = await db.from('formularios').select('*, unidad:unidades(id,nombre)').eq('id', params.id).maybeSingle();
  lanzarSiError(error);
  if (!f) throw new HttpError(404, 'Formulario no encontrado.');
  const [{ data: secciones }, { data: preguntas }, { data: equipos }] = await Promise.all([
    db.from('formulario_secciones').select('id,nombre,orden').eq('formulario_id', f.id).order('orden'),
    db.from('formulario_preguntas').select('*').eq('formulario_id', f.id).order('orden'),
    db.from('formulario_equipos').select('orden, equipo:equipos(id,codigo_equipo,descripcion_equipo,temperatura_funcionamiento,area:areas_trabajo(descripcion_area))').eq('formulario_id', f.id).order('orden'),
  ]);
  f.secciones = (secciones || []).map((s) => ({ nombre: s.nombre, preguntas: (preguntas || []).filter((p) => p.seccion_id === s.id) }));
  f.equipos = (equipos || []).map((x) => x.equipo).filter(Boolean);
  return { formulario: f };
}, SOLO_ADMIN);

export const PATCH = ruta(async ({ req, params, db }) => actualizarFormulario(db, params.id, await req.json()), SOLO_ADMIN);

export const DELETE = ruta(async ({ params, db }) => {
  const { count } = await db.from('ejecuciones_checklist').select('id', { count: 'exact', head: true })
    .eq('formulario_id', params.id).eq('estado', 'Finalizado');
  if (count) throw new HttpError(409, `El formulario tiene ${count} ejecución(es) finalizada(s). Desactívelo para conservar el historial.`);
  const { error } = await db.from('formularios').delete().eq('id', params.id);
  lanzarSiError(error);
  return { ok: true };
}, SOLO_ADMIN);
