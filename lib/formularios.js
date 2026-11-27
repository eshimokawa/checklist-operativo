import { HttpError, lanzarSiError, mensajeErrorBD } from './api';
import { normalizar } from './negocio';
import { slug } from './excel/formularios';

const TIPOS = ['general', 'trabajadores', 'equipos'];

function limpiarLista(v) {
  return [...new Set((Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean))];
}

/** Valida y normaliza la definición editable de un formulario. */
export function validarDefinicion(f) {
  const d = {
    codigo: String(f.codigo || '').trim(),
    nombre: String(f.nombre || '').trim(),
    tipo_evaluacion: f.tipo_evaluacion,
    estandar_porcentaje: Number(f.estandar_porcentaje || 0),
    opciones_respuesta: limpiarLista(f.opciones_respuesta),
    opciones_conformes: limpiarLista(f.opciones_conformes),
    opciones_no_aplica: limpiarLista(f.opciones_no_aplica),
    aspectos_informativos: limpiarLista(f.aspectos_informativos),
    campos: [],
  };
  if (!d.codigo || !d.nombre) throw new HttpError(400, 'Código y nombre del formulario son obligatorios.');
  if (!TIPOS.includes(d.tipo_evaluacion)) throw new HttpError(400, 'Tipo de evaluación inválido.');
  if (Number.isNaN(d.estandar_porcentaje) || d.estandar_porcentaje < 0 || d.estandar_porcentaje > 100) throw new HttpError(400, 'El estándar debe estar entre 0 y 100.');

  if (d.tipo_evaluacion === 'general') {
    const total = (f.secciones || []).reduce((a, s) => a + (s.preguntas || []).filter((p) => String(p.texto || '').trim()).length, 0);
    if (!total) throw new HttpError(400, 'El formulario general debe tener al menos una pregunta.');
  } else {
    const claves = new Set();
    d.campos = (f.campos || []).map((c) => {
      let clave = slug(c.clave || c.etiqueta);
      while (claves.has(clave)) clave += '_2';
      claves.add(clave);
      const campo = {
        clave, etiqueta: String(c.etiqueta || clave).trim(), origen: c.origen === 'precompletado' ? 'precompletado' : 'usuario',
        fuente: c.fuente || null, tipo: ['opciones', 'numero', 'texto'].includes(c.tipo) ? c.tipo : 'texto',
        opciones: limpiarLista(c.opciones), rol: ['evaluacion', 'observacion', 'dato'].includes(c.rol) ? c.rol : 'dato',
        requerido: !!c.requerido, unidad: c.unidad || undefined,
      };
      if (campo.rol === 'evaluacion') {
        campo.requerido = true;
        campo.regla = campo.tipo === 'opciones' ? { tipo: 'opciones' } : c.regla || { tipo: 'rango_parametro' };
        if (campo.regla.tipo === 'max' || campo.regla.tipo === 'min') campo.regla.valor = Number(campo.regla.valor);
      }
      return campo;
    });
    const ev = d.campos.filter((c) => c.rol === 'evaluacion');
    if (ev.length !== 1) throw new HttpError(400, 'Debe existir exactamente un campo con rol "Evaluación".');
    if (!d.campos.some((c) => c.rol === 'observacion')) {
      d.campos.push({ clave: 'observacion', etiqueta: 'Observaciones y acción correctiva', origen: 'usuario', tipo: 'texto', opciones: [], rol: 'observacion', requerido: false });
    }
    if (ev[0].tipo === 'opciones') {
      if (!ev[0].opciones.length) ev[0].opciones = d.opciones_respuesta;
      d.opciones_respuesta = ev[0].opciones;
    }
    if (ev[0].tipo === 'numero' && ['max', 'min'].includes(ev[0].regla.tipo) && Number.isNaN(ev[0].regla.valor)) {
      throw new HttpError(400, 'Indique el valor límite de la regla de evaluación.');
    }
  }
  const usaOpciones = d.tipo_evaluacion === 'general' || d.campos.find((c) => c.rol === 'evaluacion')?.tipo === 'opciones';
  if (usaOpciones) {
    if (d.opciones_respuesta.length < 2) throw new HttpError(400, 'Defina al menos dos opciones de respuesta.');
    const ops = d.opciones_respuesta.map(normalizar);
    d.opciones_conformes = d.opciones_conformes.filter((o) => ops.includes(normalizar(o)));
    d.opciones_no_aplica = d.opciones_no_aplica.filter((o) => ops.includes(normalizar(o)) && !d.opciones_conformes.includes(o));
    if (!d.opciones_conformes.length) throw new HttpError(400, 'Indique qué opción(es) cuentan como conformes.');
  }
  return d;
}

