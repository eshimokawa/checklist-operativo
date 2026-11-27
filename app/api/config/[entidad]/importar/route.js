import { ruta, ROLES, HttpError } from '@/lib/api';
import { definicion, filasAObjetos, importarFilas } from '@/lib/maestros';
import { leerLibro } from '@/lib/excel/leer';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export const POST = ruta(async ({ req, params, db }) => {
  const def = definicion(params.entidad);
  if (!def.columnasExcel) throw new HttpError(400, 'Esta entidad no admite carga masiva.');
  const form = await req.formData();
  const archivo = form.get('archivo');
  if (!archivo || typeof archivo === 'string') throw new HttpError(400, 'Adjunte un archivo .xlsx.');
  if (archivo.size > 10 * 1024 * 1024) throw new HttpError(400, 'El archivo supera los 10 MB.');
  const hojas = await leerLibro(Buffer.from(await archivo.arrayBuffer()));
  const hoja = hojas.find((h) => h.filas.some((f) => f?.some((c) => c !== null && c !== ''))) || hojas[0];
  if (!hoja) throw new HttpError(400, 'El archivo está vacío.');
  const objetos = filasAObjetos(hoja.filas, def.columnasExcel);
  if (!objetos.length) throw new HttpError(400, 'El archivo no tiene filas de datos.');
  if (objetos.length > 3000) throw new HttpError(400, 'Máximo 3000 filas por carga.');
  return await importarFilas(db, params.entidad, objetos);
}, { roles: [ROLES.ADMIN_APP] });
