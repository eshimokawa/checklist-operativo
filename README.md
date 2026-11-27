# Check List Operativo — Multi-sede

Aplicación web responsive (mobile-first) para **gestionar, ejecutar y auditar check lists operativos** en restaurantes multi-sede.
Stack: **Next.js 14 (App Router) full-stack** · **Supabase** (PostgreSQL + Auth + RLS) · **SendGrid** (correo con PDF) · **Render** (web + cron).
Identidad visual tomada de acuriorestaurantes.com: tipografía **Raleway** y la paleta del logotipo (`#870064`, `#A8123E`, `#CB007B`, `#D7282F`, títulos `#71255E`, texto `#534A4B`).


## Novedades de la versión 4

- **Configuración › Formularios › “+ Nuevo formulario”**: crea formularios desde cero sin Excel (general con secciones, subcategorías, preguntas y puntos críticos; de personal; o de equipos con opciones o lectura numérica y regla de conformidad), con selección de equipos y asignación opcional de frecuencia y responsable.
- **Inspección de higiene de personal**: se eliminó la columna “Aspecto” de la tabla de ejecución (los aspectos quedan solo como referencia).
- **Dashboard**: se eliminó “Tendencia diaria de calificación”; las tablas de recurrencia (por pregunta / aspecto, por área y por formulario) se ordenan por “% sobre aplicables” de mayor a menor.
- **Base de datos**: sin cambios. Si ya ejecutó `supabase/schema.sql`, no necesita volver a hacerlo; basta con desplegar el código nuevo en Render.
- `demo/checklist-operativo-v2.html`: versión HTML autónoma de demostración con las mismas funciones (datos en el navegador).

---

## 1. Arquitectura del sistema

```
 Navegador (móvil / PC)                          Render
 ┌───────────────────────┐   HTTPS   ┌───────────────────────────────────────────┐
 │ React (Next.js client)│ ────────► │ Web Service Next.js (Node 22)              │
 │ • Mis check lists     │           │  • Páginas (SSR con verificación de sesión)│
 │ • Ejecución + firma   │ ◄──────── │  • API /api/* (route handlers)             │
 │ • Dashboard/Reportes  │   JSON    │     - alcance por rol/unidad/área          │
 │ • Configuración       │   PDF     │     - parser Excel (exceljs)               │
 │ • Campana de alertas  │   XLSX    │     - PDF (pdfkit) · correo (SendGrid)     │
 └──────────┬────────────┘           └──────┬───────────────┬────────────────────┘
            │ cada minuto: /api/motor/tick  │ service_role   │ API SendGrid
            ▼                               ▼                ▼
                                   ┌──────────────────┐  ┌───────────┐
 Render Cron Job (* * * * *) ────► │ Supabase         │  │ SendGrid  │
 POST /api/cron/motor              │ • Auth (usuarios)│  └───────────┘
                                   │ • PostgreSQL+RLS │
                                   │ • fn_motor_frecuencias / vistas 30 días │
                                   └──────────────────┘
```

**Decisiones clave**