async function reemplazarPreguntas(db, formularioId, secciones) {
  lanzarSiError((await db.from('formulario_preguntas').delete().eq('formulario_id', formularioId)).error);
  lanzarSiError((await db.from('formulario_secciones').delete().eq('formulario_id', formularioId)).error);
  let orden = 0;
  for (const [i, s] of (secciones || []).entries()) {
    const preguntas = (s.preguntas || []).filter((p) => String(p.texto || '').trim());
    if (!preguntas.length) continue;
    const { data: sec, error } = await db.from('formulario_secciones').insert({ formulario_id: formularioId, nombre: String(s.nombre || 'General').trim(), orden: i }).select('id').single();
    lanzarSiError(error);
    const filas = preguntas.map((p) => ({
      formulario_id: formularioId, seccion_id: sec.id, subcategoria: p.subcategoria ? String(p.subcategoria).trim() : null,
      texto: String(p.texto).trim(), es_punto_critico: !!p.es_punto_critico, orden: orden++,
    }));
    lanzarSiError((await db.from('formulario_preguntas').insert(filas)).error);
  }
}

async function vincularEquipos(db, formularioId, unidadId, equipos) {
  lanzarSiError((await db.from('formulario_equipos').delete().eq('formulario_id', formularioId)).error);
  if (!equipos?.length) return { creados: 0, areas: [] };
  const { data: areas } = await db.from('areas_trabajo').select('id,descripcion_area').eq('unidad_id', unidadId);
  const aMap = new Map((areas || []).map((a) => [normalizar(a.descripcion_area), a]));
  const res = { creados: 0, actualizados: 0, areas: [] };
  const vinculos = [];
  for (const [i, e] of equipos.entries()) {
    let area = null;
    if (e.area) {
      area = aMap.get(normalizar(e.area));
      if (!area) {
        const { data, error } = await db.from('areas_trabajo').insert({ descripcion_area: e.area.trim(), unidad_id: unidadId }).select('id,descripcion_area').single();
        if (error) throw new HttpError(400, mensajeErrorBD(error));
        area = data; aMap.set(normalizar(e.area), data); res.areas.push(e.area);
      }
    }
    const { data: ex } = await db.from('equipos').select('id').eq('unidad_id', unidadId).ilike('codigo_equipo', e.codigo_equipo).maybeSingle();
    const reg = {
      codigo_equipo: e.codigo_equipo, descripcion_equipo: e.descripcion_equipo || e.codigo_equipo, tipo_equipo: e.tipo_equipo || null,
      unidad_id: unidadId, area_trabajo_id: area?.id || null,
    };
    if (e.temperatura_funcionamiento) reg.temperatura_funcionamiento = e.temperatura_funcionamiento;
    let id;
    if (ex) { lanzarSiError((await db.from('equipos').update(reg).eq('id', ex.id)).error); id = ex.id; res.actualizados++; }
    else {
      const { data, error } = await db.from('equipos').insert(reg).select('id').single();
      lanzarSiError(error); id = data.id; res.creados++;
    }
    if (!vinculos.some((v) => v.equipo_id === id)) vinculos.push({ formulario_id: formularioId, equipo_id: id, orden: i });
  }
  lanzarSiError((await db.from('formulario_equipos').insert(vinculos)).error);
  return res;
}

