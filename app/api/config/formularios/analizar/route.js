import { ruta, ROLES, HttpError } from '@/lib/api';
import { leerLibro } from '@/lib/excel/leer';
import { analizarLibro } from '@/lib/excel/formularios';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Analiza un Excel y devuelve la estructura detectada de cada hoja para revisión antes de guardar.
export const POST = ruta(async ({ req }) => {
  const form = await req.formData();
  const archivo = form.get('archivo');
  if (!archivo || typeof archivo === 'string') throw new HttpError(400, 'Adjunte un archivo .xlsx.');
  const hojas = await leerLibro(Buffer.from(await archivo.arrayBuffer()));
  const formularios = analizarLibro(hojas);
  if (!formularios.length) throw new HttpError(400, 'No se detectaron formularios en el archivo.');
  return { archivo: archivo.name, formularios };
}, { roles: [ROLES.ADMIN_APP] });
