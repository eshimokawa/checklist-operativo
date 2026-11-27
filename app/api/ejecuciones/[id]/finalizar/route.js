import { ruta } from '@/lib/api';
import { finalizarEjecucion } from '@/lib/ejecucion';
export const dynamic = 'force-dynamic';

export const POST = ruta(async ({ req, sesion, params, db }) => {
  const cuerpo = await req.json();
  const final = await finalizarEjecucion(db, sesion.perfil, params.id, cuerpo);
  return {
    ok: true,
    ejecucion: {
      id: final.id, estado: final.estado, calificacion_porcentaje: final.calificacion_porcentaje,
      etiqueta_calificacion: final.etiqueta_calificacion, tiempo_ejecucion_minutos: final.tiempo_ejecucion_minutos,
      fecha_hora_registro: final.fecha_hora_registro,
    },
    correo_destino: sesion.perfil.correo,
  };
});
