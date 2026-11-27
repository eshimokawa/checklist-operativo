import { ruta, ROLES, leerTodo } from '@/lib/api';
export const dynamic = 'force-dynamic';

export const GET = ruta(async ({ db }) => {
  const filas = await leerTodo(() => db.from('formularios')
    .select('id,codigo,nombre,tipo_evaluacion,estandar_porcentaje,opciones_respuesta,activo,origen_archivo,unidad_id,unidad:unidades(nombre),formulario_preguntas(count),formulario_equipos(count)')
    .order('nombre'));
  return { filas };
}, { roles: [ROLES.ADMIN_APP] });
