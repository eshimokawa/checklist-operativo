import { NextResponse } from 'next/server';
import { supabaseSesion, supabaseAdmin } from './supabase/server';

export class HttpError extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

export const ROLES = {
  ADMIN_APP: 'administrador_aplicacion',
  ADMIN_REST: 'administrador_restaurante',
  JEFE: 'jefe_area',
};

export const ROL_ETIQUETA = {
  administrador_aplicacion: 'Administrador de la aplicación',
  administrador_restaurante: 'Administrador de restaurante',
  jefe_area: 'Jefe de área',
};

/** Devuelve { user, perfil } o null si no hay sesión válida o el usuario está inactivo. */
export async function obtenerSesion() {
  const sb = supabaseSesion();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabaseAdmin()
    .from('usuarios')
    .select('*, unidad:unidades(id,codigo,nombre), area:areas_trabajo(id,descripcion_area)')
    .eq('id', user.id)
    .maybeSingle();
  if (!perfil || !perfil.activo) return null;
  return { user, perfil };
}

/** Traduce errores de PostgREST/Postgres a mensajes en español. */
export function mensajeErrorBD(error) {
  if (!error) return 'Error desconocido';
  switch (error.code) {
    case '23505': return 'Ya existe un registro con esos datos (valor duplicado).';
    case '23503': return 'No se puede completar: el registro está relacionado con otros datos (por ejemplo, ejecuciones o asignaciones). Desactívelo en lugar de eliminarlo.';
    case '23514': return 'Los datos no cumplen las reglas de validación: ' + (error.message || '');
    case '23502': return 'Falta un campo obligatorio: ' + (error.message || '');
    case 'P0001': return error.message;
    case '22P02': return 'Formato de dato inválido.';
    default: return error.message || 'Error de base de datos';
  }
}

export function lanzarSiError(error) {
  if (error) throw new HttpError(400, mensajeErrorBD(error));
}

/**
 * Envoltorio para route handlers: valida sesión y rol, y convierte errores en JSON.
 * uso: export const GET = ruta(async ({ req, sesion, params }) => {...}, { roles: [...] })
 */
export function ruta(handler, opciones = {}) {
  return async (req, ctx) => {
    try {
      let sesion = null;
      if (!opciones.publica) {
        sesion = await obtenerSesion();
        if (!sesion) throw new HttpError(401, 'Sesión no válida o usuario desactivado.');
        if (opciones.roles && !opciones.roles.includes(sesion.perfil.rol)) {
          throw new HttpError(403, 'No tiene permisos para esta acción.');
        }
      }
      const r = await handler({ req, sesion, params: ctx?.params || {}, db: supabaseAdmin() });
      if (r instanceof Response) return r;
      return NextResponse.json(r ?? { ok: true });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error('[API]', e);
      return NextResponse.json({ error: e.message || 'Error interno' }, { status });
    }
  };
}

/** Lee todas las filas de una consulta paginando de 1000 en 1000. */
export async function leerTodo(crearConsulta, tam = 1000) {
  const salida = [];
  for (let desde = 0; ; desde += tam) {
    const { data, error } = await crearConsulta().range(desde, desde + tam - 1);
    lanzarSiError(error);
    salida.push(...(data || []));
    if (!data || data.length < tam) break;
  }
  return salida;
}

/** Determina la unidad efectiva para consultas de reportes/dashboard según el rol. */
export function unidadEfectiva(perfil, unidadSolicitada) {
  if (perfil.rol === ROLES.ADMIN_APP) return unidadSolicitada || null; // null = todas
  return perfil.unidad_id; // los demás roles siempre limitados a su unidad
}
