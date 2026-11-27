import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { COLORES_ETIQUETA } from './negocio';
import { agruparRespuestas, resumen } from './reporte';

const MARCA = { ciruela: '#870064', titulo: '#71255E', texto: '#534A4B', rojo: '#D7282F', grisClaro: '#EEEEEE', fila: '#F6F4F6' };
const FUENTES_DIR = path.join(process.cwd(), 'assets', 'fonts');
const LOGO = path.join(process.cwd(), 'public', 'logo.png');

function registrarFuentes(doc) {
  try {
    doc.registerFont('R', path.join(FUENTES_DIR, 'Raleway_400Regular.ttf'));
    doc.registerFont('RS', path.join(FUENTES_DIR, 'Raleway_600SemiBold.ttf'));
    doc.registerFont('RB', path.join(FUENTES_DIR, 'Raleway_700Bold.ttf'));
  } catch {
    doc.registerFont('R', 'Helvetica');
    doc.registerFont('RS', 'Helvetica-Bold');
    doc.registerFont('RB', 'Helvetica-Bold');
  }
}

/** Texto de detalle de una fila (datos precompletados y campos adicionales) */
function detalleItem(r, formulario) {
  const v = r.valores || {};
  const partes = [];
  if (v._parametro) partes.push(`Parámetro: ${v._parametro}`);
  for (const c of formulario.campos || []) {
    if (c.origen !== 'usuario' || c.rol !== 'dato') continue;
    const x = v[c.clave];
    if (x !== undefined && x !== null && String(x).trim() !== '') partes.push(`${c.etiqueta}: ${x}${c.unidad && c.tipo === 'numero' ? ' ' + c.unidad : ''}`);
  }
  return partes.join('  ·  ');
}