/** Vincula equipos ya registrados (alta manual). Lista vacía = todos los equipos de la sede/área. */
async function vincularEquiposPorId(db, formularioId, unidadId, ids) {
  lanzarSiError((await db.from('formulario_equipos').delete().eq('formulario_id', formularioId)).error);
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return { creados: 0, actualizados: 0, vinculados: 0 };
  const { data, error } = await db.from('equipos').select('id').eq('unidad_id', unidadId).in('id', unicos);
  lanzarSiError(error);
  if ((data || []).length !== unicos.length) throw new HttpError(400, 'Algunos equipos seleccionados no pertenecen a la unidad del formulario.');
  lanzarSiError((await db.from('formulario_equipos').insert(unicos.map((equipo_id, orden) => ({ formulario_id: formularioId, equipo_id, orden })))).error);
  return { creados: 0, actualizados: 0, vinculados: unicos.length };
}

/** Crea (o reemplaza) un formulario con su estructura, equipos y asignación opcional. */
export async function guardarFormulario(db, { formulario, unidad_id, frecuencia_id, usuario_responsable_id, reemplazar, origen_archivo }) {
  if (!unidad_id) throw new HttpError(400, 'Seleccione la unidad del formulario.');
  const d = validarDefinicion(formulario);
  const { data: ex } = await db.from('formularios').select('id').eq('unidad_id', unidad_id).ilike('codigo', d.codigo).maybeSingle();
  if (ex && !reemplazar) throw new HttpError(409, `Ya existe el formulario ${d.codigo} en esta unidad. Marque "Reemplazar" para actualizarlo.`);
  const fila = { ...d, unidad_id, origen_archivo: origen_archivo || null, activo: true };
  let id;
  if (ex) {
    lanzarSiError((await db.from('formularios').update(fila).eq('id', ex.id)).error);
    id = ex.id;
  } else {
    const { data, error } = await db.from('formularios').insert(fila).select('id').single();
    lanzarSiError(error);
    id = data.id;
  }
  if (d.tipo_evaluacion === 'general') await reemplazarPreguntas(db, id, formulario.secciones);
  let eq = null;
  if (d.tipo_evaluacion === 'equipos') {
    eq = Array.isArray(formulario.equipos_ids)
      ? await vincularEquiposPorId(db, id, unidad_id, formulario.equipos_ids)
      : await vincularEquipos(db, id, unidad_id, formulario.equipos);
  }

  let asignacion = null;
  if (frecuencia_id && usuario_responsable_id) {
    const { data: u } = await db.from('usuarios').select('unidad_id,rol').eq('id', usuario_responsable_id).maybeSingle();
    if (!u) throw new HttpError(400, 'Usuario responsable no encontrado.');
    if (u.rol === 'administrador_aplicacion' || u.unidad_id !== unidad_id) throw new HttpError(400, 'El responsable debe ser un usuario operativo de la misma unidad.');
    const { data, error } = await db.from('asignaciones_formulario')
      .upsert({ formulario_id: id, usuario_responsable_id, frecuencia_id, activo: true }, { onConflict: 'formulario_id,usuario_responsable_id,frecuencia_id' })
      .select('id').single();
    lanzarSiError(error);
    asignacion = data.id;
  }
  return { id, equipos: eq, asignacion };
}

export async function actualizarFormulario(db, id, cuerpo) {
  const { data: actual } = await db.from('formularios').select('*').eq('id', id).maybeSingle();
  if (!actual) throw new HttpError(404, 'Formulario no encontrado.');
  if (Object.keys(cuerpo).length === 1 && 'activo' in cuerpo) {
    lanzarSiError((await db.from('formularios').update({ activo: !!cuerpo.activo }).eq('id', id)).error);
    return { id };
  }
  const d = validarDefinicion({ ...actual, ...cuerpo, tipo_evaluacion: actual.tipo_evaluacion, secciones: cuerpo.secciones || [{ preguntas: [{ texto: 'x' }] }] });
  lanzarSiError((await db.from('formularios').update({ ...d, activo: cuerpo.activo ?? actual.activo }).eq('id', id)).error);
  if (actual.tipo_evaluacion === 'general' && cuerpo.secciones) await reemplazarPreguntas(db, id, cuerpo.secciones);
  return { id };
}
