import crypto from 'crypto';
import { HttpError, lanzarSiError, leerTodo, mensajeErrorBD } from './api';
import { normalizar, claveCompacta, parsearDias } from './negocio';
import { aHora, texto } from './excel/leer';

// ------------------------------------------------------------------
// Definición de entidades administrables (Módulo de Configuración)
// ------------------------------------------------------------------
export const ENTIDADES = {
  unidades: {
    tabla: 'unidades', select: '*', orden: 'nombre',
    campos: ['codigo', 'nombre', 'activo'], requeridos: ['codigo', 'nombre'],
    columnasExcel: ['codigo', 'nombre'],
    ejemplos: [['LMEB', 'LA MAR'], ['TLM', 'TANTA LARCO MAR']],
  },
  areas: {
    tabla: 'areas_trabajo', select: '*, unidad:unidades(id,nombre)', orden: 'descripcion_area',
    campos: ['descripcion_area', 'unidad_id', 'activo'], requeridos: ['descripcion_area', 'unidad_id'],
    columnasExcel: ['descripcion_area', 'unidad_asignada'],
    ejemplos: [['Cocina', 'TANTA LARCO MAR'], ['Pre-cocina', 'LA MAR'], ['Bar', 'LA MAR']],
  },
  trabajadores: {
    tabla: 'trabajadores', select: '*, unidad:unidades(id,nombre), area:areas_trabajo(id,descripcion_area)', orden: 'nombre_completo',
    campos: ['nombre_completo', 'area_trabajo_id', 'unidad_id', 'activo'], requeridos: ['nombre_completo', 'unidad_id'],
    columnasExcel: ['nombre_completo', 'area_trabajo', 'unidad_asignada'],
    ejemplos: [['Agreda Beryl', 'Cocina', 'TANTA LARCO MAR'], ['Alcala Libia', 'Cocina', 'TANTA LARCO MAR']],
  },
  equipos: {
    tabla: 'equipos', select: '*, unidad:unidades(id,nombre), area:areas_trabajo(id,descripcion_area)', orden: 'codigo_equipo',
    campos: ['codigo_equipo', 'descripcion_equipo', 'tipo_equipo', 'area_trabajo_id', 'unidad_id', 'temperatura_funcionamiento', 'activo'],
    requeridos: ['codigo_equipo', 'descripcion_equipo', 'unidad_id'],
    columnasExcel: ['codigo_equipo', 'descripcion_equipo', 'area_trabajo', 'temperatura_funcionamiento', 'unidad_asignada'],
    ejemplos: [['LMEB-F-01', 'Base conservador de 2 cajones', 'Pre-cocina', '1°C a 4°C', 'LA MAR'], ['LMEB-F-04', 'Congelador horizontal de 2 puertas', 'Pre-cocina', '-18°C a -21°C', 'LA MAR']],
  },
  frecuencias: {
    tabla: 'frecuencias_ejecucion', select: '*', orden: 'nombre_frecuencia',
    campos: ['nombre_frecuencia', 'dias_semana', 'hora_inicio', 'hora_fin', 'activo'],
    requeridos: ['nombre_frecuencia', 'dias_semana', 'hora_inicio', 'hora_fin'],
    columnasExcel: ['nombre_frecuencia', 'dias_semana', 'hora_inicio', 'hora_fin'],
    ejemplos: [['Diario turno mañana', 'Todos los días', '08:00', '17:00'], ['Lunes a viernes', 'Lunes a Viernes', '09:00', '12:00'], ['Inter-diario', 'Lunes, Miércoles, Viernes', '15:00', '18:00']],
  },
  asignaciones: {
    tabla: 'asignaciones_formulario',
    select: '*, formulario:formularios(id,codigo,nombre,unidad:unidades(nombre)), usuario:usuarios(id,nombre_completo,correo), frecuencia:frecuencias_ejecucion(id,nombre_frecuencia,hora_inicio,hora_fin,dias_semana)',
    orden: 'created_at',
    campos: ['formulario_id', 'usuario_responsable_id', 'frecuencia_id', 'activo'],
    requeridos: ['formulario_id', 'usuario_responsable_id', 'frecuencia_id'],
  },
  usuarios: {
    tabla: 'usuarios', select: '*, unidad:unidades(id,nombre), area:areas_trabajo(id,descripcion_area)', orden: 'nombre_completo',
    campos: ['nombre_completo', 'correo', 'rol', 'unidad_id', 'area_trabajo_id', 'activo'],
    requeridos: ['nombre_completo', 'correo', 'rol'],
    columnasExcel: ['nombre_completo', 'correo', 'rol', 'unidad_asignada', 'area_trabajo'],
    ejemplos: [
      ['Ana Torres', 'ana.torres@empresa.com', 'administrador_restaurante', 'LA MAR', ''],
      ['Luis Paredes', 'luis.paredes@empresa.com', 'jefe_area', 'TANTA LARCO MAR', 'Cocina'],
    ],
  },
};