| Tema | Solución |
|---|---|
| Autenticación | Supabase Auth (correo + contraseña) con cookies httpOnly vía `@supabase/ssr`. Sin auto-registro: el administrador crea las cuentas (`auth.admin.createUser`). Desactivar = `ban` en Auth + `activo=false`. |
| Aislamiento multi-sede | **Doble capa**: (1) políticas RLS en todas las tablas (`app_rol()`, `app_unidad()`, `app_area()`); (2) el backend usa `service_role` y aplica los mismos filtros en código (`lib/api.js → unidadEfectiva`, `lib/reporte.js → puedeVer`, `lib/ejecucion.js → construirItems`). |
| Motor de frecuencias | Funciones SQL idempotentes: `fn_generar_instancias` (crea las ejecuciones `Pendiente` del día), `fn_procesar_alertas` (marca `Vencida`; alerta en `hora_inicio` y en `hora_fin − 1 h`). Se ejecutan por **Render Cron (cada minuto)** y por el **navegador** del usuario cada minuto (verificación en tiempo real). Restricciones `UNIQUE` evitan duplicados. |
| Opciones dinámicas | Cada formulario guarda `opciones_respuesta` exactas del Excel + qué opciones son conformes / no aplica. Nunca hay listas fijas. |
| Formularios reales | Parser flexible: detecta la fila “Precompletado / A completar por usuario”, encabezados, celdas “Desplegable con opciones: - A - B”, secciones / subcategorías / preguntas / punto crítico y metadatos `Código:`, `Nombre:`, `Tipo:`, `Estándar:`. |
| Cierre atómico | `fn_finalizar_ejecucion` guarda cabecera + respuestas en una transacción; la calificación se recalcula en el servidor (no se confía en el cliente). |
| Zona horaria | `America/Lima` (`fn_app_tz()` en SQL y `APP_TIMEZONE`). |

**Cómo se interpretan los 3 formularios de `Datos formularios.xlsx`**

| Hoja | Tipo | Evaluación | Observación |
|---|---|---|---|
| Control de temperatura | Equipos (14 equipos precompletados) | `Temperatura real` dentro del `Parámetro` del equipo (ej. 1 °C a 4 °C) = Conforme | Desplegable exacto del Excel (“Se informa a mant…”, “Inoperativo”) |
| Inspección higiene personal | Trabajadores (de la sede y del área del jefe) | `Revisión`: Conforme / No conforme | Texto, obligatorio si No conforme |
| Medición compuestos polares | Equipos (5 freidoras/peroles) | `%Compuestos polares` ≤ 25 % = Conforme (regla editable) | Columna añadida automáticamente; Turno, Temperatura, Días de uso y Baja se registran como datos |

La regla de cada formulario se puede ajustar en **Configuración › Formularios › Editar**.

### Estructura de carpetas

```
checklist-app/
├── app/
│   ├── layout.js · globals.css            # Tema Raleway + paleta corporativa
│   ├── login/page.js                      # Inicio de sesión
│   ├── (app)/                             # Zona autenticada (layout valida sesión)
│   │   ├── tareas/                        # Mis check lists (pendientes / vencidas / finalizadas)
│   │   ├── ejecutar/[id]/                 # Ejecución con cronómetro, tabla dinámica y firma
│   │   ├── dashboard/  reportes/          # Indicadores y historial (admin. restaurante / app)
│   │   └── configuracion/                 # Módulo exclusivo del Administrador de la aplicación
│   └── api/
│       ├── auth/login · auth/logout
│       ├── tareas · notificaciones · motor/tick · cron/motor
│       ├── ejecuciones/[id] (GET) · /finalizar · /correo · /pdf
│       ├── reportes (GET) · reportes/excel · dashboard · catalogos
│       └── config/[entidad] (CRUD) · /importar · /plantilla
│           config/formularios · /analizar · /guardar (Excel o alta manual) · /[id]
├── components/                            # UI cliente (AppShell, Ejecutar, Firma, Dashboard, config/…)
├── lib/
│   ├── supabase/server.js                 # Clientes de sesión y service_role
│   ├── api.js                             # Envoltorio de rutas, roles, errores en español
│   ├── negocio.js                         # Calificación, etiquetas, reglas, días/horas (compartido)
│   ├── ejecucion.js                       # Ítems por tipo de formulario y cierre
│   ├── excel/leer.js · excel/formularios.js  # Lectura Excel y parser de formularios
│   ├── maestros.js · formularios.js       # Carga masiva y guardado de formularios
│   ├── consultas.js · reporte.js          # Filtros de reportes y armado del reporte
│   ├── pdf.js · correo.js                 # PDF (pdfkit) y SendGrid
├── supabase/schema.sql                    # Script SQL completo
├── scripts/crear-admin.mjs · seed-formularios.mjs
├── plantillas/                            # Datos formularios.xlsx + ejemplo de formulario general
├── public/ (logo, ícono, fuentes) · assets/fonts (Raleway para PDF)
├── middleware.js · render.yaml · .env.example
```

