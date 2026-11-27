import { HttpError, lanzarSiError, leerTodo } from './api';
import { evaluarItem, calcularCalificacion, normalizar } from './negocio';
import { describirAuditado } from './reporte';

const porTexto = (a, b) => a.seccion_nombre.localeCompare(b.seccion_nombre, 'es') || a.orden - b.orden || a.texto.localeCompare(b.texto, 'es');

/**
 * Construye la lista de ítems a evaluar de una ejecución:
 *  - general: preguntas del formulario
 *  - trabajadores: trabajadores activos de la sede (y del área del jefe, si aplica)
 *  - equipos: equipos del formulario (o todos los de la sede/área) activos
 */
export async function construirItems(db, ejec, formulario) {
  const tipo = formulario.tipo_evaluacion;
  if (tipo === 'general') {
    const { data: secciones, error } = await db.from('formulario_secciones').select('id,nombre,orden').eq('formulario_id', formulario.id).order('orden');
    lanzarSiError(error);
    const preguntas = await leerTodo(() => db.from('formulario_preguntas').select('*').eq('formulario_id', formulario.id).eq('activo', true).order('orden'));
    const secMap = new Map((secciones || []).map((s) => [s.id, s]));
    return preguntas
      .map((p) => ({
        key: `p:${p.id}`, tipo: 'pregunta', pregunta_id: p.id,
        seccion_nombre: secMap.get(p.seccion_id)?.nombre || 'General',
        seccion_orden: secMap.get(p.seccion_id)?.orden ?? 0,
        subcategoria: p.subcategoria || null, texto: p.texto, es_punto_critico: p.es_punto_critico, orden: p.orden,
      }))
      .sort((a, b) => a.seccion_orden - b.seccion_orden || a.orden - b.orden);
  }

  if (tipo === 'trabajadores') {
    const filas = await leerTodo(() => {
      let q = db.from('trabajadores').select('id,nombre_completo,area_trabajo_id,area:areas_trabajo(descripcion_area)')
        .eq('unidad_id', ejec.unidad_id).eq('activo', true).order('nombre_completo');
      if (ejec.area_trabajo_id) q = q.eq('area_trabajo_id', ejec.area_trabajo_id);
      return q;
    });
    return filas.map((t, i) => ({
      key: `t:${t.id}`, tipo: 'trabajador', trabajador_id: t.id,
      seccion_nombre: t.area?.descripcion_area || 'Sin área', subcategoria: null,
      texto: t.nombre_completo, orden: i,
      datos: { nombre_completo: t.nombre_completo, area: t.area?.descripcion_area || '' },
    })).sort(porTexto);
  }

  // equipos
  const { data: vinculados, error: e1 } = await db.from('formulario_equipos').select('equipo_id,orden').eq('formulario_id', formulario.id);
  lanzarSiError(e1);
  const ordenVinc = new Map((vinculados || []).map((v) => [v.equipo_id, v.orden]));
  const equipos = await leerTodo(() => {
    let q = db.from('equipos').select('id,codigo_equipo,descripcion_equipo,tipo_equipo,temperatura_funcionamiento,area_trabajo_id,area:areas_trabajo(descripcion_area)')
      .eq('unidad_id', ejec.unidad_id).eq('activo', true).order('codigo_equipo');
    if (ejec.area_trabajo_id) q = q.eq('area_trabajo_id', ejec.area_trabajo_id);
    if (ordenVinc.size) q = q.in('id', [...ordenVinc.keys()]);
    return q;
  });
  return equipos.map((e) => ({
    key: `e:${e.id}`, tipo: 'equipo', equipo_id: e.id,
    seccion_nombre: e.area?.descripcion_area || 'Sin área', subcategoria: null,
    texto: `${e.codigo_equipo} - ${e.descripcion_equipo}`, parametro: e.temperatura_funcionamiento,
    orden: ordenVinc.get(e.id) ?? 0,
    datos: {
      area: e.area?.descripcion_area || '', codigo_equipo: e.codigo_equipo, descripcion_equipo: e.descripcion_equipo,
      tipo_equipo: e.tipo_equipo || '', temperatura_funcionamiento: e.temperatura_funcionamiento || '',
    },
  })).sort(porTexto);
}

