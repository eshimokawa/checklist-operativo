import { ruta, ROLES, lanzarSiError, unidadEfectiva, leerTodo } from '@/lib/api';
import { buscarEjecuciones, leerFiltros, respuestasDe } from '@/lib/consultas';
import { fechaLocal } from '@/lib/negocio';
export const dynamic = 'force-dynamic';

function acumular(mapa, clave, base, conforme) {
  if (!mapa.has(clave)) mapa.set(clave, { ...base, aplicables: 0, incumplimientos: 0 });
  const x = mapa.get(clave);
  x.aplicables += 1;
  if (conforme === false) x.incumplimientos += 1;
}

function top(mapa, n = 12) {
  return [...mapa.values()]
    .filter((x) => x.incumplimientos > 0)
    .map((x) => ({ ...x, porcentaje: Math.round((x.incumplimientos / x.aplicables) * 10000) / 100 }))
    .sort((a, b) => b.porcentaje - a.porcentaje || b.incumplimientos - a.incumplimientos)
    .slice(0, n);
}

export const GET = ruta(async ({ req, sesion, db }) => {
  const filtros = leerFiltros(req);
  if (!filtros.desde) filtros.desde = fechaLocal(new Date(Date.now() - 29 * 86400000));
  if (!filtros.hasta) filtros.hasta = fechaLocal();
  const filas = await buscarEjecuciones(db, sesion.perfil, filtros);
  const fin = filas.filter((e) => e.estado === 'Finalizado');

  const estados = { Pendiente: 0, Vencida: 0, Finalizado: 0 };
  filas.forEach((e) => { estados[e.estado] = (estados[e.estado] || 0) + 1; });
  const niveles = { Bueno: 0, Regular: 0, Deficiente: 0 };
  fin.forEach((e) => { if (e.etiqueta_calificacion) niveles[e.etiqueta_calificacion] += 1; });
  const promedio = fin.length ? fin.reduce((a, e) => a + Number(e.calificacion_porcentaje || 0), 0) / fin.length : null;
  const vencidasOFin = estados.Finalizado + estados.Vencida;
  const cumplimientoEjecucion = vencidasOFin ? (estados.Finalizado / vencidasOFin) * 100 : null;

  // Promedio por formulario y por día
  const porForm = new Map();
  for (const e of fin) {
    const k = e.formulario?.id;
    if (!porForm.has(k)) porForm.set(k, { formulario: `${e.formulario?.codigo} - ${e.formulario?.nombre}`, n: 0, suma: 0, estandar: Number(e.formulario?.estandar_porcentaje || 0) });
    const f = porForm.get(k); f.n += 1; f.suma += Number(e.calificacion_porcentaje || 0);
  }

  // Recurrencia de incumplimientos
  const porId = new Map(fin.map((e) => [e.id, e]));
  const resp = await respuestasDe(db, fin.map((e) => e.id));
  const rPregunta = new Map();
  const rArea = new Map();
  const rFormulario = new Map();
  for (const r of resp) {
    if (r.es_conforme === null) continue;
    const e = porId.get(r.ejecucion_id);
    const form = `${e.formulario?.codigo} - ${e.formulario?.nombre}`;
    let aspecto;
    if (e.formulario?.tipo_evaluacion === 'general') aspecto = r.item_descripcion;
    else aspecto = (e.formulario?.campos || []).find((c) => c.rol === 'evaluacion')?.etiqueta || 'Revisión';
    acumular(rPregunta, `${form}|${aspecto}`, { aspecto, formulario: form }, r.es_conforme);
    acumular(rArea, `${e.unidad?.nombre}|${r.seccion_nombre}`, { area: r.seccion_nombre, unidad: e.unidad?.nombre }, r.es_conforme);
    acumular(rFormulario, form, { formulario: form }, r.es_conforme);
  }

  // Alerta crítica: ventana móvil fija de 30 días (independiente del rango filtrado)
  const unidad = unidadEfectiva(sesion.perfil, filtros.unidad);
  const alertas = await leerTodo(() => {
    let q = db.from('v_alerta_critica_30d').select('*').order('porcentaje_incumplimiento', { ascending: false });
    if (unidad) q = q.eq('unidad_id', unidad);
    return q;
  });

  return {
    rango: { desde: filtros.desde, hasta: filtros.hasta },
    totales: { programadas: filas.length, ...estados, promedio, cumplimientoEjecucion },
    niveles,
    porFormulario: [...porForm.values()].map((f) => ({ formulario: f.formulario, ejecuciones: f.n, promedio: f.suma / f.n, estandar: f.estandar })).sort((a, b) => a.promedio - b.promedio),
    recurrencia: { porPregunta: top(rPregunta), porArea: top(rArea), porFormulario: top(rFormulario) },
    alertaCritica: alertas,
  };
}, { roles: [ROLES.ADMIN_APP, ROLES.ADMIN_REST] });
