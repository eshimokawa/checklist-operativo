import { ruta, HttpError } from '@/lib/api';
import { cargarReporte } from '@/lib/reporte';
import { generarPDF } from '@/lib/pdf';
import { enviarReporte } from '@/lib/correo';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Envía el reporte PDF al correo del usuario que completó el check list (maestro usuarios).
export const POST = ruta(async ({ sesion, params, db }) => {
  const rep = await cargarReporte(db, params.id, sesion.perfil);
  if (rep.estado !== 'Finalizado') throw new HttpError(400, 'El check list aún no está finalizado.');
  const destino = rep.auditor?.correo;
  if (!destino) throw new HttpError(400, 'El auditor no tiene un correo registrado.');
  const pdf = await generarPDF(rep);
  try {
    await enviarReporte(rep, pdf, destino);
  } catch (e) {
    throw new HttpError(502, e.message);
  }
  await db.from('ejecuciones_checklist').update({ correo_enviado: true, correo_enviado_at: new Date().toISOString() }).eq('id', rep.id);
  return { ok: true, destino };
});
