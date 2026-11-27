import { ruta, lanzarSiError, HttpError } from '@/lib/api';
import { puedeVer, cargarReporte } from '@/lib/reporte';
import { construirItems } from '@/lib/ejecucion';
export const dynamic = 'force-dynamic';

export const GET = ruta(async ({ sesion, params, db }) => {
  const { data: ejec, error } = await db.from('ejecuciones_checklist')
    .select('*, formulario:formularios(*), unidad:unidades(id,codigo,nombre), auditor:usuarios!auditor_id(id,nombre_completo,correo), area:areas_trabajo(descripcion_area)')
    .eq('id', params.id).maybeSingle();
  lanzarSiError(error);
  if (!ejec) throw new HttpError(404, 'Check list no encontrado.');
  if (!puedeVer(sesion.perfil, ejec)) throw new HttpError(403, 'No tiene acceso a este check list.');

  if (ejec.estado === 'Finalizado') {
    const rep = await cargarReporte(db, params.id);
    const { firma_auditor_base64, ...resto } = rep;
    return { ejecucion: { ...resto, tiene_firma: !!firma_auditor_base64 }, firma: firma_auditor_base64, items: [], puede_editar: false };
  }
  const items = await construirItems(db, ejec, ejec.formulario);
  return {
    ejecucion: ejec,
    items,
    puede_editar: ejec.auditor_id === sesion.perfil.id,
    servidor_ahora: new Date().toISOString(),
  };
});
