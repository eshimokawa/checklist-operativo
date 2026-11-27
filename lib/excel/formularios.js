// Parser flexible de formularios Excel.
// Soporta:
//  (a) Formularios de tabla (personal / equipos) con fila de marcadores "Precompletado" / "A completar por usuario",
//      fila de encabezados y celdas "Desplegable con opciones: - A - B".
//  (b) Formularios generales: columnas Sección | Subcategoría | Pregunta/Aspecto | Punto crítico | Opciones.
//  (c) Metadatos opcionales en las primeras filas: "Código:", "Nombre:", "Tipo:", "Estándar:".
import { normalizar, inferirClasificacion } from '../negocio.js';

const RX = {
  marcador: /(precompletado|a completar)/,
  desplegable: /(desplegable|opciones\s*:)/,
  area: /^(area|zona|area de trabajo|zona de trabajo|seccion|seccion\/area|area\/seccion|ambiente)$/,
  codigo: /(^codigo|numero de equipo|n° de equipo|nro\.? de equipo|^cod\.?$|codigo de equipo)/,
  descripcion: /^(descripcion|descripcion del equipo|equipo|descripcion equipo)$/,
  parametro: /(parametro|rango|temperatura de funcionamiento|temp\.? de funcionamiento)/,
  tipo_equipo: /tipo de equipo/,
  colaborador: /^(colaborador|trabajador|nombre|nombre completo|personal|nombres y apellidos)$/,
  marca: /^marca$/,
  subcategoria: /(subcategoria|sub categoria|categoria|sub ?area|subseccion)/,
  pregunta: /(pregunta|aspecto|item|criterio|actividad|punto a evaluar|requisito)/,
  punto_critico: /(punto critico|critico|^pc$)/,
  opciones: /(opciones|respuestas posibles|alternativas)/,
  observacion: /observaci/,
  evaluacion: /(revision|evaluacion|resultado|conformidad|cumple|calificacion|verificacion)/,
  numerico: /(temperatura|%|porcentaje|dias|cantidad|lectura|valor|medicion|grados)/,
  temperatura_real: /(temperatura real|lectura|temperatura medida)/,
  polares: /(compuestos polares|% ?cp|polar)/,
};

const META = {
  codigo: /^(codigo|codigo del formulario|codigo formulario)\s*:?\s*(.*)$/,
  nombre: /^(nombre|nombre del formulario|formulario|titulo)\s*:?\s*(.*)$/,
  tipo: /^(tipo|tipo de evaluacion|tipo evaluacion)\s*:?\s*(.*)$/,
  estandar: /^(estandar|estandar \(%\)|estandar %|meta)\s*:?\s*(.*)$/,
};

