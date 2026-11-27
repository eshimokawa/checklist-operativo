import { ruta, lanzarSiError } from '@/lib/api';
import { fechaLocal } from '@/lib/negocio';
export const dynamic = 'force-dynamic';

export const GET = ruta(async ({ sesion, db }) => {
  const yo = sesion.perfil.id;
  const { data: lista, error } = await db.from('notificaciones_internas')
    .select('id,tipo_alerta,mensaje,leida,fecha_creacion,ejecucion_id')
    .eq('usuario_id', yo).order('fecha_creacion', { ascending: false }).limit(40);
  lanzarSiError(error);
  const desde = new Date(Date.now() - 7 * 86400000);
  const { data: tareas, error: e2 } = await db.from('ejecuciones_checklist')
    .select('id,estado,ventana_inicio,fecha_programada').eq('auditor_id', yo).in('estado', ['Pendiente', 'Vencida'])
    .gte('fecha_programada', fechaLocal(desde));
  lanzarSiError(e2);
  const ahora = Date.now();
  return {
    notificaciones: lista || [],
    no_leidas: (lista || []).filter((n) => !n.leida).length,
    pendientes: (tareas || []).filter((t) => t.estado === 'Pendiente' && new Date(t.ventana_inicio).getTime() <= ahora).length,
    vencidas: (tareas || []).filter((t) => t.estado === 'Vencida').length,
  };
});

export const PATCH = ruta(async ({ req, sesion, db }) => {
  const { ids, todas } = await req.json();
  let q = db.from('notificaciones_internas').update({ leida: true }).eq('usuario_id', sesion.perfil.id);
  if (!todas) q = q.in('id', (ids || []).slice(0, 100));
  const { error } = await q;
  lanzarSiError(error);
  return { ok: true };
});
