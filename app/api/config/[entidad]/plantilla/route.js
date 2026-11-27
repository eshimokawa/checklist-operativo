import { ruta, ROLES, HttpError } from '@/lib/api';
import { definicion } from '@/lib/maestros';
import { crearPlantilla } from '@/lib/excel/leer';
export const runtime = 'nodejs';

const NOTAS = {
  usuarios: [
    'Instrucciones de carga de usuarios',
    'rol: administrador_aplicacion | administrador_restaurante | jefe_area',
    'unidad_asignada: código o nombre de la unidad (ej. LMEB o LA MAR). Obligatoria salvo para administrador_aplicacion.',
    'area_trabajo: obligatoria para jefe_area. Si no existe en la unidad se crea automáticamente.',
    'Columnas opcionales: password_temporal (mín. 8 caracteres; si se omite se genera una) y activo (SI/NO).',
    'Si el correo ya existe, se actualizan sus datos.',
  ],
  frecuencias: [
    'Instrucciones de carga de frecuencias',
    'dias_semana admite: "Todos los días", "Lunes a Viernes", "Lunes, Miércoles, Viernes", "L,Mi,V" o números ISO "1,3,5" (1 = Lunes, 7 = Domingo).',
    'hora_inicio / hora_fin en formato 24 h (HH:MM). Si hora_fin es menor que hora_inicio, la ventana cierra al día siguiente.',
    'Se envían alertas internas al llegar la hora_inicio y 1 hora antes de la hora_fin.',
  ],
  trabajadores: ['Instrucciones', 'unidad_asignada: código o nombre de la unidad. area_trabajo se crea si no existe. Columna opcional: activo (SI/NO).'],
  equipos: ['Instrucciones', 'temperatura_funcionamiento: rango de referencia (ej. "1°C a 4°C"). Columnas opcionales: tipo_equipo, activo (SI/NO).'],
  areas: ['Instrucciones', 'unidad_asignada: código o nombre de la unidad.'],
};

export const GET = ruta(async ({ params }) => {
  const def = definicion(params.entidad);
  if (!def.columnasExcel) throw new HttpError(400, 'Sin plantilla para esta entidad.');
  const buf = await crearPlantilla(params.entidad, def.columnasExcel, def.ejemplos || [], NOTAS[params.entidad] || []);
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="plantilla_${params.entidad}.xlsx"`,
    },
  });
}, { roles: [ROLES.ADMIN_APP] });