---

## 2. Base de datos (Supabase)

Archivo: **`supabase/schema.sql`** (idempotente; puede ejecutarse más de una vez). Incluye:

- Tablas: `unidades`, `areas_trabajo`, `usuarios`, `trabajadores`, `equipos`, `frecuencias_ejecucion`, `formularios`, `formulario_secciones`, `formulario_preguntas`, `formulario_equipos`, `asignaciones_formulario`, `ejecuciones_checklist`, `ejecucion_respuestas`, `notificaciones_internas` con FKs, `CHECK`s e índices.
- Funciones: `fn_generar_instancias`, `fn_procesar_alertas`, `fn_motor_frecuencias`, `fn_finalizar_ejecucion`, `fn_etiqueta_calificacion`, `fn_alerta_critica(unidad, días, umbral)`.
- Vistas: `v_reincidencia_30d`, **`v_alerta_critica_30d`** (> 50 % de incumplimiento en ventana móvil de 30 días, por trabajador o equipo) y `v_recurrencia_incumplimiento`.
- RLS en todas las tablas + datos iniciales (unidades LA MAR, TANTA LARCO MAR, ATO-LIM y 4 frecuencias de ejemplo).

---

## 3. Funcionalidad por rol

| Rol | Acceso |
|---|---|
| Administrador de la aplicación | Configuración completa (maestros, Excel, formularios, frecuencias, asignaciones, activar/desactivar usuarios). También ve dashboard y reportes de todas las unidades. |
| Administrador de restaurante | Su unidad: completa sus check lists, dashboard, historial y exportación Excel. |
| Jefe de área | Su unidad y su área: completa sus check lists (solo ve trabajadores/equipos de su área). |

**Calificación** = conformes / ítems aplicables (excluye No aplica) × 100 → **Bueno** ≥ 90 %, **Regular** 70–89.99 %, **Deficiente** < 70 %.

---

## 4. Puesta en marcha

### 4.1 Supabase
1. Cree un proyecto en supabase.com (región cercana, ej. São Paulo).
2. **SQL Editor › New query** → pegue `supabase/schema.sql` → **Run**.
3. **Authentication › Providers › Email**: deje Email habilitado y **desactive “Allow new users to sign up”** (nadie se auto-registra).
4. **Project Settings › API**: copie `Project URL` (SUPABASE_URL), `anon public` (SUPABASE_ANON_KEY) y `service_role` (SUPABASE_SERVICE_ROLE_KEY, secreta).

### 4.2 SendGrid
1. **Settings › Sender Authentication**: verifique un remitente (Single Sender) o su dominio. Ese correo será `SENDGRID_FROM_EMAIL`.
2. **Settings › API Keys › Create** con permiso *Mail Send* → `SENDGRID_API_KEY`.

### 4.3 Render
1. Suba esta carpeta a un repositorio de GitHub/GitLab (sin `node_modules` ni `.env`).
2. Render › **New › Blueprint** → elija el repositorio (usa `render.yaml`).
3. Complete las variables marcadas como `sync: false`:

| Variable | Servicio | Valor |
|---|---|---|
| `SUPABASE_URL` | web | URL del proyecto |
| `SUPABASE_ANON_KEY` | web | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | web | service_role key (secreta) |
| `SENDGRID_API_KEY` | web | API key |
| `SENDGRID_FROM_EMAIL` | web | remitente verificado |
| `APP_URL` | cron | URL pública del web service (ej. `https://checklist-operativo.onrender.com`) |
| `CRON_SECRET` | ambos | se genera solo y el cron la toma del web service |
| `APP_TIMEZONE`, `SENDGRID_FROM_NAME`, `NODE_VERSION` | — | ya vienen definidos |

