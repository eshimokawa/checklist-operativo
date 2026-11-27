import { HttpError, lanzarSiError, ROLES } from './api';
import { fechaHoraLocal, formatoPct } from './negocio';

/** Verifica que el usuario pueda ver la ejecución (misma regla que la política RLS p_ejec_sel). */
export function puedeVer(perfil, ejec) {
  if (perfil.rol === ROLES.ADMIN_APP) return true;
  if (ejec.unidad_id !== perfil.unidad_id) return false;
  return perfil.rol === ROLES.ADMIN_REST || ejec.auditor_id === perfil.id;
}

/** Carga una ejecución con todo lo necesario para mostrarla, generar el PDF o enviar el correo. */
export async function cargarReporte(db, id, perfil) {
  const { data: ejec, error } = await db
    .from('ejecuciones_checklist')
    .select('*, formulario:formularios(*), unidad:unidades(id,codigo,nombre), auditor:usuarios!auditor_id(id,nombre_completo,correo), area:areas_trabajo(id,descripcion_area)')
    .eq('id', id)
    .maybeSingle();
  lanzarSiError(error);
  if (!ejec) throw new HttpError(404, 'Ejecución no encontrada.');
  if (perfil && !puedeVer(perfil, ejec)) throw new HttpError(403, 'No tiene acceso a esta ejecución.');
  const { data: respuestas, error: e2 } = await db
    .from('ejecucion_respuestas')
    .select('*')
    .eq('ejecucion_id', id)
    .order('orden');
  lanzarSiError(e2);
  return { ...ejec, respuestas: respuestas || [] };
}

/** Agrupa respuestas por sección y subcategoría, calculando el % de cada sección. */
export function agruparRespuestas(respuestas) {
  const secciones = [];
  for (const r of respuestas) {
    const nombre = r.seccion_nombre || 'General';
    let s = secciones.find((x) => x.nombre === nombre);
    if (!s) { s = { nombre, subgrupos: [], conformes: 0, aplicables: 0 }; secciones.push(s); }
    const sub = r.subcategoria || '';
    let g = s.subgrupos.find((x) => x.nombre === sub);
    if (!g) { g = { nombre: sub, items: [] }; s.subgrupos.push(g); }
    g.items.push(r);
    if (r.es_conforme !== null && r.es_conforme !== undefined) {
      s.aplicables += 1;
      if (r.es_conforme) s.conformes += 1;
    }
  }
  for (const s of secciones) s.pct = s.aplicables ? (s.conformes / s.aplicables) * 100 : null;
  return secciones;
}

/** Datos resumidos que comparten el correo y el PDF */
export function resumen(rep) {
  return {
    formulario: `${rep.formulario.codigo} - ${rep.formulario.nombre}`,
    formularioNombre: rep.formulario.nombre,
    ubicacion: rep.unidad?.nombre || '',
    calificacion: formatoPct(rep.calificacion_porcentaje),
    calificacionNum: Number(rep.calificacion_porcentaje),
    etiqueta: rep.etiqueta_calificacion,
    estandar: formatoPct(rep.formulario.estandar_porcentaje),
    fecha: fechaHoraLocal(rep.fecha_hora_registro, process.env.APP_TIMEZONE || undefined),
    tiempo: `${rep.tiempo_ejecucion_minutos ?? 0} minuto${rep.tiempo_ejecucion_minutos === 1 ? '' : 's'}`,
    auditor: rep.auditor?.nombre_completo || '',
    auditado: rep.auditado_descripcion || rep.unidad?.nombre || '',
  };
}

/** Texto de "Auditado" según el tipo de formulario */
export function describirAuditado(formulario, unidad, areas) {
  const lista = [...new Set(areas.filter(Boolean))];
  const zonas = lista.length ? lista.join(', ') : 'Todas las áreas';
  if (formulario.tipo_evaluacion === 'trabajadores') return `Personal de ${zonas} - ${unidad}`;
  if (formulario.tipo_evaluacion === 'equipos') return `Equipos de ${zonas} - ${unidad}`;
  return `${zonas} - ${unidad}`;
}
