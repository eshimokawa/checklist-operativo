import { ruta, lanzarSiError } from '@/lib/api';
import { fechaLocal } from '@/lib/negocio';
export const dynamic = 'force-dynamic';

// Check lists del usuario: los del día seleccionado + vencidas/pendientes de los últimos 7 días.
export const GET = ruta(async ({ req, sesion, db }) => {
  const url = new URL(req.url);
  const fecha = url.searchParams.get('fecha') || fechaLocal();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { tareas: [] };
  const hace7 = fechaLocal(new Date(new Date(fecha + 'T12:00:00Z').getTime() - 7 * 86400000));
  const sel = 'id,estado,fecha_programada,ventana_inicio,ventana_fin,calificacion_porcentaje,etiqueta_calificacion,fecha_hora_registro,correo_enviado,completado_fuera_plazo,formulario:formularios(id,codigo,nombre,tipo_evaluacion),unidad:unidades(nombre),area:areas_trabajo(descripcion_area)';
  const { data: delDia, error } = await db.from('ejecuciones_checklist').select(sel)
    .eq('auditor_id', sesion.perfil.id).eq('fecha_programada', fecha).order('ventana_inicio');
  lanzarSiError(error);
  const { data: atrasadas, error: e2 } = await db.from('ejecuciones_checklist').select(sel)
    .eq('auditor_id', sesion.perfil.id).neq('estado', 'Finalizado')
    .gte('fecha_programada', hace7).lt('fecha_programada', fecha).order('fecha_programada', { ascending: false });
  lanzarSiError(e2);
  return { fecha, tareas: delDia || [], atrasadas: atrasadas || [] };
});