export function definicion(entidad) {
  const d = ENTIDADES[entidad];
  if (!d) throw new HttpError(404, `Entidad desconocida: ${entidad}`);
  return d;
}

const ROLES_TEXTO = [
  ['administrador_aplicacion', /(administrador de la aplicacion|admin(istrador)? app|administrador_aplicacion|administrador aplicacion)/],
  ['administrador_restaurante', /(administrador de restaurante|administrador_restaurante|admin(istrador)? restaurante|administrador de tienda)/],
  ['jefe_area', /(jefe de area|jefe_area|jefe area|jefe)/],
];
export function parsearRol(v) {
  const n = normalizar(v);
  for (const [rol, rx] of ROLES_TEXTO) if (rx.test(n)) return rol;
  return null;
}

/** Limpia y valida un registro antes de insertar/actualizar */
export async function prepararRegistro(db, entidad, datos, parcial = false) {
  const def = definicion(entidad);
  const r = {};
  for (const c of def.campos) if (datos[c] !== undefined) r[c] = typeof datos[c] === 'string' ? datos[c].trim() : datos[c];
  for (const k of ['area_trabajo_id', 'unidad_id']) if (r[k] === '') r[k] = null;
  if (!parcial) for (const c of def.requeridos) if (r[c] === undefined || r[c] === null || r[c] === '') throw new HttpError(400, `El campo "${c}" es obligatorio.`);

  if (entidad === 'frecuencias') {
    if (r.dias_semana !== undefined) {
      r.dias_semana = parsearDias(r.dias_semana);
      if (!r.dias_semana.length) throw new HttpError(400, 'Indique al menos un día de la semana válido.');
    }
    for (const h of ['hora_inicio', 'hora_fin']) if (r[h] !== undefined) {
      const x = aHora(r[h]);
      if (!x) throw new HttpError(400, `Hora inválida en ${h} (use HH:MM).`);
      r[h] = x;
    }
  }
  if (entidad === 'unidades' && r.codigo) r.codigo = r.codigo.toUpperCase();
  if (entidad === 'usuarios') {
    if (r.correo) {
      r.correo = r.correo.toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.correo)) throw new HttpError(400, 'Correo electrónico inválido.');
    }
    if (r.rol !== undefined) {
      const rol = parsearRol(r.rol) || r.rol;
      if (!['administrador_aplicacion', 'administrador_restaurante', 'jefe_area'].includes(rol)) throw new HttpError(400, 'Rol inválido.');
      r.rol = rol;
      if (rol === 'administrador_aplicacion') { r.unidad_id = r.unidad_id ?? null; }
      else if (!parcial && !r.unidad_id) throw new HttpError(400, 'Los roles operativos requieren una unidad asignada.');
      if (rol === 'jefe_area' && !parcial && !r.area_trabajo_id) throw new HttpError(400, 'El Jefe de área requiere un área de trabajo asignada.');
      if (rol !== 'jefe_area' && r.area_trabajo_id === undefined) r.area_trabajo_id = null;
    }
  }
  // El área debe pertenecer a la unidad
  if (r.area_trabajo_id && r.unidad_id) {
    const { data: a } = await db.from('areas_trabajo').select('unidad_id').eq('id', r.area_trabajo_id).maybeSingle();
    if (!a || a.unidad_id !== r.unidad_id) throw new HttpError(400, 'El área de trabajo no pertenece a la unidad seleccionada.');
  }
  return r;
}

// ------------------------------------------------------------------
// Usuarios (Supabase Auth + perfil)
// ------------------------------------------------------------------
export function contrasenaTemporal() {
  const base = crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 9);
  return `${base}Aa7!`;
}

