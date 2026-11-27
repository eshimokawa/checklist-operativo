import ExcelJS from 'exceljs';

/** Convierte el valor de una celda de ExcelJS a texto/número/fecha simple. */
export function valorCelda(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text !== undefined) return v.text; // hipervínculo
    if (v.result !== undefined) return valorCelda(v.result); // fórmula
    if (v.error) return null;
    return String(v);
  }
  return v;
}

export function texto(v) {
  const x = valorCelda(v);
  if (x === null || x === undefined) return '';
  if (x instanceof Date) return x.toISOString();
  return String(x).trim();
}

/** Lee un libro .xlsx desde un Buffer/ArrayBuffer y devuelve [{nombre, filas: any[][]}] */
export async function leerLibro(buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (e) {
    throw new Error('El archivo no es un Excel .xlsx válido.');
  }
  const hojas = [];
  wb.eachSheet((ws) => {
    const filas = [];
    const maxCol = ws.columnCount;
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const fila = [];
      for (let c = 1; c <= maxCol; c++) fila.push(valorCelda(row.getCell(c).value));
      filas[n - 1] = fila;
    });
    for (let i = 0; i < filas.length; i++) if (!filas[i]) filas[i] = [];
    // Propaga valores de celdas combinadas (ExcelJS devuelve el maestro en cada celda combinada como valor)
    hojas.push({ nombre: ws.name, filas });
  });
  return hojas;
}

/** Convierte un valor de Excel (Date, fracción de día, "8:00 AM", "08:00") a "HH:MM" */
export function aHora(v) {
  const x = valorCelda(v);
  if (x === null || x === undefined || x === '') return null;
  if (x instanceof Date) {
    return `${String(x.getUTCHours()).padStart(2, '0')}:${String(x.getUTCMinutes()).padStart(2, '0')}`;
  }
  if (typeof x === 'number') {
    const min = Math.round((x % 1) * 24 * 60);
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  }
  const m = String(x).trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const mi = Number(m[2] || 0);
  if (m[3]?.startsWith('p') && h < 12) h += 12;
  if (m[3]?.startsWith('a') && h === 12) h = 0;
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

/** Crea un libro con una hoja de encabezados estilizados (plantillas de carga) */
export async function crearPlantilla(nombreHoja, columnas, ejemplos = [], notas = []) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Check List Operativo';
  const ws = wb.addWorksheet(nombreHoja);
  ws.columns = columnas.map((c) => ({ header: c, key: c, width: Math.max(18, c.length + 6) }));
  estilizarEncabezado(ws.getRow(1));
  ejemplos.forEach((e) => ws.addRow(e));
  if (notas.length) {
    const wn = wb.addWorksheet('Instrucciones');
    wn.getColumn(1).width = 110;
    notas.forEach((n) => wn.addRow([n]));
    wn.getRow(1).font = { bold: true, color: { argb: 'FF71255E' }, size: 13 };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function estilizarEncabezado(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF870064' } };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 22;
}
