import { ruta, ROLES, lanzarSiError, leerTodo, HttpError } from '@/lib/api';
import { definicion, prepararRegistro, crearUsuario, actualizarUsuario } from '@/lib/maestros';
export const dynamic = 'force-dynamic';
const SOLO_ADMIN = { roles: [ROLES.ADMIN_APP] };

export const GET = ruta(async ({ params, db }) => {
  const def = definicion(params.entidad);
  const filas = await leerTodo(() => db.from(def.tabla).select(def.select).order(def.orden));
  return { filas };
}, SOLO_ADMIN);

export const POST = ruta(async ({ req, params, db }) => {
  const datos = await req.json();
  if (params.entidad === 'usuarios') return await crearUsuario(db, datos);
  const def = definicion(params.entidad);
  const reg = await prepararRegistro(db, params.entidad, datos);
  const { data, error } = await db.from(def.tabla).insert(reg).select('id').single();
  lanzarSiError(error);
  return data;
}, SOLO_ADMIN);

export const PATCH = ruta(async ({ req, params, db }) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) throw new HttpError(400, 'Falta el id.');
  const datos = await req.json();
  if (params.entidad === 'usuarios') return await actualizarUsuario(db, id, datos);
  const def = definicion(params.entidad);
  // Para validar el área contra la unidad se necesita el registro completo
  let base = datos;
  if (('area_trabajo_id' in datos || 'unidad_id' in datos) && def.campos.includes('unidad_id')) {
    const { data: actual } = await db.from(def.tabla).select('*').eq('id', id).maybeSingle();
    base = { ...actual, ...datos };
  }
  const reg = await prepararRegistro(db, params.entidad, base, true);
  const cambios = Object.fromEntries(Object.entries(reg).filter(([k]) => k in datos || k === 'area_trabajo_id' && 'unidad_id' in datos));
  const { error } = await db.from(def.tabla).update(cambios).eq('id', id);
  lanzarSiError(error);
  return { id };
}, SOLO_ADMIN);

export const DELETE = ruta(async ({ req, params, sesion, db }) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) throw new HttpError(400, 'Falta el id.');
  const def = definicion(params.entidad);
  if (params.entidad === 'usuarios') {
    if (id === sesion.perfil.id) throw new HttpError(400, 'No puede eliminar su propio usuario.');
    const { error } = await db.from('usuarios').delete().eq('id', id);
    lanzarSiError(error);
    await db.auth.admin.deleteUser(id);
    return { ok: true };
  }
  const { error } = await db.from(def.tabla).delete().eq('id', id);
  lanzarSiError(error);
  return { ok: true };
}, SOLO_ADMIN);