/** Genera el PDF del check list. Devuelve Buffer. */
export function generarPDF(rep) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: rep.formulario.nombre, Author: 'Check List Operativo' } });
    const partes = [];
    doc.on('data', (d) => partes.push(d));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
    registrarFuentes(doc);

    const R = resumen(rep);
    const ancho = doc.page.width - 80;
    const x0 = 40;
    const limite = () => doc.page.height - 60;
    const asegurar = (alto) => { if (doc.y + alto > limite()) doc.addPage(); };

    // ---- Encabezado
    if (fs.existsSync(LOGO)) doc.image(LOGO, x0, 32, { height: 34 });
    doc.font('RB').fontSize(15).fillColor(MARCA.titulo).text(R.formulario, x0, 76, { width: ancho });
    doc.moveDown(0.3);
    doc.font('R').fontSize(9.5).fillColor(MARCA.texto);
    const filasMeta = [
      [['Ubicación', R.ubicacion], ['Fecha', R.fecha]],
      [['Auditor', R.auditor], ['Tiempo de ejecución', R.tiempo]],
      [['Estándar', R.estandar], null],
      [['Auditado', R.auditado]],
    ];
    let yMeta = doc.y;
    for (const fila of filasMeta) {
      const anchoCol = fila.length === 1 ? ancho : ancho / 2 - 8;
      let alto = 0;
      fila.forEach((celda, i) => {
        if (!celda) return;
        const [k, v] = celda;
        doc.font('RS').fontSize(9.5).fillColor(MARCA.texto)
          .text(`${k}: `, x0 + i * (ancho / 2), yMeta, { continued: true, width: anchoCol })
          .font('R').text(v || '-');
        alto = Math.max(alto, doc.y - yMeta);
      });
      yMeta += alto + 3;
    }
    doc.y = yMeta + 8;

    // ---- Banner de calificación
    const color = COLORES_ETIQUETA[R.etiqueta] || COLORES_ETIQUETA.Deficiente;
    const yB = doc.y;
    doc.roundedRect(x0, yB, ancho, 40, 12).fill(color.fondo);
    doc.font('RB').fontSize(15).fillColor('#FFFFFF')
      .text(`Calificación: ${R.calificacionNum.toFixed(2)}% (${R.etiqueta})`, x0, yB + 12, { width: ancho, align: 'center' });
    doc.y = yB + 54;

    // ---- Secciones
    const colIzq = ancho * 0.56;
    const colDer = ancho - colIzq;
    const pad = 6;
    for (const s of agruparRespuestas(rep.respuestas)) {
      asegurar(60);
      const yS = doc.y;
      doc.rect(x0, yS, ancho, 22).fill(MARCA.rojo);
      doc.font('RB').fontSize(10.5).fillColor('#FFFFFF')
        .text(s.nombre, x0 + 8, yS + 6, { width: ancho - 110, lineBreak: false, ellipsis: true })
        .text(s.pct === null ? 'N/A' : `${s.pct.toFixed(2)}%`, x0 + ancho - 100, yS + 6, { width: 92, align: 'right' });
      doc.y = yS + 22;

      for (const g of s.subgrupos) {
        if (g.nombre) {
          asegurar(40);
          const yG = doc.y;
          doc.rect(x0, yG, ancho, 18).fill(MARCA.grisClaro);
          doc.font('RB').fontSize(9.5).fillColor('#333333').text(g.nombre, x0 + 8, yG + 4.5, { width: ancho - 16 });
          doc.y = yG + 18;
        }
        g.items.forEach((r, i) => {
          const izq = r.item_descripcion || '-';
          const det = detalleItem(r, rep.formulario);
          const resp = r.respuesta_seleccionada || '-';
          const obs = r.observacion_accion_correctiva ? `Obs.: ${r.observacion_accion_correctiva}` : '';
          doc.font('RS').fontSize(9);
          let hIzq = doc.heightOfString(izq, { width: colIzq - pad * 2 });
          if (det) { doc.font('R').fontSize(8); hIzq += doc.heightOfString(det, { width: colIzq - pad * 2 }) + 2; }
          doc.font('RB').fontSize(9);
          let hDer = doc.heightOfString(resp, { width: colDer - pad * 2 });
          if (obs) { doc.font('R').fontSize(8.5); hDer += doc.heightOfString(obs, { width: colDer - pad * 2 }) + 2; }
          const alto = Math.max(hIzq, hDer) + pad * 2;
          asegurar(alto);
          const y = doc.y;
          doc.rect(x0, y, ancho, alto).fill(i % 2 === 0 ? '#FFFFFF' : MARCA.fila);
          // izquierda
          doc.font('RS').fontSize(9).fillColor(MARCA.texto).text(izq, x0 + pad, y + pad, { width: colIzq - pad * 2 });
          if (det) doc.font('R').fontSize(8).fillColor('#7A7272').text(det, { width: colIzq - pad * 2 });
          // derecha
          const cResp = r.es_conforme === false ? '#C62828' : r.es_conforme === true ? '#2E7D32' : '#6B6B6B';
          doc.font('RB').fontSize(9).fillColor(cResp).text(resp, x0 + colIzq + pad, y + pad, { width: colDer - pad * 2 });
          if (obs) doc.font('R').fontSize(8.5).fillColor('#8E1C1C').text(obs, { width: colDer - pad * 2 });
          doc.y = y + alto;
        });
      }
      doc.moveDown(0.8);
    }

    // ---- Firmas
    asegurar(130);
    doc.moveDown(0.5);
    doc.font('RB').fontSize(11).fillColor(MARCA.titulo).text('Firmas:', x0);
    const yF = doc.y + 6;
    doc.roundedRect(x0, yF, 220, 95, 8).lineWidth(0.8).strokeColor('#CCCCCC').stroke();
    if (rep.firma_auditor_base64) {
      try {
        const b64 = rep.firma_auditor_base64.replace(/^data:image\/\w+;base64,/, '');
        doc.image(Buffer.from(b64, 'base64'), x0 + 10, yF + 6, { fit: [200, 62], align: 'center' });
      } catch { /* firma ilegible */ }
    }
    doc.moveTo(x0 + 15, yF + 72).lineTo(x0 + 205, yF + 72).strokeColor('#999999').stroke();
    doc.font('RS').fontSize(8.5).fillColor(MARCA.texto).text(`Auditor: ${R.auditor}`, x0 + 10, yF + 77, { width: 200, align: 'center' });

    // ---- Pie de página
    const rango = doc.bufferedPageRange();
    for (let i = 0; i < rango.count; i++) {
      doc.switchToPage(rango.start + i);
      doc.page.margins.bottom = 0; // evita que el pie genere páginas en blanco
      const yPie = doc.page.height - 35;
      doc.font('R').fontSize(7.5).fillColor('#9A9A9A')
        .text(`${R.formulario} · ${R.ubicacion} · ${R.fecha}`, 40, yPie, { width: ancho - 60, lineBreak: false })
        .text(`Página ${i + 1} de ${rango.count}`, 40 + ancho - 80, yPie, { width: 80, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}
