import { HttpError, lanzarSiError, leerTodo, ROLES, unidadEfectiva } from './api';

export function estadoVisual(e) {
  if (e.estado === 'Pendiente' && new Date(e.ventana_fin).getTime() < Date.now()) return 'Vencida';
  return e.estado;
}

export function leerFiltros(req) {
  const p = new URL(req.url).searchParams;
  const f = (k) => (p.get(k) || '').trim() || null;
  return { unidad: f('unidad'), desde: f('desde'), hasta: f('hasta'), formulario: f('formulario'), area: f('area'), estado: f('estado') };
}

/** Ejecuciones visibles para el usuario según filtros (alcance por rol aplicado aquí). */
export async function buscarEjecuciones(db, perfil, filtros, { conFirma = false } = {}) {
  if (perfil.rol === ROLES.JEFE) throw new HttpError(403, 'Los reportes están disponibles para administradores.');
  const unidad = unidadEfectiva(perfil, filtros.unidad);
  const sel = `id,estado,fecha_programada,ventana_inicio,ventana_fin,fecha_hora_inicio,fecha_hora_registro,tiempo_ejecucion_minutos,
    calificacion_porcentaje,etiqueta_calificacion,correo_enviado,completado_fuera_plazo,auditado_descripcion,unidad_id,area_trabajo_id,
    formulario:formularios(id,codigo,nombre,tipo_evaluacion,estandar_porcentaje,campos),unidad:unidades(id,codigo,nombre),
    area:areas_trabajo(id,descripcion_area),auditor:usuarios!auditor_id(id,nombre_completo,correo)${conFirma ? ',firma_auditor_base64' : ''}`;
  let filas = await leerTodo(() => {
    let q = db.from('ejecuciones_checklist').select(sel).order('fecha_programada', { ascending: false }).order('ventana_inicio', { ascending: false });
    if (unidad) q = q.eq('unidad_id', unidad);
    if (filtros.desde) q = q.gte('fecha_programada', filtros.desde);
    if (filtros.hasta) q = q.lte('fecha_programada', filtros.hasta);
    if (filtros.formulario) q = q.eq('formulario_id', filtros.formulario);
    return q;
  });
  filas = filas.map((e) => ({ ...e, estado: estadoVisual(e) }));
  if (filtros.estado) filas = filas.filter((e) => e.estado === filtros.estado);

  if (filtros.area) {
    const { data: area } = await db.from('areas_trabajo').select('id,descripcion_area').eq('id', filtros.area).maybeSingle();
    if (!area) return [];
    const ids = filas.filter((e) => e.estado === 'Finalizado' && e.area_trabajo_id !== area.id).map((e) => e.id);
    const conArea = new Set();
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await db.from('ejecucion_respuestas').select('ejecucion_id')
        .in('ejecucion_id', ids.slice(i, i + 150)).ilike('seccion_nombre', area.descripcion_area);
      lanzarSiError(error);
      (data || []).forEach((r) => conArea.add(r.ejecucion_id));
    }
    filas = filas.filter((e) => e.area_trabajo_id === area.id || conArea.has(e.id));
  }
  return filas;
}

export async function respuestasDe(db, ids) {
  const salida = [];
  for (let i = 0; i < ids.length; i += 150) {
    const lote = ids.slice(i, i + 150);
    const filas = await leerTodo(() => db.from('ejecucion_respuestas').select('*').in('ejecucion_id', lote).order('orden'));
    salida.push(...filas);
  }
  return salida;
}
