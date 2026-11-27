-- =====================================================================
--  CHECK LIST OPERATIVO MULTI-SEDE — Script completo para Supabase
--  PostgreSQL 15+ / Supabase. Ejecutar en: Supabase > SQL Editor > New query
--  Zona horaria de negocio: America/Lima (ver constante en fn_app_tz)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 0. Utilidades
-- ---------------------------------------------------------------------
create or replace function public.fn_app_tz() returns text
language sql immutable as $$ select 'America/Lima'::text $$;

create or replace function public.fn_set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

-- ---------------------------------------------------------------------
-- 1. Maestros
-- ---------------------------------------------------------------------
create table if not exists public.unidades (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique,
  nombre      text not null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists ux_unidades_nombre on public.unidades (upper(nombre));

create table if not exists public.areas_trabajo (
  id                uuid primary key default gen_random_uuid(),
  descripcion_area  text not null,
  unidad_id         uuid not null references public.unidades(id) on delete cascade,
  activo            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists ux_areas_unidad_desc on public.areas_trabajo (unidad_id, upper(descripcion_area));
create index if not exists ix_areas_unidad on public.areas_trabajo (unidad_id);

create table if not exists public.usuarios (
  id               uuid primary key references auth.users(id) on delete cascade,
  nombre_completo  text not null,
  correo           text not null,
  rol              text not null check (rol in ('administrador_aplicacion','administrador_restaurante','jefe_area')),
  unidad_id        uuid references public.unidades(id) on delete set null,
  area_trabajo_id  uuid references public.areas_trabajo(id) on delete set null,
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint ck_usuario_unidad check (rol = 'administrador_aplicacion' or unidad_id is not null),
  constraint ck_jefe_area check (rol <> 'jefe_area' or area_trabajo_id is not null)
);
create unique index if not exists ux_usuarios_correo on public.usuarios (lower(correo));
create index if not exists ix_usuarios_unidad on public.usuarios (unidad_id);

create table if not exists public.trabajadores (
  id               uuid primary key default gen_random_uuid(),
  nombre_completo  text not null,
  area_trabajo_id  uuid references public.areas_trabajo(id) on delete set null,
  unidad_id        uuid not null references public.unidades(id) on delete cascade,
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists ux_trabajadores on public.trabajadores (unidad_id, upper(nombre_completo), area_trabajo_id);
create index if not exists ix_trabajadores_scope on public.trabajadores (unidad_id, area_trabajo_id) where activo;

create table if not exists public.equipos (
  id                          uuid primary key default gen_random_uuid(),
  codigo_equipo               text not null,
  descripcion_equipo          text not null,
  tipo_equipo                 text,                      -- ej. Freidora, Perol, Conservador (opcional)
  area_trabajo_id             uuid references public.areas_trabajo(id) on delete set null,
  unidad_id                   uuid not null references public.unidades(id) on delete cascade,
  temperatura_funcionamiento  text,                      -- ej. "1°C a 4°C", "-18°C a -21°C"
  activo                      boolean not null default true,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create unique index if not exists ux_equipos_codigo on public.equipos (unidad_id, upper(codigo_equipo));
create index if not exists ix_equipos_scope on public.equipos (unidad_id, area_trabajo_id) where activo;

create table if not exists public.frecuencias_ejecucion (
  id                 uuid primary key default gen_random_uuid(),
  nombre_frecuencia  text not null,
  dias_semana        smallint[] not null,   -- ISO: 1=Lunes ... 7=Domingo
  hora_inicio        time not null,
  hora_fin           time not null,
  activo             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint ck_dias_validos check (dias_semana <@ array[1,2,3,4,5,6,7]::smallint[] and cardinality(dias_semana) > 0)
);
create unique index if not exists ux_frecuencias_nombre on public.frecuencias_ejecucion (upper(nombre_frecuencia));

-- ---------------------------------------------------------------------
-- 2. Formularios (estructura jerárquica Sección -> Subcategoría -> Pregunta)
-- ---------------------------------------------------------------------
create table if not exists public.formularios (
  id                     uuid primary key default gen_random_uuid(),
  codigo                 text not null,
  nombre                 text not null,
  unidad_id              uuid not null references public.unidades(id) on delete cascade,
  tipo_evaluacion        text not null check (tipo_evaluacion in ('general','trabajadores','equipos')),
  estandar_porcentaje    numeric(5,2) not null default 0 check (estandar_porcentaje between 0 and 100),
  opciones_respuesta     jsonb not null default '["SI","NO","N/A"]'::jsonb,   -- opciones exactas del Excel
  opciones_conformes     jsonb not null default '[]'::jsonb,                  -- subconjunto que cuenta como conforme
  opciones_no_aplica     jsonb not null default '[]'::jsonb,                  -- subconjunto excluido del cálculo
  campos                 jsonb not null default '[]'::jsonb,                  -- columnas de la tabla (formularios de personal/equipos)
  aspectos_informativos  jsonb not null default '[]'::jsonb,                  -- textos de referencia ("Aspectos a evaluar")
  origen_archivo         text,
  activo                 boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint ck_opciones_array check (jsonb_typeof(opciones_respuesta) = 'array')
);
create unique index if not exists ux_formularios_codigo on public.formularios (unidad_id, upper(codigo));

create table if not exists public.formulario_secciones (
  id             uuid primary key default gen_random_uuid(),
  formulario_id  uuid not null references public.formularios(id) on delete cascade,
  nombre         text not null,
  orden          int not null default 0
);
create index if not exists ix_secciones_form on public.formulario_secciones (formulario_id, orden);

create table if not exists public.formulario_preguntas (
  id                uuid primary key default gen_random_uuid(),
  formulario_id     uuid not null references public.formularios(id) on delete cascade,
  seccion_id        uuid references public.formulario_secciones(id) on delete cascade,
  subcategoria      text,
  texto             text not null,
  orden             int not null default 0,
  es_punto_critico  boolean not null default false,
  activo            boolean not null default true
);
create index if not exists ix_preguntas_form on public.formulario_preguntas (formulario_id, orden);

-- Equipos precompletados en el Excel del formulario (si no hay, se usan todos los de la sede/área)
create table if not exists public.formulario_equipos (
  formulario_id  uuid not null references public.formularios(id) on delete cascade,
  equipo_id      uuid not null references public.equipos(id) on delete cascade,
  orden          int not null default 0,
  primary key (formulario_id, equipo_id)
);

create table if not exists public.asignaciones_formulario (
  id                      uuid primary key default gen_random_uuid(),
  formulario_id           uuid not null references public.formularios(id) on delete cascade,
  usuario_responsable_id  uuid not null references public.usuarios(id) on delete cascade,
  frecuencia_id           uuid not null references public.frecuencias_ejecucion(id) on delete restrict,
  activo                  boolean not null default true,
  created_at              timestamptz not null default now(),
  unique (formulario_id, usuario_responsable_id, frecuencia_id)
);
create index if not exists ix_asig_usuario on public.asignaciones_formulario (usuario_responsable_id) where activo;

-- ---------------------------------------------------------------------
-- 3. Ejecuciones
-- ---------------------------------------------------------------------
create table if not exists public.ejecuciones_checklist (
  id                        uuid primary key default gen_random_uuid(),
  formulario_id             uuid not null references public.formularios(id) on delete cascade,
  unidad_id                 uuid not null references public.unidades(id) on delete cascade,
  area_trabajo_id           uuid references public.areas_trabajo(id) on delete set null,
  asignacion_id             uuid references public.asignaciones_formulario(id) on delete set null,
  auditor_id                uuid not null references public.usuarios(id) on delete restrict,
  fecha_programada          date not null,
  ventana_inicio            timestamptz not null,
  ventana_fin               timestamptz not null,
  fecha_hora_inicio         timestamptz,
  fecha_hora_registro       timestamptz,
  tiempo_ejecucion_minutos  int check (tiempo_ejecucion_minutos >= 0),
  calificacion_porcentaje   numeric(5,2) check (calificacion_porcentaje between 0 and 100),
  etiqueta_calificacion     text check (etiqueta_calificacion in ('Bueno','Regular','Deficiente')),
  estado                    text not null default 'Pendiente' check (estado in ('Pendiente','Vencida','Finalizado')),
  completado_fuera_plazo    boolean not null default false,
  auditado_descripcion      text,
  firma_auditor_base64      text,
  correo_enviado            boolean not null default false,
  correo_enviado_at         timestamptz,
  created_at                timestamptz not null default now(),
  constraint ux_ejecucion_dia unique (asignacion_id, fecha_programada)
);
create index if not exists ix_ejec_unidad_fecha on public.ejecuciones_checklist (unidad_id, fecha_programada desc);
create index if not exists ix_ejec_auditor_estado on public.ejecuciones_checklist (auditor_id, estado);
create index if not exists ix_ejec_estado_ventana on public.ejecuciones_checklist (estado, ventana_fin);
create index if not exists ix_ejec_registro on public.ejecuciones_checklist (fecha_hora_registro) where estado = 'Finalizado';

create table if not exists public.ejecucion_respuestas (
  id                             uuid primary key default gen_random_uuid(),
  ejecucion_id                   uuid not null references public.ejecuciones_checklist(id) on delete cascade,
  pregunta_id                    uuid references public.formulario_preguntas(id) on delete set null,
  trabajador_id                  uuid references public.trabajadores(id) on delete set null,
  equipo_id                      uuid references public.equipos(id) on delete set null,
  seccion_nombre                 text,       -- snapshot (sección o área) para reportes/PDF
  subcategoria                   text,       -- snapshot
  item_descripcion               text,       -- snapshot (pregunta / trabajador / equipo)
  respuesta_seleccionada         text,
  es_conforme                    boolean,    -- NULL = No aplica
  observacion_accion_correctiva  text,
  valores                        jsonb not null default '{}'::jsonb,  -- campos adicionales (temperatura, turno, %CP...)
  orden                          int not null default 0
);
create index if not exists ix_resp_ejec on public.ejecucion_respuestas (ejecucion_id, orden);
create index if not exists ix_resp_trab on public.ejecucion_respuestas (trabajador_id) where trabajador_id is not null;
create index if not exists ix_resp_equipo on public.ejecucion_respuestas (equipo_id) where equipo_id is not null;
create index if not exists ix_resp_pregunta on public.ejecucion_respuestas (pregunta_id) where pregunta_id is not null;

create table if not exists public.notificaciones_internas (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references public.usuarios(id) on delete cascade,
  ejecucion_id    uuid references public.ejecuciones_checklist(id) on delete cascade,
  tipo_alerta     text not null check (tipo_alerta in ('inicio_turno','cierre_proximo')),
  mensaje         text not null,
  leida           boolean not null default false,
  fecha_creacion  timestamptz not null default now(),
  constraint ux_notif_unica unique (usuario_id, ejecucion_id, tipo_alerta)
);
create index if not exists ix_notif_usuario on public.notificaciones_internas (usuario_id, leida, fecha_creacion desc);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['unidades','areas_trabajo','usuarios','trabajadores','equipos','frecuencias_ejecucion','formularios'] loop
    execute format('drop trigger if exists trg_%1$s_upd on public.%1$s', t);
    execute format('create trigger trg_%1$s_upd before update on public.%1$s for each row execute function public.fn_set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Funciones de contexto del usuario (usadas por RLS)
-- ---------------------------------------------------------------------
create or replace function public.app_rol() returns text
language sql stable security definer set search_path = public as $$
  select rol from public.usuarios where id = auth.uid() and activo
$$;

create or replace function public.app_unidad() returns uuid
language sql stable security definer set search_path = public as $$
  select unidad_id from public.usuarios where id = auth.uid() and activo
$$;

create or replace function public.app_area() returns uuid
language sql stable security definer set search_path = public as $$
  select area_trabajo_id from public.usuarios where id = auth.uid() and activo
$$;

create or replace function public.app_es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'administrador_aplicacion' from public.usuarios where id = auth.uid() and activo), false)
$$;

-- ---------------------------------------------------------------------
-- 5. Reglas de negocio en BD
-- ---------------------------------------------------------------------
create or replace function public.fn_etiqueta_calificacion(p numeric) returns text
language sql immutable as $$
  select case when p is null then null
              when p >= 90 then 'Bueno'
              when p >= 70 then 'Regular'
              else 'Deficiente' end
$$;

-- 5.1 Genera las instancias "Pendiente" del día para cada asignación activa
create or replace function public.fn_generar_instancias(p_fecha date default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_tz    text := public.fn_app_tz();
  v_fecha date := coalesce(p_fecha, (now() at time zone v_tz)::date);
  v_n     int;
begin
  insert into public.ejecuciones_checklist
    (formulario_id, unidad_id, area_trabajo_id, asignacion_id, auditor_id,
     fecha_programada, ventana_inicio, ventana_fin, estado)
  select f.id, f.unidad_id,
         case when u.rol = 'jefe_area' then u.area_trabajo_id end,
         a.id, u.id, v_fecha,
         (v_fecha + fr.hora_inicio) at time zone v_tz,
         (v_fecha + fr.hora_fin + case when fr.hora_fin <= fr.hora_inicio then interval '1 day' else interval '0' end) at time zone v_tz,
         'Pendiente'
  from public.asignaciones_formulario a
  join public.formularios f            on f.id = a.formulario_id and f.activo
  join public.usuarios u               on u.id = a.usuario_responsable_id and u.activo
  join public.frecuencias_ejecucion fr on fr.id = a.frecuencia_id and fr.activo
  where a.activo
    and extract(isodow from v_fecha)::smallint = any (fr.dias_semana)
  on conflict (asignacion_id, fecha_programada) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 5.2 Marca vencidas y genera alertas internas (inicio de ventana y 1 h antes del cierre)
create or replace function public.fn_procesar_alertas(p_usuario uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tz text := public.fn_app_tz();
  v_venc int; v_ini int; v_cie int;
begin
  update public.ejecuciones_checklist e
     set estado = 'Vencida'
   where e.estado = 'Pendiente' and now() > e.ventana_fin
     and (p_usuario is null or e.auditor_id = p_usuario);
  get diagnostics v_venc = row_count;

  insert into public.notificaciones_internas (usuario_id, ejecucion_id, tipo_alerta, mensaje)
  select e.auditor_id, e.id, 'inicio_turno',
         format('Inició la ventana del check list "%s" (%s - %s). Estado: Pendiente.',
                f.nombre, to_char(e.ventana_inicio at time zone v_tz, 'HH24:MI'), to_char(e.ventana_fin at time zone v_tz, 'HH24:MI'))
  from public.ejecuciones_checklist e
  join public.formularios f on f.id = e.formulario_id
  where e.estado = 'Pendiente' and now() >= e.ventana_inicio and now() < e.ventana_fin
    and (p_usuario is null or e.auditor_id = p_usuario)
  on conflict (usuario_id, ejecucion_id, tipo_alerta) do nothing;
  get diagnostics v_ini = row_count;

  insert into public.notificaciones_internas (usuario_id, ejecucion_id, tipo_alerta, mensaje)
  select e.auditor_id, e.id, 'cierre_proximo',
         format('Queda 1 hora para el cierre del check list "%s" (cierra a las %s). Aún está Pendiente.',
                f.nombre, to_char(e.ventana_fin at time zone v_tz, 'HH24:MI'))
  from public.ejecuciones_checklist e
  join public.formularios f on f.id = e.formulario_id
  where e.estado = 'Pendiente' and now() >= e.ventana_fin - interval '1 hour' and now() < e.ventana_fin
    and (p_usuario is null or e.auditor_id = p_usuario)
  on conflict (usuario_id, ejecucion_id, tipo_alerta) do nothing;
  get diagnostics v_cie = row_count;

  return jsonb_build_object('vencidas', v_venc, 'alertas_inicio', v_ini, 'alertas_cierre', v_cie);
end $$;

-- 5.3 Motor completo (lo invoca el cron de Render y el frontend)
create or replace function public.fn_motor_frecuencias(p_usuario uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tz  text := public.fn_app_tz();
  v_hoy date := (now() at time zone v_tz)::date;
  v_gen int;
begin
  v_gen := public.fn_generar_instancias(v_hoy);
  return jsonb_build_object('fecha', v_hoy, 'instancias_generadas', v_gen) || public.fn_procesar_alertas(p_usuario);
end $$;

-- 5.4 Cierre atómico de una ejecución (cabecera + respuestas en una sola transacción)
create or replace function public.fn_finalizar_ejecucion(p_ejecucion uuid, p_auditor uuid, p_datos jsonb, p_respuestas jsonb)
returns public.ejecuciones_checklist
language plpgsql security definer set search_path = public as $$
declare v public.ejecuciones_checklist;
begin
  update public.ejecuciones_checklist e set
    fecha_hora_inicio        = (p_datos->>'fecha_hora_inicio')::timestamptz,
    fecha_hora_registro      = (p_datos->>'fecha_hora_registro')::timestamptz,
    tiempo_ejecucion_minutos = (p_datos->>'tiempo_ejecucion_minutos')::int,
    calificacion_porcentaje  = (p_datos->>'calificacion_porcentaje')::numeric,
    etiqueta_calificacion    = public.fn_etiqueta_calificacion((p_datos->>'calificacion_porcentaje')::numeric),
    auditado_descripcion     = p_datos->>'auditado_descripcion',
    firma_auditor_base64     = p_datos->>'firma_auditor_base64',
    completado_fuera_plazo   = (p_datos->>'fecha_hora_registro')::timestamptz > e.ventana_fin,
    estado                   = 'Finalizado'
  where e.id = p_ejecucion and e.auditor_id = p_auditor and e.estado <> 'Finalizado'
  returning * into v;

  if not found then
    raise exception 'La ejecución no existe, no le pertenece o ya fue finalizada' using errcode = 'P0001';
  end if;

  insert into public.ejecucion_respuestas
    (ejecucion_id, pregunta_id, trabajador_id, equipo_id, seccion_nombre, subcategoria, item_descripcion,
     respuesta_seleccionada, es_conforme, observacion_accion_correctiva, valores, orden)
  select p_ejecucion, x.pregunta_id, x.trabajador_id, x.equipo_id, x.seccion_nombre, x.subcategoria, x.item_descripcion,
         x.respuesta_seleccionada, x.es_conforme, nullif(trim(x.observacion_accion_correctiva), ''), coalesce(x.valores, '{}'::jsonb), x.orden
  from jsonb_to_recordset(p_respuestas) as x(
    pregunta_id uuid, trabajador_id uuid, equipo_id uuid, seccion_nombre text, subcategoria text, item_descripcion text,
    respuesta_seleccionada text, es_conforme boolean, observacion_accion_correctiva text, valores jsonb, orden int);

  -- Las alertas pendientes de esta ejecución dejan de ser relevantes
  update public.notificaciones_internas set leida = true where ejecucion_id = p_ejecucion and not leida;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 6. Vistas de indicadores
-- ---------------------------------------------------------------------
-- 6.1 Base de evaluaciones individuales (trabajador/equipo) en ventana móvil de 30 días
create or replace view public.v_reincidencia_30d with (security_invoker = on) as
select 'trabajador'::text as tipo,
       r.trabajador_id    as entidad_id,
       t.nombre_completo  as nombre,
       e.unidad_id,
       un.nombre          as unidad,
       ar.descripcion_area as area,
       count(*)                                         as evaluaciones_aplicables,
       count(*) filter (where r.es_conforme = false)    as incumplimientos,
       round(100.0 * count(*) filter (where r.es_conforme = false) / count(*), 2) as porcentaje_incumplimiento,
       max(e.fecha_hora_registro)                       as ultima_evaluacion
from public.ejecucion_respuestas r
join public.ejecuciones_checklist e on e.id = r.ejecucion_id and e.estado = 'Finalizado'
join public.trabajadores t on t.id = r.trabajador_id
join public.unidades un on un.id = e.unidad_id
left join public.areas_trabajo ar on ar.id = t.area_trabajo_id
where r.trabajador_id is not null and r.es_conforme is not null
  and e.fecha_hora_registro >= now() - interval '30 days'
group by r.trabajador_id, t.nombre_completo, e.unidad_id, un.nombre, ar.descripcion_area
union all
select 'equipo', r.equipo_id, q.codigo_equipo || ' - ' || q.descripcion_equipo, e.unidad_id, un.nombre, ar.descripcion_area,
       count(*), count(*) filter (where r.es_conforme = false),
       round(100.0 * count(*) filter (where r.es_conforme = false) / count(*), 2),
       max(e.fecha_hora_registro)
from public.ejecucion_respuestas r
join public.ejecuciones_checklist e on e.id = r.ejecucion_id and e.estado = 'Finalizado'
join public.equipos q on q.id = r.equipo_id
join public.unidades un on un.id = e.unidad_id
left join public.areas_trabajo ar on ar.id = q.area_trabajo_id
where r.equipo_id is not null and r.es_conforme is not null
  and e.fecha_hora_registro >= now() - interval '30 days'
group by r.equipo_id, q.codigo_equipo, q.descripcion_equipo, e.unidad_id, un.nombre, ar.descripcion_area;

-- 6.2 Indicador de Alerta Crítica: > 50 % de incumplimiento en los últimos 30 días
create or replace view public.v_alerta_critica_30d with (security_invoker = on) as
select * from public.v_reincidencia_30d where porcentaje_incumplimiento > 50;

-- 6.3 Recurrencia de incumplimiento por pregunta / aspecto, área y formulario
create or replace view public.v_recurrencia_incumplimiento with (security_invoker = on) as
select e.unidad_id, f.id as formulario_id, f.nombre as formulario,
       coalesce(r.seccion_nombre, '-') as area_seccion,
       case when f.tipo_evaluacion = 'general' then r.item_descripcion else f.nombre end as aspecto,
       count(*) filter (where r.es_conforme is not null) as aplicables,
       count(*) filter (where r.es_conforme = false)     as incumplimientos,
       min(e.fecha_hora_registro) as desde, max(e.fecha_hora_registro) as hasta
from public.ejecucion_respuestas r
join public.ejecuciones_checklist e on e.id = r.ejecucion_id and e.estado = 'Finalizado'
join public.formularios f on f.id = e.formulario_id
group by e.unidad_id, f.id, f.nombre, coalesce(r.seccion_nombre, '-'),
         case when f.tipo_evaluacion = 'general' then r.item_descripcion else f.nombre end;

-- Función parametrizable (ventana y umbral) por si se requiere vía RPC
create or replace function public.fn_alerta_critica(p_unidad uuid default null, p_dias int default 30, p_umbral numeric default 50)
returns table (tipo text, entidad_id uuid, nombre text, unidad text, area text,
               evaluaciones_aplicables bigint, incumplimientos bigint, porcentaje_incumplimiento numeric)
language sql stable security invoker set search_path = public as $$
  with base as (
    select 'trabajador'::text tipo, r.trabajador_id ent, t.nombre_completo nom, un.nombre uni, ar.descripcion_area are, r.es_conforme
    from ejecucion_respuestas r
    join ejecuciones_checklist e on e.id = r.ejecucion_id and e.estado = 'Finalizado'
    join trabajadores t on t.id = r.trabajador_id
    join unidades un on un.id = e.unidad_id
    left join areas_trabajo ar on ar.id = t.area_trabajo_id
    where r.es_conforme is not null and e.fecha_hora_registro >= now() - make_interval(days => p_dias)
      and (p_unidad is null or e.unidad_id = p_unidad)
    union all
    select 'equipo', r.equipo_id, q.codigo_equipo || ' - ' || q.descripcion_equipo, un.nombre, ar.descripcion_area, r.es_conforme
    from ejecucion_respuestas r
    join ejecuciones_checklist e on e.id = r.ejecucion_id and e.estado = 'Finalizado'
    join equipos q on q.id = r.equipo_id
    join unidades un on un.id = e.unidad_id
    left join areas_trabajo ar on ar.id = q.area_trabajo_id
    where r.es_conforme is not null and e.fecha_hora_registro >= now() - make_interval(days => p_dias)
      and (p_unidad is null or e.unidad_id = p_unidad)
  )
  select tipo, ent, nom, uni, are, count(*), count(*) filter (where not es_conforme),
         round(100.0 * count(*) filter (where not es_conforme) / count(*), 2)
  from base group by tipo, ent, nom, uni, are
  having 100.0 * count(*) filter (where not es_conforme) / count(*) > p_umbral
  order by 8 desc
$$;

-- ---------------------------------------------------------------------
-- 7. Row Level Security (aislamiento por unidad y área)
--    El backend usa la service_role (omite RLS) y replica estos mismos
--    filtros en código; las políticas protegen cualquier acceso directo
--    con la anon key + JWT del usuario.
-- ---------------------------------------------------------------------
alter table public.unidades                enable row level security;
alter table public.areas_trabajo           enable row level security;
alter table public.usuarios                enable row level security;
alter table public.trabajadores            enable row level security;
alter table public.equipos                 enable row level security;
alter table public.frecuencias_ejecucion   enable row level security;
alter table public.formularios             enable row level security;
alter table public.formulario_secciones    enable row level security;
alter table public.formulario_preguntas    enable row level security;
alter table public.formulario_equipos      enable row level security;
alter table public.asignaciones_formulario enable row level security;
alter table public.ejecuciones_checklist   enable row level security;
alter table public.ejecucion_respuestas    enable row level security;
alter table public.notificaciones_internas enable row level security;

-- Limpieza idempotente de políticas
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' and policyname like 'p\_%' loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Administrador de la aplicación: acceso total a todo
do $$
declare t text;
begin
  foreach t in array array['unidades','areas_trabajo','usuarios','trabajadores','equipos','frecuencias_ejecucion',
                           'formularios','formulario_secciones','formulario_preguntas','formulario_equipos',
                           'asignaciones_formulario','ejecuciones_checklist','ejecucion_respuestas','notificaciones_internas'] loop
    execute format('create policy p_admin_all on public.%I for all to authenticated using (public.app_es_admin()) with check (public.app_es_admin())', t);
  end loop;
end $$;

-- Lectura acotada a la unidad asignada
create policy p_unidades_sel on public.unidades for select to authenticated
  using (id = public.app_unidad());

create policy p_areas_sel on public.areas_trabajo for select to authenticated
  using (unidad_id = public.app_unidad()
         and (public.app_rol() <> 'jefe_area' or id = public.app_area()));

create policy p_usuarios_self on public.usuarios for select to authenticated
  using (id = auth.uid()
         or (public.app_rol() = 'administrador_restaurante' and unidad_id = public.app_unidad()));

create policy p_trab_sel on public.trabajadores for select to authenticated
  using (unidad_id = public.app_unidad()
         and (public.app_rol() <> 'jefe_area' or area_trabajo_id = public.app_area()));

create policy p_equipos_sel on public.equipos for select to authenticated
  using (unidad_id = public.app_unidad()
         and (public.app_rol() <> 'jefe_area' or area_trabajo_id = public.app_area()));

create policy p_frec_sel on public.frecuencias_ejecucion for select to authenticated
  using (public.app_rol() is not null);

create policy p_form_sel on public.formularios for select to authenticated
  using (unidad_id = public.app_unidad());

create policy p_secc_sel on public.formulario_secciones for select to authenticated
  using (exists (select 1 from public.formularios f where f.id = formulario_id and f.unidad_id = public.app_unidad()));

create policy p_preg_sel on public.formulario_preguntas for select to authenticated
  using (exists (select 1 from public.formularios f where f.id = formulario_id and f.unidad_id = public.app_unidad()));

create policy p_formeq_sel on public.formulario_equipos for select to authenticated
  using (exists (select 1 from public.formularios f where f.id = formulario_id and f.unidad_id = public.app_unidad()));

create policy p_asig_sel on public.asignaciones_formulario for select to authenticated
  using (usuario_responsable_id = auth.uid()
         or (public.app_rol() = 'administrador_restaurante'
             and exists (select 1 from public.formularios f where f.id = formulario_id and f.unidad_id = public.app_unidad())));

-- Ejecuciones: el administrador de restaurante ve toda su unidad; el jefe de área solo las suyas
create policy p_ejec_sel on public.ejecuciones_checklist for select to authenticated
  using (unidad_id = public.app_unidad()
         and (public.app_rol() = 'administrador_restaurante' or auditor_id = auth.uid()));

create policy p_ejec_upd on public.ejecuciones_checklist for update to authenticated
  using (auditor_id = auth.uid() and estado <> 'Finalizado' and unidad_id = public.app_unidad())
  with check (auditor_id = auth.uid() and unidad_id = public.app_unidad());

create policy p_resp_sel on public.ejecucion_respuestas for select to authenticated
  using (exists (select 1 from public.ejecuciones_checklist e
                 where e.id = ejecucion_id and e.unidad_id = public.app_unidad()
                   and (public.app_rol() = 'administrador_restaurante' or e.auditor_id = auth.uid())));

create policy p_resp_ins on public.ejecucion_respuestas for insert to authenticated
  with check (exists (select 1 from public.ejecuciones_checklist e
                      where e.id = ejecucion_id and e.auditor_id = auth.uid() and e.estado <> 'Finalizado'));

create policy p_notif_sel on public.notificaciones_internas for select to authenticated
  using (usuario_id = auth.uid());

create policy p_notif_upd on public.notificaciones_internas for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Las funciones del motor solo las ejecuta el backend (service_role)
revoke all on function public.fn_generar_instancias(date)        from public, anon, authenticated;
revoke all on function public.fn_procesar_alertas(uuid)          from public, anon, authenticated;
revoke all on function public.fn_motor_frecuencias(uuid)         from public, anon, authenticated;
grant execute on function public.fn_generar_instancias(date)     to service_role;
grant execute on function public.fn_procesar_alertas(uuid)       to service_role;
grant execute on function public.fn_motor_frecuencias(uuid)      to service_role;
revoke all on function public.fn_finalizar_ejecucion(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.fn_finalizar_ejecucion(uuid, uuid, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------
-- 8. Datos iniciales (editables desde el Módulo de Configuración)
-- ---------------------------------------------------------------------
insert into public.unidades (codigo, nombre) values
  ('LMEB',    'LA MAR'),
  ('TLM',     'TANTA LARCO MAR'),
  ('ATO-LIM', 'ATO-LIM')
on conflict (codigo) do nothing;

insert into public.frecuencias_ejecucion (nombre_frecuencia, dias_semana, hora_inicio, hora_fin) values
  ('Diario turno mañana',      '{1,2,3,4,5,6,7}', '08:00', '17:00'),
  ('Diario turno noche',       '{1,2,3,4,5,6,7}', '17:00', '23:30'),
  ('Lunes a viernes apertura', '{1,2,3,4,5}',     '08:00', '12:00'),
  ('Semanal lunes',            '{1}',             '09:00', '18:00')
on conflict do nothing;

-- Programación opcional con pg_cron (alternativa/complemento al cron de Render):
--   create extension if not exists pg_cron;
--   select cron.schedule('motor-checklists', '* * * * *', $$ select public.fn_motor_frecuencias(); $$);
