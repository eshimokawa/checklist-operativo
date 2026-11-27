// Reglas de negocio puras: se usan en el servidor (fuente de verdad) y en el navegador (vista previa en vivo).

export const ZONA_HORARIA = 'America/Lima';

export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normaliza para comparar nombres de unidades ("TANTA LARCOMAR" = "Tanta Larco Mar"). */
export function claveCompacta(texto) {
  return normalizar(texto).replace(/[^a-z0-9]/g, '');
}

export function etiquetaCalificacion(pct) {
  if (pct === null || pct === undefined || Number.isNaN(Number(pct))) return null;
  const p = Number(pct);
  if (p >= 90) return 'Bueno';
  if (p >= 70) return 'Regular';
  return 'Deficiente';
}

export const COLORES_ETIQUETA = {
  Bueno: { fondo: '#2E7D32', claro: '#E8F5E9', texto: '#1B5E20' },
  Regular: { fondo: '#F59E0B', claro: '#FFF7E0', texto: '#8A5A00' },
  Deficiente: { fondo: '#C62828', claro: '#FDECEA', texto: '#8E1C1C' },
};

export function formatoPct(n) {
  if (n === null || n === undefined) return '-';
  return `${Number(n).toFixed(2)}%`;
}

/** "1°C a 4°C" -> {min:1,max:4}; "-18°C a -21°C" -> {min:-21,max:-18}; "≤ 25%" -> {min:null,max:25} */
export function parsearRango(texto) {
  if (!texto) return null;
  const t = String(texto).replace(/,/g, '.');
  const nums = (t.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  if (nums.length >= 2) return { min: Math.min(nums[0], nums[1]), max: Math.max(nums[0], nums[1]) };
  if (nums.length === 1) {
    if (/[<≤]|max|hasta|menor/i.test(t)) return { min: null, max: nums[0] };
    if (/[>≥]|min|desde|mayor/i.test(t)) return { min: nums[0], max: null };
    return { min: nums[0], max: nums[0] };
  }
  return null;
}

const RX_CONFORME = /^(si|sí|s|conforme|cumple|ok|bueno|correcto|aprobado|adecuado|limpio|operativo|yes|1)$/i;
const RX_NO_APLICA = /^(n\/?a|na|no aplica|no corresponde|-)$/i;

/** Sugiere qué opciones son conformes / no aplica (el administrador puede ajustarlo). */
export function inferirClasificacion(opciones = []) {
  const conformes = [];
  const noAplica = [];
  for (const o of opciones) {
    const n = normalizar(o);
    if (RX_NO_APLICA.test(n)) noAplica.push(o);
    else if (RX_CONFORME.test(n)) conformes.push(o);
  }
  return { conformes, noAplica };
}

export function campoEvaluacion(formulario) {
  return (formulario.campos || []).find((c) => c.rol === 'evaluacion') || null;
}
export function campoObservacion(formulario) {
  return (formulario.campos || []).find((c) => c.rol === 'observacion') || null;
}

function vacio(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

function aNumero(v) {
  if (vacio(v)) return null;
  const n = Number(String(v).replace(',', '.').replace('%', '').trim());
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Evalúa una respuesta de opción contra la clasificación del formulario.
 * Devuelve true (conforme), false (no conforme) o null (no aplica).
 */
export function evaluarOpcion(formulario, valor) {
  const conformes = (formulario.opciones_conformes || []).map(normalizar);
  const na = (formulario.opciones_no_aplica || []).map(normalizar);
  const v = normalizar(valor);
  if (na.includes(v)) return null;
  return conformes.includes(v);
}

/**
 * Evalúa un ítem (pregunta general o fila de trabajador/equipo).
 * item: { tipo:'pregunta'|'trabajador'|'equipo', parametro? }
 * entrada: { respuesta?, valores?:{}, observacion? }
 * Retorna { ok, error?, es_conforme, respuesta_seleccionada }
 */
export function evaluarItem(formulario, item, entrada = {}) {
  if (formulario.tipo_evaluacion === 'general') {
    const r = entrada.respuesta;
    if (vacio(r)) return { ok: false, error: 'Falta responder' };
    if (!(formulario.opciones_respuesta || []).includes(r)) return { ok: false, error: 'Opción no válida' };
    const es = evaluarOpcion(formulario, r);
    if (es === false && vacio(entrada.observacion)) return { ok: false, error: 'Registre el motivo del incumplimiento', es_conforme: es, respuesta_seleccionada: r };
    return { ok: true, es_conforme: es, respuesta_seleccionada: r };
  }

  const ce = campoEvaluacion(formulario);
  const co = campoObservacion(formulario);
  const valores = entrada.valores || {};
  if (!ce) return { ok: false, error: 'El formulario no tiene un campo de evaluación configurado' };

  // Campos obligatorios distintos a la evaluación/observación
  for (const c of formulario.campos || []) {
    if (c.origen !== 'usuario' || c.rol === 'evaluacion' || c.rol === 'observacion') continue;
    if (c.requerido && vacio(valores[c.clave])) return { ok: false, error: `Complete "${c.etiqueta}"` };
    if (c.tipo === 'opciones' && !vacio(valores[c.clave]) && !(c.opciones || []).includes(valores[c.clave])) {
      return { ok: false, error: `Opción no válida en "${c.etiqueta}"` };
    }
    if (c.tipo === 'numero' && !vacio(valores[c.clave]) && Number.isNaN(aNumero(valores[c.clave]))) {
      return { ok: false, error: `"${c.etiqueta}" debe ser numérico` };
    }
  }

  const bruto = valores[ce.clave];
  let es_conforme;
  let respuesta;
  const regla = ce.regla || { tipo: 'opciones' };

  if (ce.tipo === 'opciones' || regla.tipo === 'opciones') {
    if (vacio(bruto)) return { ok: false, error: `Seleccione "${ce.etiqueta}"` };
    const opciones = ce.opciones?.length ? ce.opciones : formulario.opciones_respuesta || [];
    if (!opciones.includes(bruto)) return { ok: false, error: `Opción no válida en "${ce.etiqueta}"` };
    es_conforme = evaluarOpcion(formulario, bruto);
    respuesta = bruto;
  } else {
    // Numérico
    const n = aNumero(bruto);
    const obsOpcion = co && !vacio(valores[co.clave]) ? valores[co.clave] : entrada.observacion;
    if (n === null) {
      // Sin lectura: solo se admite si se registra la causa (ej. "Inoperativo") -> No conforme
      if (vacio(obsOpcion)) return { ok: false, error: `Ingrese "${ce.etiqueta}"` };
      return { ok: true, es_conforme: false, respuesta_seleccionada: 'Sin lectura' };
    }
    if (Number.isNaN(n)) return { ok: false, error: `"${ce.etiqueta}" debe ser numérico` };
    let rango = null;
    if (regla.tipo === 'rango_parametro') rango = parsearRango(item.parametro);
    else if (regla.tipo === 'max') rango = { min: null, max: Number(regla.valor) };
    else if (regla.tipo === 'min') rango = { min: Number(regla.valor), max: null };
    else if (regla.tipo === 'rango') rango = { min: Number(regla.min), max: Number(regla.max) };
    if (!rango) es_conforme = null; // sin parámetro configurado: no se califica
    else es_conforme = (rango.min === null || n >= rango.min) && (rango.max === null || n <= rango.max);
    respuesta = `${n}${ce.unidad ? ' ' + ce.unidad : ''}`;
  }

  const obs = co ? valores[co.clave] : entrada.observacion;
  if (es_conforme === false && vacio(obs)) {
    return { ok: false, error: 'Registre la observación y acción correctiva', es_conforme, respuesta_seleccionada: respuesta };
  }
  return { ok: true, es_conforme, respuesta_seleccionada: respuesta };
}

/** Calificación (%) = conformes / aplicables (excluye No Aplica) * 100 */
export function calcularCalificacion(items) {
  let conformes = 0;
  let aplicables = 0;
  const secciones = new Map();
  for (const it of items) {
    const s = it.seccion_nombre || 'General';
    if (!secciones.has(s)) secciones.set(s, { conformes: 0, aplicables: 0 });
    if (it.es_conforme === null || it.es_conforme === undefined) continue;
    aplicables += 1;
    secciones.get(s).aplicables += 1;
    if (it.es_conforme) {
      conformes += 1;
      secciones.get(s).conformes += 1;
    }
  }
  const pct = aplicables ? Math.round((conformes / aplicables) * 10000) / 100 : 100;
  const porSeccion = {};
  for (const [k, v] of secciones) {
    porSeccion[k] = v.aplicables ? Math.round((v.conformes / v.aplicables) * 10000) / 100 : null;
  }
  return { pct, etiqueta: etiquetaCalificacion(pct), conformes, aplicables, porSeccion };
}

/** Fecha y hora "YYYY-MM-DD HH:mm:ss" en la zona horaria del negocio */
export function fechaHoraLocal(fecha, tz = ZONA_HORARIA) {
  if (!fecha) return '';
  const d = new Date(fecha);
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(d).replace('T', ' ');
}

export function fechaLocal(fecha = new Date(), tz = ZONA_HORARIA) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(fecha));
}

export function horaLocal(fecha, tz = ZONA_HORARIA) {
  if (!fecha) return '';
  return new Intl.DateTimeFormat('es-PE', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(fecha));
}

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Convierte texto libre de días ("Lunes a Viernes", "L,M,X", "Todos los días", "1,3,5") en ISO [1..7] */
export function parsearDias(texto) {
  if (Array.isArray(texto)) return [...new Set(texto.map(Number).filter((n) => n >= 1 && n <= 7))].sort();
  const t = normalizar(texto);
  if (!t) return [];
  if (/(todos|diario|todos los dias|lunes a domingo|l-d)/.test(t)) return [1, 2, 3, 4, 5, 6, 7];
  const mapa = [
    [1, ['lunes', 'lun', 'lu', 'l']], [2, ['martes', 'mar', 'ma', 'm']], [3, ['miercoles', 'mie', 'mi', 'x']],
    [4, ['jueves', 'jue', 'ju', 'j']], [5, ['viernes', 'vie', 'vi', 'v']], [6, ['sabado', 'sab', 'sa', 's']],
    [7, ['domingo', 'dom', 'do', 'd']],
  ];
  const aDia = (tok) => {
    tok = tok.trim();
    if (/^[1-7]$/.test(tok)) return Number(tok);
    for (const [n, alias] of mapa) if (alias.includes(tok)) return n;
    return null;
  };
  const dias = new Set();
  // Rangos "lunes a viernes" / "lun-vie"
  const rango = t.match(/^([a-z0-9]+)\s*(?:a|-|al|hasta)\s*([a-z0-9]+)$/);
  if (rango && aDia(rango[1]) && aDia(rango[2])) {
    let a = aDia(rango[1]);
    const b = aDia(rango[2]);
    for (let i = 0; i < 7; i++) {
      dias.add(a);
      if (a === b) break;
      a = (a % 7) + 1;
    }
    return [...dias].sort();
  }
  for (const tok of t.split(/[,;/\s]+|\by\b/)) {
    const d = aDia(tok);
    if (d) dias.add(d);
  }
  return [...dias].sort();
}

export function diasATexto(dias = []) {
  const s = [...dias].map(Number).sort();
  if (s.length === 7) return 'Todos los días';
  if (s.join(',') === '1,2,3,4,5') return 'Lunes a Viernes';
  return s.map((d) => DIAS[d - 1]).join(', ');
}
