import ExcelJS from 'exceljs';
import { ruta, ROLES } from '@/lib/api';
import { buscarEjecuciones, leerFiltros, respuestasDe } from '@/lib/consultas';
import { estilizarEncabezado } from '@/lib/excel/leer';
import { fechaHoraLocal, fechaLocal } from '@/lib/negocio';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COLOR_NIVEL = { Bueno: 'FFE8F5E9', Regular: 'FFFFF7E0', Deficiente: 'FFFDECEA' };

export const GET = ruta(async ({ req, sesion, db }) => {
  const filtros = leerFiltros(req);
  const filas = await buscarEjecuciones(db, sesion.perfil, filtros);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Check List Operativo';
  wb.created = new Date();

  const h = wb.addWorksheet('Historial', { views: [{ state: 'frozen', ySplit: 1 }] });
  h.columns = [
    { header: 'Fecha programada', key: 'fp', width: 14 }, { header: 'Código', key: 'cod', width: 12 },
    { header: 'Formulario', key: 'form', width: 42 }, { header: 'Unidad', key: 'uni', width: 20 },
    { header: 'Área', key: 'area', width: 18 }, { header: 'Auditado', key: 'aud', width: 34 },
    { header: 'Responsable / Auditor', key: 'resp', width: 26 }, { header: 'Estado', key: 'est', width: 12 },
    { header: 'Ventana', key: 'ven', width: 14 }, { header: 'Inicio', key: 'ini', width: 20 },
    { header: 'Registro', key: 'reg', width: 20 }, { header: 'Tiempo (min)', key: 'tie', width: 12 },
    { header: 'Calificación (%)', key: 'cal', width: 15 }, { header: 'Nivel', key: 'niv', width: 12 },
    { header: 'Estándar (%)', key: 'std', width: 12 }, { header: 'Fuera de plazo', key: 'fdp', width: 13 },
    { header: 'Correo enviado', key: 'cor', width: 13 },
  ];
  estilizarEncabezado(h.getRow(1));
  for (const e of filas) {
    const r = h.addRow({
      fp: e.fecha_programada, cod: e.formulario?.codigo, form: e.formulario?.nombre, uni: e.unidad?.nombre,
      area: e.area?.descripcion_area || 'Todas', aud: e.auditado_descripcion || '', resp: e.auditor?.nombre_completo,
      est: e.estado,
      ven: `${fechaHoraLocal(e.ventana_inicio).slice(11, 16)} - ${fechaHoraLocal(e.ventana_fin).slice(11, 16)}`,
      ini: fechaHoraLocal(e.fecha_hora_inicio), reg: fechaHoraLocal(e.fecha_hora_registro),
      tie: e.tiempo_ejecucion_minutos ?? null,
      cal: e.calificacion_porcentaje !== null ? Number(e.calificacion_porcentaje) : null,
      niv: e.etiqueta_calificacion || '', std: Number(e.formulario?.estandar_porcentaje || 0),
      fdp: e.estado === 'Finalizado' ? (e.completado_fuera_plazo ? 'Sí' : 'No') : '',
      cor: e.correo_enviado ? 'Sí' : 'No',
    });
    if (e.etiqueta_calificacion) r.getCell('niv').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NIVEL[e.etiqueta_calificacion] } };
    r.getCell('cal').numFmt = '0.00';
  }
  h.autoFilter = { from: 'A1', to: 'Q1' };

  const d = wb.addWorksheet('Respuestas', { views: [{ state: 'frozen', ySplit: 1 }] });
  d.columns = [
    { header: 'Fecha registro', key: 'f', width: 20 }, { header: 'Formulario', key: 'form', width: 40 },
    { header: 'Unidad', key: 'uni', width: 18 }, { header: 'Sección / Área', key: 'sec', width: 22 },
    { header: 'Subcategoría', key: 'sub', width: 22 }, { header: 'Ítem / Trabajador / Equipo', key: 'item', width: 46 },
    { header: 'Respuesta', key: 'resp', width: 16 }, { header: 'Conformidad', key: 'conf', width: 14 },
    { header: 'Observación y acción correctiva', key: 'obs', width: 46 }, { header: 'Datos adicionales', key: 'extra', width: 40 },
    { header: 'Auditor', key: 'aud', width: 24 },
  ];
  estilizarEncabezado(d.getRow(1));
  const fin = filas.filter((e) => e.estado === 'Finalizado');
  const porId = new Map(fin.map((e) => [e.id, e]));
  const respuestas = await respuestasDe(db, fin.map((e) => e.id));
  for (const r of respuestas) {
    const e = porId.get(r.ejecucion_id);
    const extra = Object.entries(r.valores || {})
      .filter(([k, v]) => v !== '' && v !== null && !/observ/i.test(k))
      .map(([k, v]) => `${k.replace(/^_/, '').replace(/_/g, ' ')}: ${v}`).join(' | ');
    const fila = d.addRow({
      f: fechaHoraLocal(e.fecha_hora_registro), form: `${e.formulario?.codigo} - ${e.formulario?.nombre}`, uni: e.unidad?.nombre,
      sec: r.seccion_nombre, sub: r.subcategoria || '', item: r.item_descripcion, resp: r.respuesta_seleccionada,
      conf: r.es_conforme === null ? 'No aplica' : r.es_conforme ? 'Conforme' : 'No conforme',
      obs: r.observacion_accion_correctiva || '', extra, aud: e.auditor?.nombre_completo,
    });
    if (r.es_conforme === false) fila.getCell('conf').font = { color: { argb: 'FFC62828' }, bold: true };
  }
  d.autoFilter = { from: 'A1', to: 'K1' };

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reporte_checklists_${fechaLocal()}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}, { roles: [ROLES.ADMIN_APP, ROLES.ADMIN_REST] });