function str(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

export function slug(t) {
  return normalizar(t).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'campo';
}

/** "Desplegable con opciones:\n- A\n- B" | "SI / NO / N/A" -> ["A","B"] */
export function extraerOpciones(texto) {
  const t = str(texto);
  if (!t) return [];
  let cuerpo = t;
  const idx = t.indexOf(':');
  if (RX.desplegable.test(normalizar(t)) && idx >= 0) cuerpo = t.slice(idx + 1);
  let partes;
  if (/\n/.test(cuerpo)) partes = cuerpo.split(/\n/);
  else if (/\s-\s/.test(cuerpo) || /^\s*-/.test(cuerpo)) partes = cuerpo.split(/(?:^|\s)-\s/);
  else partes = cuerpo.split(/[\/;|,]/);
  const salida = [];
  for (let p of partes) {
    p = p.replace(/^\s*[-•*·]\s*/, '').trim();
    // Conserva "N/A" aunque el separador sea "/"
    if (p && !salida.includes(p)) salida.push(p);
  }
  // Reconstruye N/A si se partió como "N" y "A"
  const iN = salida.findIndex((x) => x.toUpperCase() === 'N');
  if (iN >= 0 && salida[iN + 1]?.toUpperCase() === 'A') salida.splice(iN, 2, 'N/A');
  return salida;
}

function codigoSugerido(nombre) {
  const pal = normalizar(nombre).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  return (pal.slice(0, 4).map((w) => w[0]).join('') || 'FRM').toUpperCase();
}

function esMarcadorFila(fila) {
  const celdas = fila.map(str).filter(Boolean);
  if (!celdas.length) return false;
  return celdas.filter((c) => RX.marcador.test(normalizar(c))).length >= Math.ceil(celdas.length / 2);
}

function puntaje(fila) {
  let p = 0;
  for (const c of fila.map((x) => normalizar(str(x)))) {
    if (!c) continue;
    for (const k of ['area', 'codigo', 'descripcion', 'parametro', 'tipo_equipo', 'colaborador', 'subcategoria', 'pregunta', 'observacion', 'evaluacion', 'punto_critico']) {
      if (RX[k].test(c)) { p += 2; break; }
    }
    p += 0.1;
  }
  return p;
}

function esVerdadero(v) {
  return /^(si|sí|x|1|true|verdadero|pc|critico|crítico|s)$/i.test(normalizar(str(v)));
}

/** Analiza una hoja. Devuelve la definición del formulario lista para revisar y guardar. */
export function analizarHoja(hoja) {
  const filas = hoja.filas || [];
  const advertencias = [];
  const meta = {};

  // 1) Metadatos en las primeras filas
  for (let i = 0; i < Math.min(15, filas.length); i++) {
    const f = filas[i] || [];
    for (let c = 0; c < f.length; c++) {
      const celda = normalizar(str(f[c]));
      for (const [k, rx] of Object.entries(META)) {
        const m = celda.match(rx);
        if (m && /:/.test(str(f[c])) ) {
          const enLinea = str(f[c]).split(':').slice(1).join(':').trim();
          const val = enLinea || str(f[c + 1]);
          if (val && !meta[k]) meta[k] = val;
        }
      }
    }
  }

  // 2) Fila de marcadores y fila de encabezados
  let iMarc = -1;
  for (let i = 0; i < Math.min(20, filas.length); i++) if (esMarcadorFila(filas[i] || [])) { iMarc = i; break; }
  let iEnc = -1;
  if (iMarc >= 0) iEnc = iMarc + 1;
  else {
    let mejor = 0;
    for (let i = 0; i < Math.min(20, filas.length); i++) {
      const p = puntaje(filas[i] || []);
      if (p > mejor && (filas[i] || []).filter((x) => str(x)).length >= 2) { mejor = p; iEnc = i; }
    }
  }
  if (iEnc < 0 || !filas[iEnc]) {
    return { hoja: hoja.nombre, error: 'No se encontró la fila de encabezados.' };
  }
  const encabezados = filas[iEnc].map(str);
  const marcadores = iMarc >= 0 ? (filas[iMarc] || []).map((x) => normalizar(str(x))) : [];
  const datos = filas.slice(iEnc + 1).filter((f) => (f || []).some((x) => str(x)));

  const col = {};
  encabezados.forEach((h, i) => {
    const n = normalizar(h);
    if (!n) return;
    for (const k of ['codigo', 'tipo_equipo', 'parametro', 'colaborador', 'marca', 'subcategoria', 'punto_critico', 'opciones', 'observacion', 'pregunta', 'descripcion', 'area']) {
      if (col[k] === undefined && RX[k].test(n)) {
        // "Descripción" en un formulario general puede ser la pregunta
        col[k] = i;
        break;
      }
    }
  });

  // Opciones por columna (celdas "Desplegable con opciones")
  const opcionesCol = {};
  encabezados.forEach((_, i) => {
    for (const f of datos) {
      const v = str(f[i]);
      if (v && RX.desplegable.test(normalizar(v))) { opcionesCol[i] = extraerOpciones(v); break; }
    }
  });

  // 3) Tipo de evaluación
  let tipo = null;
  const metaTipo = normalizar(meta.tipo || '');
  if (/trabajador|personal/.test(metaTipo)) tipo = 'trabajadores';
  else if (/equipo/.test(metaTipo)) tipo = 'equipos';
  else if (/general|infraestructura/.test(metaTipo)) tipo = 'general';
  else if (col.pregunta !== undefined && col.codigo === undefined && col.colaborador === undefined) tipo = 'general';
  else if (col.codigo !== undefined) tipo = 'equipos';
  else if (col.colaborador !== undefined) tipo = 'trabajadores';
  else tipo = 'general';

  const nombre = meta.nombre || hoja.nombre;
  const base = {
    hoja: hoja.nombre,
    codigo: meta.codigo || codigoSugerido(nombre),
    nombre,
    tipo_evaluacion: tipo,
    estandar_porcentaje: Number(String(meta.estandar || '').replace('%', '').replace(',', '.')) || 0,
    opciones_respuesta: [],
    opciones_conformes: [],
    opciones_no_aplica: [],
    campos: [],
    aspectos_informativos: [],
    secciones: [],
    equipos: [],
    advertencias,
  };

  if (tipo === 'general') return analizarGeneral(base, encabezados, datos, col, opcionesCol);
  return analizarTabla(base, encabezados, marcadores, datos, col, opcionesCol);
}

function analizarGeneral(base, encabezados, datos, col, opcionesCol) {
  const iPreg = col.pregunta ?? col.descripcion;
  if (iPreg === undefined) {
    base.error = 'No se encontró la columna de preguntas/aspectos (ej. "Pregunta", "Aspecto a evaluar").';
    return base;
  }
  const iSec = col.area; // "Sección" o "Área"
  const secciones = [];
  let secActual = null;
  let subActual = null;
  let opciones = Object.values(opcionesCol)[0] || [];
  for (const f of datos) {
    const preg = str(f[iPreg]);
    const sec = iSec !== undefined ? str(f[iSec]) : '';
    const sub = col.subcategoria !== undefined ? str(f[col.subcategoria]) : '';
    if (sec) { secActual = sec; subActual = null; }
    if (sub) subActual = sub;
    if (!preg || RX.desplegable.test(normalizar(preg))) continue;
    const nombreSec = secActual || base.nombre;
    let s = secciones.find((x) => x.nombre === nombreSec);
    if (!s) { s = { nombre: nombreSec, preguntas: [] }; secciones.push(s); }
    s.preguntas.push({
      subcategoria: subActual || null,
      texto: preg,
      es_punto_critico: col.punto_critico !== undefined ? esVerdadero(f[col.punto_critico]) : false,
    });
    if (!opciones.length && col.opciones !== undefined && str(f[col.opciones])) opciones = extraerOpciones(f[col.opciones]);
  }
  if (!opciones.length) base.advertencias.push('No se encontraron opciones de respuesta en el Excel: defínalas antes de guardar.');
  const { conformes, noAplica } = inferirClasificacion(opciones);
  Object.assign(base, {
    secciones,
    opciones_respuesta: opciones,
    opciones_conformes: conformes,
    opciones_no_aplica: noAplica,
  });
  const total = secciones.reduce((a, s) => a + s.preguntas.length, 0);
  if (!total) base.error = 'El formulario no tiene preguntas.';
  return base;
}

const FUENTES = {
  area: 'area',
  codigo: 'codigo_equipo',
  descripcion: 'descripcion_equipo',
  parametro: 'temperatura_funcionamiento',
  tipo_equipo: 'tipo_equipo',
  colaborador: 'nombre_completo',
  marca: 'marca',
};

function analizarTabla(base, encabezados, marcadores, datos, col, opcionesCol) {
  const campos = [];
  const usadas = new Set();
  const fuentePorIndice = {};
  for (const [k, fuente] of Object.entries(FUENTES)) if (col[k] !== undefined) fuentePorIndice[col[k]] = fuente;

  encabezados.forEach((h, i) => {
    if (!h || usadas.has(slug(h))) return;
    usadas.add(slug(h));
    const n = normalizar(h);
    const marcador = marcadores[i] || '';
    const esUsuario = marcador ? /a completar/.test(marcador) : !fuentePorIndice[i];
    if (!esUsuario) {
      campos.push({ clave: slug(h), etiqueta: h, origen: 'precompletado', fuente: fuentePorIndice[i] || null, tipo: 'texto', rol: 'dato' });
      return;
    }
    const opciones = opcionesCol[i] || [];
    const tipo = opciones.length ? 'opciones' : RX.numerico.test(n) ? 'numero' : 'texto';
    const campo = {
      clave: slug(h), etiqueta: h, origen: 'usuario', tipo, opciones,
      rol: RX.observacion.test(n) ? 'observacion' : 'dato',
      requerido: tipo !== 'texto' && !RX.observacion.test(n),
    };
    if (/temperatura/.test(n)) campo.unidad = '°C';
    if (/%|porcentaje/.test(n)) campo.unidad = '%';
    campos.push(campo);
  });

  // Elegir campo de evaluación
  const usuario = campos.filter((c) => c.origen === 'usuario' && c.rol !== 'observacion');
  const tieneParametro = campos.some((c) => c.fuente === 'temperatura_funcionamiento');
  let ev =
    usuario.find((c) => c.tipo === 'opciones' && RX.evaluacion.test(normalizar(c.etiqueta))) ||
    usuario.find((c) => c.tipo === 'numero' && tieneParametro && RX.temperatura_real.test(normalizar(c.etiqueta))) ||
    usuario.find((c) => c.tipo === 'numero' && RX.polares.test(normalizar(c.etiqueta))) ||
    usuario.find((c) => c.tipo === 'opciones' && inferirClasificacion(c.opciones).conformes.length) ||
    usuario.find((c) => c.tipo === 'numero' && tieneParametro);
  if (ev) {
    ev.rol = 'evaluacion';
    ev.requerido = true;
    if (ev.tipo === 'opciones') ev.regla = { tipo: 'opciones' };
    else if (RX.polares.test(normalizar(ev.etiqueta))) {
      ev.regla = { tipo: 'max', valor: 25 };
      base.advertencias.push('Regla sugerida: % de compuestos polares ≤ 25 % = Conforme. Ajústela si su estándar es distinto.');
    } else ev.regla = { tipo: 'rango_parametro' };
  } else {
    base.advertencias.push('No se identificó el campo de evaluación: marque uno como "Evaluación" antes de guardar.');
  }

  // Columna de observaciones obligatoria
  if (!campos.some((c) => c.rol === 'observacion')) {
    campos.push({ clave: 'observacion', etiqueta: 'Observaciones y acción correctiva', origen: 'usuario', tipo: 'texto', opciones: [], rol: 'observacion', requerido: false });
  }

  // Opciones de respuesta del formulario
  if (ev?.tipo === 'opciones') {
    const { conformes, noAplica } = inferirClasificacion(ev.opciones);
    base.opciones_respuesta = ev.opciones;
    base.opciones_conformes = conformes;
    base.opciones_no_aplica = noAplica;
  }

  // Equipos precompletados
  if (base.tipo_evaluacion === 'equipos') {
    const iCod = col.codigo;
    for (const f of datos) {
      const cod = str(f[iCod]);
      if (!cod || RX.desplegable.test(normalizar(cod))) continue;
      const desc = col.descripcion !== undefined ? str(f[col.descripcion]) : '';
      const tipoEq = col.tipo_equipo !== undefined ? str(f[col.tipo_equipo]) : '';
      base.equipos.push({
        codigo_equipo: cod,
        descripcion_equipo: desc || tipoEq || cod,
        tipo_equipo: tipoEq || null,
        area: col.area !== undefined ? str(f[col.area]) : '',
        temperatura_funcionamiento: col.parametro !== undefined ? str(f[col.parametro]) || null : null,
      });
    }
    if (!base.equipos.length) base.advertencias.push('El Excel no lista equipos: se usarán todos los equipos activos de la sede/área.');
  }
  base.campos = campos;
  return base;
}

export function analizarLibro(hojas) {
  return hojas.map(analizarHoja).filter((h) => h && (h.error || h.secciones?.length || h.campos?.length));
}