/** Valida, califica y cierra una ejecución de forma atómica. */
export async function finalizarEjecucion(db, perfil, id, cuerpo) {
  const { data: ejec, error } = await db.from('ejecuciones_checklist')
    .select('*, formulario:formularios(*), unidad:unidades(nombre)').eq('id', id).maybeSingle();
  lanzarSiError(error);
  if (!ejec) throw new HttpError(404, 'Ejecución no encontrada.');
  if (ejec.auditor_id !== perfil.id) throw new HttpError(403, 'Solo el usuario responsable asignado puede completar este check list.');
  if (ejec.estado === 'Finalizado') throw new HttpError(409, 'Este check list ya fue finalizado.');

  const firma = String(cuerpo.firma || '');
  if (!/^data:image\/(png|jpeg);base64,/.test(firma) || firma.length < 200) throw new HttpError(400, 'La firma del auditor es obligatoria.');
  if (firma.length > 2_500_000) throw new HttpError(400, 'La imagen de la firma es demasiado grande.');

  const formulario = ejec.formulario;
  const items = await construirItems(db, ejec, formulario);
  if (!items.length) throw new HttpError(400, 'No hay ítems activos para evaluar en este formulario.');

  const entradas = new Map((cuerpo.respuestas || []).map((r) => [r.key, r]));
  const errores = [];
  const filas = [];
  items.forEach((it, i) => {
    const ent = entradas.get(it.key) || {};
    const res = evaluarItem(formulario, it, ent);
    if (!res.ok) { errores.push(`${it.seccion_nombre} › ${it.texto}: ${res.error}`); return; }
    const valores = { ...(ent.valores || {}) };
    delete valores.aspecto; // el aspecto ya no se registra por fila
    if (it.parametro) valores._parametro = it.parametro;
    const co = (formulario.campos || []).find((c) => c.rol === 'observacion');
    const observacion = formulario.tipo_evaluacion === 'general' ? ent.observacion : co ? valores[co.clave] : ent.observacion;
    filas.push({
      pregunta_id: it.pregunta_id || null, trabajador_id: it.trabajador_id || null, equipo_id: it.equipo_id || null,
      seccion_nombre: it.seccion_nombre, subcategoria: it.subcategoria, item_descripcion: it.texto,
      respuesta_seleccionada: res.respuesta_seleccionada, es_conforme: res.es_conforme,
      observacion_accion_correctiva: observacion ? String(observacion).slice(0, 2000) : null,
      valores, orden: i,
    });
  });
  if (errores.length) {
    throw new HttpError(400, `Hay ${errores.length} ítem(s) incompletos:\n- ${errores.slice(0, 8).join('\n- ')}${errores.length > 8 ? '\n…' : ''}`);
  }

  const ahora = new Date();
  let inicio = cuerpo.inicio ? new Date(cuerpo.inicio) : ahora;
  if (Number.isNaN(inicio.getTime()) || inicio > ahora || ahora - inicio > 24 * 3600 * 1000) inicio = ahora;
  const tiempo = Math.floor((ahora - inicio) / 60000);
  const { pct } = calcularCalificacion(filas);
  const auditado = describirAuditado(formulario, ejec.unidad?.nombre || '', filas.map((f) => f.seccion_nombre));

  const { data: final, error: e2 } = await db.rpc('fn_finalizar_ejecucion', {
    p_ejecucion: id,
    p_auditor: perfil.id,
    p_datos: {
      fecha_hora_inicio: inicio.toISOString(),
      fecha_hora_registro: ahora.toISOString(),
      tiempo_ejecucion_minutos: tiempo,
      calificacion_porcentaje: pct,
      auditado_descripcion: auditado,
      firma_auditor_base64: firma,
    },
    p_respuestas: filas,
  });
  lanzarSiError(e2);
  return final;
}