4. Despliegue. Verifique `https://<servicio>/login`.

> Recomendado (sin costo, es lo que usa la versión publicada): en Supabase habilite la extensión `pg_cron` y ejecute la línea comentada al final de `schema.sql` (`select cron.schedule('motor-checklists', '* * * * *', ...)`). Puede eliminar entonces el servicio `cron` de `render.yaml`.

### 4.4 Primer administrador y carga inicial
```bash
npm install
cp .env.example .env.local        # complete SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
node scripts/crear-admin.mjs admin@empresa.com "Nombre Apellido" "Contraseña-Segura-123"
```
Ingrese con esa cuenta y, en **Configuración**, cargue en este orden (cada pestaña tiene **Plantilla** e **Importar Excel**):
1. Unidades → 2. Zonas/Áreas → 3. Usuarios (se muestran las contraseñas temporales generadas) → 4. Trabajadores → 5. Equipos → 6. Frecuencias
7. **Formularios**: “+ Nuevo formulario” para crearlos desde cero, o “Subir Excel” con `plantillas/Datos formularios.xlsx` (o los suyos), revise lo detectado, elija unidad, frecuencia y responsable → Guardar.
8. **Asignaciones**: formulario + usuario responsable + frecuencia (puede haber varias por formulario).

Opcional, precarga por consola: `node scripts/seed-formularios.mjs "plantillas/Datos formularios.xlsx" "LA MAR"`.

Formato de Excel para formularios **generales** (ver `plantillas/Plantilla formulario general (ejemplo La Mar).xlsx`): filas opcionales `Código:`, `Nombre:`, `Tipo:`, `Estándar:` y luego columnas `Sección | Subcategoría | Pregunta | Punto crítico | Opciones de respuesta` (ej. `SI / NO / N/A`).

### 4.5 Desarrollo local
```bash
npm install
cp .env.example .env.local   # complete todas las variables
npm run dev                  # http://localhost:3000
```

---

## 5. Flujo de ejecución (resumen)
1. El motor crea la tarea `Pendiente` del día según la frecuencia; a la `hora_inicio` y a `hora_fin − 1 h` se crea una alerta en la campana (solo dentro de la app). Pasada la `hora_fin` pasa a `Vencida` (se puede completar igual; queda marcado “fuera de plazo”).
2. Al abrir el check list inicia el cronómetro `mm:ss`; se muestran acordeones por sección/área con las opciones exactas del formulario y la calificación en vivo.
3. Toda respuesta no conforme exige observación/acción correctiva.
4. **Finalizar** → firma del auditor en canvas táctil → se guardan fecha/hora de registro, minutos, responsable, calificación y estado `Finalizado`.
5. Modal “¿Desea enviar el reporte por correo?” → PDF + correo vía SendGrid al correo del usuario en el maestro `usuarios`.

Ejemplo (Caso 2): Jefe de Cocina de TANTA LARCO MAR → ve solo los 10 trabajadores de Cocina; 9 Conforme y 1 No conforme (“Uñas largas sin recortar”) → **90.00 % (Bueno)**. Si ese trabajador supera el 50 % de incumplimientos en 30 días aparece en **Alerta crítica** del dashboard.

---

## 6. Seguridad
- `SUPABASE_SERVICE_ROLE_KEY` solo existe en el servidor; el navegador nunca recibe claves de Supabase.
- `/api/cron/motor` exige `Authorization: Bearer CRON_SECRET`.
- Solo el responsable asignado puede completar su check list; las respuestas finalizadas no se pueden modificar.
- Usuarios desactivados quedan bloqueados en Supabase Auth y en la app.

Fuentes: Raleway (SIL Open Font License). El logotipo `public/logo.png` es un genérico; reemplácelo por el oficial manteniendo el nombre del archivo (se usa en la app, el PDF y el correo).