export async function crearUsuario(db, datos) {
  const perfil = await prepararRegistro(db, 'usuarios', datos);
  const password = datos.password && String(datos.password).length >= 8 ? String(datos.password) : contrasenaTemporal();
  const activo = perfil.activo !== false;
  const { data, error } = await db.auth.admin.createUser({
    email: perfil.correo, password, email_confirm: true,
    user_metadata: { nombre_completo: perfil.nombre_completo },
    ...(activo ? {} : { ban_duration: '876000h' }),
  });
  if (error) throw new HttpError(400, /already|registered|exists/i.test(error.message) ? 'Ya existe una cuenta con ese correo.' : error.message);
  const { error: e2 } = await db.from('usuarios').insert({ id: data.user.id, ...perfil, activo });
  if (e2) {
    await db.auth.admin.deleteUser(data.user.id);
    throw new HttpError(400, mensajeErrorBD(e2));
  }
  return { id: data.user.id, password };
}

export async function actualizarUsuario(db, id, datos) {
  const { data: actual } = await db.from('usuarios').select('*').eq('id', id).maybeSingle();
  if (!actual) throw new HttpError(404, 'Usuario no encontrado.');
  const fusion = { ...actual, ...datos };
  const perfil = await prepararRegistro(db, 'usuarios', {
    nombre_completo: fusion.nombre_completo, correo: fusion.correo, rol: fusion.rol,
    unidad_id: fusion.unidad_id, area_trabajo_id: fusion.area_trabajo_id, activo: fusion.activo,
  });
  const authCambios = {};
  if (perfil.correo !== actual.correo) { authCambios.email = perfil.correo; authCambios.email_confirm = true; }
  if (datos.password) {
    if (String(datos.password).length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.');
    authCambios.password = String(datos.password);
  }
  if (perfil.activo !== actual.activo) authCambios.ban_duration = perfil.activo ? 'none' : '876000h';
  if (Object.keys(authCambios).length) {
    const { error } = await db.auth.admin.updateUserById(id, authCambios);
    if (error) throw new HttpError(400, error.message);
  }
  const { error: e2 } = await db.from('usuarios').update(perfil).eq('id', id);
  lanzarSiError(e2);
  return { id };
}

// ------------------------------------------------------------------
// Carga masiva desde Excel
// ------------------------------------------------------------------
const SINONIMOS = {
  nombre_completo: ['nombre_completo', 'nombre', 'nombres_y_apellidos', 'colaborador', 'trabajador'],
  area_trabajo: ['area_trabajo', 'area', 'area_de_trabajo', 'zona'],
  unidad_asignada: ['unidad_asignada', 'unidad', 'sede', 'local', 'restaurante'],
  codigo_equipo: ['codigo_equipo', 'codigo', 'numero_de_equipo'],
  descripcion_equipo: ['descripcion_equipo', 'descripcion', 'equipo'],
  tipo_equipo: ['tipo_equipo', 'tipo_de_equipo'],
  temperatura_funcionamiento: ['temperatura_funcionamiento', 'temperatura_de_funcionamiento', 'parametro', 'rango'],
  descripcion_area: ['descripcion_area', 'area', 'zona', 'area_de_trabajo'],
  correo: ['correo', 'email', 'correo_electronico'],
  rol: ['rol', 'perfil'],
  password_temporal: ['password_temporal', 'contrasena', 'password', 'clave'],
  nombre_frecuencia: ['nombre_frecuencia', 'frecuencia', 'nombre'],
  dias_semana: ['dias_semana', 'dias', 'dias_de_la_semana'],
  hora_inicio: ['hora_inicio', 'inicio'],
  hora_fin: ['hora_fin', 'fin', 'cierre'],
  codigo: ['codigo'],
  nombre: ['nombre'],
  activo: ['activo', 'estado'],
};

/** Convierte filas de una hoja a objetos con claves canónicas según las columnas esperadas. */
export function filasAObjetos(filas, columnasEsperadas) {
  const extra = ['tipo_equipo', 'password_temporal', 'activo'];
  const buscadas = [...columnasEsperadas, ...extra];
  let iEnc = filas.findIndex((f) => (f || []).filter((x) => texto(x)).length >= Math.min(2, columnasEsperadas.length));
  if (iEnc < 0) throw new HttpError(400, 'El archivo no tiene encabezados.');
  const enc = filas[iEnc].map((h) => normalizar(texto(h)).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  const mapa = {};
  for (const clave of buscadas) {
    const sin = SINONIMOS[clave] || [clave];
    const idx = enc.findIndex((h, i) => sin.includes(h) && !Object.values(mapa).includes(i));
    if (idx >= 0) mapa[clave] = idx;
  }
  const faltan = columnasEsperadas.filter((c) => mapa[c] === undefined && !['area_trabajo'].includes(c));
  if (faltan.length) throw new HttpError(400, `Faltan columnas obligatorias: ${faltan.join(', ')}. Descargue la plantilla para ver el formato exacto.`);
  const salida = [];
  filas.slice(iEnc + 1).forEach((f, i) => {
    if (!(f || []).some((x) => texto(x))) return;
    const o = { _fila: iEnc + i + 2 };
    for (const [k, idx] of Object.entries(mapa)) o[k] = k.startsWith('hora') ? f[idx] : texto(f[idx]);
    salida.push(o);
  });
  return salida;
}

async function cargarCatalogos(db) {
  const unidades = await leerTodo(() => db.from('unidades').select('id,codigo,nombre'));
  const areas = await leerTodo(() => db.from('areas_trabajo').select('id,descripcion_area,unidad_id'));
  const uMap = new Map();
  for (const u of unidades) { uMap.set(claveCompacta(u.codigo), u); uMap.set(claveCompacta(u.nombre), u); }
  const aMap = new Map(areas.map((a) => [`${a.unidad_id}|${normalizar(a.descripcion_area)}`, a]));
  return { uMap, aMap };
}

function aBool(v, defecto = true) {
  if (v === undefined || v === null || v === '') return defecto;
  return !/^(no|0|false|falso|inactivo|desactivado)$/i.test(normalizar(v));
}

export async function importarFilas(db, entidad, objetos) {
  const res = { procesados: 0, insertados: 0, actualizados: 0, areas_creadas: [], errores: [], credenciales: [] };
  const { uMap, aMap } = await cargarCatalogos(db);

  const unidadDe = (o) => {
    const u = uMap.get(claveCompacta(o.unidad_asignada));
    if (!u) throw new Error(`Unidad "${o.unidad_asignada}" no existe`);
    return u;
  };
  const areaDe = async (unidad, nombre, crear = true) => {
    if (!nombre) return null;
    const k = `${unidad.id}|${normalizar(nombre)}`;
    if (aMap.has(k)) return aMap.get(k);
    if (!crear) throw new Error(`Área "${nombre}" no existe en ${unidad.nombre}`);
    const { data, error } = await db.from('areas_trabajo').insert({ descripcion_area: nombre.trim(), unidad_id: unidad.id }).select().single();
    if (error) throw new Error(mensajeErrorBD(error));
    aMap.set(k, data);
    res.areas_creadas.push(`${nombre} (${unidad.nombre})`);
    return data;
  };

  for (const o of objetos) {
    res.procesados += 1;
    try {
      if (entidad === 'unidades') {
        if (!o.codigo || !o.nombre) throw new Error('codigo y nombre son obligatorios');
        const { data: ex } = await db.from('unidades').select('id').eq('codigo', o.codigo.toUpperCase()).maybeSingle();
        if (ex) { lanzarSiError((await db.from('unidades').update({ nombre: o.nombre, activo: aBool(o.activo) }).eq('id', ex.id)).error); res.actualizados++; }
        else { lanzarSiError((await db.from('unidades').insert({ codigo: o.codigo.toUpperCase(), nombre: o.nombre })).error); res.insertados++; }
        const nuevo = { codigo: o.codigo.toUpperCase(), nombre: o.nombre };
        const { data: u } = await db.from('unidades').select('id,codigo,nombre').eq('codigo', nuevo.codigo).single();
        uMap.set(claveCompacta(u.codigo), u); uMap.set(claveCompacta(u.nombre), u);
      } else if (entidad === 'areas') {
        if (!o.descripcion_area) throw new Error('descripcion_area es obligatorio');
        const u = unidadDe(o);
        const k = `${u.id}|${normalizar(o.descripcion_area)}`;
        if (aMap.has(k)) { lanzarSiError((await db.from('areas_trabajo').update({ activo: aBool(o.activo) }).eq('id', aMap.get(k).id)).error); res.actualizados++; }
        else { await areaDe(u, o.descripcion_area); res.areas_creadas.pop(); res.insertados++; }
      } else if (entidad === 'trabajadores') {
        if (!o.nombre_completo) throw new Error('nombre_completo es obligatorio');
        const u = unidadDe(o);
        const a = await areaDe(u, o.area_trabajo);
        let q = db.from('trabajadores').select('id').eq('unidad_id', u.id).ilike('nombre_completo', o.nombre_completo.replace(/[%_]/g, '\\$&'));
        q = a ? q.eq('area_trabajo_id', a.id) : q.is('area_trabajo_id', null);
        const { data: ex } = await q.maybeSingle();
        const reg = { nombre_completo: o.nombre_completo, unidad_id: u.id, area_trabajo_id: a?.id || null, activo: aBool(o.activo) };
        if (ex) { lanzarSiError((await db.from('trabajadores').update(reg).eq('id', ex.id)).error); res.actualizados++; }
        else { lanzarSiError((await db.from('trabajadores').insert(reg)).error); res.insertados++; }
      } else if (entidad === 'equipos') {
        if (!o.codigo_equipo || !o.descripcion_equipo) throw new Error('codigo_equipo y descripcion_equipo son obligatorios');
        const u = unidadDe(o);
        const a = await areaDe(u, o.area_trabajo);
        const reg = {
          codigo_equipo: o.codigo_equipo, descripcion_equipo: o.descripcion_equipo, tipo_equipo: o.tipo_equipo || null,
          unidad_id: u.id, area_trabajo_id: a?.id || null, temperatura_funcionamiento: o.temperatura_funcionamiento || null, activo: aBool(o.activo),
        };
        const { data: ex } = await db.from('equipos').select('id').eq('unidad_id', u.id).ilike('codigo_equipo', o.codigo_equipo).maybeSingle();
        if (ex) { lanzarSiError((await db.from('equipos').update(reg).eq('id', ex.id)).error); res.actualizados++; }
        else { lanzarSiError((await db.from('equipos').insert(reg)).error); res.insertados++; }
      } else if (entidad === 'frecuencias') {
        const reg = await prepararRegistro(db, 'frecuencias', {
          nombre_frecuencia: o.nombre_frecuencia, dias_semana: o.dias_semana, hora_inicio: o.hora_inicio, hora_fin: o.hora_fin, activo: aBool(o.activo),
        });
        const { data: ex } = await db.from('frecuencias_ejecucion').select('id').ilike('nombre_frecuencia', o.nombre_frecuencia).maybeSingle();
        if (ex) { lanzarSiError((await db.from('frecuencias_ejecucion').update(reg).eq('id', ex.id)).error); res.actualizados++; }
        else { lanzarSiError((await db.from('frecuencias_ejecucion').insert(reg)).error); res.insertados++; }
      } else if (entidad === 'usuarios') {
        const rol = parsearRol(o.rol);
        if (!rol) throw new Error(`Rol "${o.rol}" inválido (use administrador_aplicacion, administrador_restaurante o jefe_area)`);
        let unidad = null;
        let area = null;
        if (rol !== 'administrador_aplicacion' || o.unidad_asignada) unidad = unidadDe(o);
        if (unidad && o.area_trabajo) area = await areaDe(unidad, o.area_trabajo);
        const datos = {
          nombre_completo: o.nombre_completo, correo: o.correo, rol, unidad_id: unidad?.id || null,
          area_trabajo_id: area?.id || null, activo: aBool(o.activo), password: o.password_temporal || undefined,
        };
        const { data: ex } = await db.from('usuarios').select('id').ilike('correo', String(o.correo || '').trim()).maybeSingle();
        if (ex) { await actualizarUsuario(db, ex.id, { ...datos, password: o.password_temporal || undefined }); res.actualizados++; }
        else {
          const { password } = await crearUsuario(db, datos);
          res.insertados++;
          res.credenciales.push({ correo: datos.correo, password_temporal: password });
        }
      }
    } catch (e) {
      res.errores.push({ fila: o._fila, mensaje: e.message });
    }
  }
  return res;
}
