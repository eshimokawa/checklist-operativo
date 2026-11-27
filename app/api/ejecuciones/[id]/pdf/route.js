import { ruta, HttpError } from '@/lib/api';
import { cargarReporte } from '@/lib/reporte';
import { generarPDF } from '@/lib/pdf';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = ruta(async ({ sesion, params, db }) => {
  const rep = await cargarReporte(db, params.id, sesion.perfil);
  if (rep.estado !== 'Finalizado') throw new HttpError(400, 'El PDF está disponible cuando el check list se finaliza.');
  const pdf = await generarPDF(rep);
  const nombre = `${rep.formulario.codigo}_${String(rep.fecha_hora_registro).slice(0, 10)}.pdf`.replace(/[^\w.-]/g, '_');
  return new Response(pdf, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${nombre}"`, 'Cache-Control': 'no-store' },
  });
});
