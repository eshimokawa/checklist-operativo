// Precarga formularios desde un Excel (mismo parser que el Módulo de Configuración).
// Uso: node scripts/seed-formularios.mjs "<ruta.xlsx>" "<código o nombre de unidad>"
// Ej.: node scripts/seed-formularios.mjs "plantillas/Datos formularios.xlsx" "LA MAR"
// Los formularios quedan activos; luego asigne responsable y frecuencia en Configuración > Asignaciones.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { leerLibro } from '../lib/excel/leer.js';
import { analizarLibro } from '../lib/excel/formularios.js';
import { claveCompacta, normalizar } from '../lib/negocio.js';

for (const f of ['.env.local', '.env']) {
  if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const [ruta, unidadTxt] = process.argv.slice(2);
if (!ruta || !unidadTxt) { console.error('Uso: node scripts/seed-formularios.mjs <archivo.xlsx> <unidad>'); process.exit(1); }
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ok = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };

const unidades = ok(await db.from('unidades').select('id,codigo,nombre'));
const unidad = unidades.find((u) => [claveCompacta(u.codigo), claveCompacta(u.nombre)].includes(claveCompacta(unidadTxt)));
if (!unidad) { console.error(`Unidad no encontrada: ${unidadTxt}`); process.exit(1); }

const defs = analizarLibro(await leerLibro(fs.readFileSync(ruta)));
for (const d of defs) {
  if (d.error) { console.warn(`✖ ${d.hoja}: ${d.error}`); continue; }
  if ((d.tipo_evaluacion === 'general' || d.campos.find((c) => c.rol === 'evaluacion')?.tipo === 'opciones') && !d.opciones_conformes.length) {
    console.warn(`✖ ${d.hoja}: no se identificaron opciones conformes; cárguelo desde la interfaz.`); continue;
  }
  const fila = {
    codigo: d.codigo, nombre: d.nombre, unidad_id: unidad.id, tipo_evaluacion: d.tipo_evaluacion, estandar_porcentaje: d.estandar_porcentaje,
    opciones_respuesta: d.opciones_respuesta, opciones_conformes: d.opciones_conformes, opciones_no_aplica: d.opciones_no_aplica,
    campos: d.campos, aspectos_informativos: d.aspectos_informativos, origen_archivo: `${ruta} › ${d.hoja}`, activo: true,
  };
  const ex = ok(await db.from('formularios').select('id').eq('unidad_id', unidad.id).ilike('codigo', d.codigo).maybeSingle());
  const id = ex ? (ok(await db.from('formularios').update(fila).eq('id', ex.id)), ex.id) : ok(await db.from('formularios').insert(fila).select('id').single()).id;

  if (d.tipo_evaluacion === 'general') {
    ok(await db.from('formulario_preguntas').delete().eq('formulario_id', id));
    ok(await db.from('formulario_secciones').delete().eq('formulario_id', id));
    let orden = 0;
    for (const [i, s] of d.secciones.entries()) {
      const sec = ok(await db.from('formulario_secciones').insert({ formulario_id: id, nombre: s.nombre, orden: i }).select('id').single());
      ok(await db.from('formulario_preguntas').insert(s.preguntas.map((p) => ({ formulario_id: id, seccion_id: sec.id, subcategoria: p.subcategoria, texto: p.texto, es_punto_critico: p.es_punto_critico, orden: orden++ }))));
    }
  }
  if (d.tipo_evaluacion === 'equipos' && d.equipos.length) {
    ok(await db.from('formulario_equipos').delete().eq('formulario_id', id));
    const areas = ok(await db.from('areas_trabajo').select('id,descripcion_area').eq('unidad_id', unidad.id));
    const vinc = [];
    for (const [i, e] of d.equipos.entries()) {
      let area = areas.find((a) => normalizar(a.descripcion_area) === normalizar(e.area));
      if (!area && e.area) { area = ok(await db.from('areas_trabajo').insert({ descripcion_area: e.area, unidad_id: unidad.id }).select().single()); areas.push(area); }
      const reg = { codigo_equipo: e.codigo_equipo, descripcion_equipo: e.descripcion_equipo, tipo_equipo: e.tipo_equipo, unidad_id: unidad.id, area_trabajo_id: area?.id || null };
      if (e.temperatura_funcionamiento) reg.temperatura_funcionamiento = e.temperatura_funcionamiento;
      const eq = ok(await db.from('equipos').select('id').eq('unidad_id', unidad.id).ilike('codigo_equipo', e.codigo_equipo).maybeSingle());
      const eqId = eq ? (ok(await db.from('equipos').update(reg).eq('id', eq.id)), eq.id) : ok(await db.from('equipos').insert(reg).select('id').single()).id;
      if (!vinc.some((v) => v.equipo_id === eqId)) vinc.push({ formulario_id: id, equipo_id: eqId, orden: i });
    }
    ok(await db.from('formulario_equipos').insert(vinc));
  }
  console.log(`✔ ${d.codigo} - ${d.nombre} (${d.tipo_evaluacion}) → ${unidad.nombre}`);
}
