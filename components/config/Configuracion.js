'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, Cargando, Modal, descargar, useToast } from '../ui';
import { DIAS, diasATexto } from '@/lib/negocio';
import Formularios from './Formularios';

const ROLES = [
  ['administrador_aplicacion', 'Administrador de la aplicación'],
  ['administrador_restaurante', 'Administrador de restaurante'],
  ['jefe_area', 'Jefe de área'],
];
const ROL_TXT = Object.fromEntries(ROLES);

export const ESQUEMAS = {
  unidades: {
    titulo: 'Unidades', importable: true,
    campos: [{ k: 'codigo', t: 'Código' }, { k: 'nombre', t: 'Nombre' }, { k: 'activo', t: 'Activo', tipo: 'bool' }],
  },
  areas: {
    titulo: 'Zonas / Áreas de trabajo', importable: true,
    campos: [{ k: 'descripcion_area', t: 'Descripción del área' }, { k: 'unidad_id', t: 'Unidad', tipo: 'unidad' }, { k: 'activo', t: 'Activo', tipo: 'bool' }],
  },
  trabajadores: {
    titulo: 'Trabajadores', importable: true,
    campos: [{ k: 'nombre_completo', t: 'Nombre completo' }, { k: 'unidad_id', t: 'Unidad', tipo: 'unidad' }, { k: 'area_trabajo_id', t: 'Área', tipo: 'area' }, { k: 'activo', t: 'Activo', tipo: 'bool' }],
  },
  equipos: {
    titulo: 'Equipos', importable: true,
    campos: [
      { k: 'codigo_equipo', t: 'Código' }, { k: 'descripcion_equipo', t: 'Descripción' }, { k: 'tipo_equipo', t: 'Tipo', opcional: true },
      { k: 'unidad_id', t: 'Unidad', tipo: 'unidad' }, { k: 'area_trabajo_id', t: 'Área', tipo: 'area' },
      { k: 'temperatura_funcionamiento', t: 'Temp. funcionamiento', opcional: true, ayuda: 'Ej. 1°C a 4°C' }, { k: 'activo', t: 'Activo', tipo: 'bool' },
    ],
  },
  usuarios: {
    titulo: 'Usuarios', importable: true,
    campos: [
      { k: 'nombre_completo', t: 'Nombre completo' }, { k: 'correo', t: 'Correo', tipo: 'email' },
      { k: 'rol', t: 'Rol', tipo: 'rol' }, { k: 'unidad_id', t: 'Unidad', tipo: 'unidad', opcional: true },
      { k: 'area_trabajo_id', t: 'Área', tipo: 'area', opcional: true }, { k: 'password', t: 'Contraseña', tipo: 'password', soloForm: true, opcional: true },
      { k: 'activo', t: 'Cuenta activa', tipo: 'bool' },
    ],
  },
  frecuencias: {
    titulo: 'Frecuencias de ejecución', importable: true,
    campos: [
      { k: 'nombre_frecuencia', t: 'Nombre' }, { k: 'dias_semana', t: 'Días', tipo: 'dias' },
      { k: 'hora_inicio', t: 'Hora inicio', tipo: 'hora' }, { k: 'hora_fin', t: 'Hora fin', tipo: 'hora' }, { k: 'activo', t: 'Activo', tipo: 'bool' },
    ],
  },
  asignaciones: {
    titulo: 'Asignaciones', importable: false,
    campos: [
      { k: 'formulario_id', t: 'Formulario', tipo: 'formulario' }, { k: 'usuario_responsable_id', t: 'Usuario responsable', tipo: 'usuario' },
      { k: 'frecuencia_id', t: 'Frecuencia', tipo: 'frecuencia' }, { k: 'activo', t: 'Activo', tipo: 'bool' },
    ],
  },
};

const PESTANAS = [
  ['formularios', 'Formularios'], ['asignaciones', 'Asignaciones'], ['usuarios', 'Usuarios'], ['trabajadores', 'Trabajadores'],
  ['equipos', 'Equipos'], ['areas', 'Zonas / Áreas'], ['frecuencias', 'Frecuencias'], ['unidades', 'Unidades'],
];

export function useCatalogoConfig() {
  const [cat, setCat] = useState({ unidades: [], areas: [], formularios: [], usuarios: [], frecuencias: [] });
  const recargar = useCallback(async () => {
    const [u, a, f, us, fr] = await Promise.all(['unidades', 'areas', 'formularios', 'usuarios', 'frecuencias'].map((e) => api(`/api/config/${e}`).catch(() => ({ filas: [] }))));
    setCat({ unidades: u.filas, areas: a.filas, formularios: f.filas, usuarios: us.filas, frecuencias: fr.filas });
  }, []);
  useEffect(() => { recargar(); }, [recargar]);
  return [cat, recargar];
}

export default function Configuracion({ yo }) {
  const [tab, setTab] = useState('formularios');
  const [cat, recargarCat] = useCatalogoConfig();
  return (
    <>
      <h1>Módulo de Configuración</h1>
      <p className="suave pequeno mb">Carga de maestros y formularios desde Excel, asignación de frecuencias y responsables, y activación de usuarios.</p>
      <div className="pestanas">
        {PESTANAS.map(([k, t]) => <button key={k} className={tab === k ? 'activa' : ''} onClick={() => setTab(k)}>{t}</button>)}
      </div>
      {tab === 'formularios'
        ? <Formularios cat={cat} onCambio={recargarCat} />
        : <CrudMaestro key={tab} entidad={tab} cat={cat} onCambio={recargarCat} yo={yo} />}
    </>
  );
}

function valorMostrado(campo, r) {
  const v = r[campo.k];
  switch (campo.tipo) {
    case 'bool': return <span className={`chip ${v ? 'Finalizado' : 'Vencida'}`}>{v ? 'Activo' : 'Inactivo'}</span>;
    case 'unidad': return r.unidad?.nombre || '—';
    case 'area': return r.area?.descripcion_area || '—';
    case 'rol': return ROL_TXT[v] || v;
    case 'dias': return diasATexto(v || []);
    case 'hora': return String(v || '').slice(0, 5);
    case 'formulario': return r.formulario ? `${r.formulario.codigo} - ${r.formulario.nombre} (${r.formulario.unidad?.nombre || ''})` : '—';
    case 'usuario': return r.usuario ? `${r.usuario.nombre_completo}` : '—';
    case 'frecuencia': return r.frecuencia ? `${r.frecuencia.nombre_frecuencia} · ${diasATexto(r.frecuencia.dias_semana)} ${String(r.frecuencia.hora_inicio).slice(0, 5)}–${String(r.frecuencia.hora_fin).slice(0, 5)}` : '—';
    default: return v ?? '—';
  }
}

function CrudMaestro({ entidad, cat, onCambio, yo }) {
  const esq = ESQUEMAS[entidad];
  const avisar = useToast();
  const [filas, setFilas] = useState(null);
  const [buscar, setBuscar] = useState('');
  const [edicion, setEdicion] = useState(null); // {id?, datos}
  const [guardando, setGuardando] = useState(false);
  const [importe, setImporte] = useState(null); // {resultado?}

  const cargar = useCallback(async () => {
    try { setFilas((await api(`/api/config/${entidad}`)).filas); } catch (e) { avisar(e.message, 'error'); setFilas([]); }
  }, [entidad, avisar]);
  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => {
    if (!filas) return [];
    const q = buscar.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [filas, buscar]);

  function nuevo() {
    const d = { activo: true };
    if (entidad === 'frecuencias') Object.assign(d, { dias_semana: [1, 2, 3, 4, 5, 6, 7], hora_inicio: '08:00', hora_fin: '17:00' });
    if (entidad === 'usuarios') d.rol = 'jefe_area';
    setEdicion({ datos: d });
  }
  function editar(r) {
    const d = {};
    esq.campos.forEach((c) => { if (!c.soloForm) d[c.k] = c.tipo === 'hora' ? String(r[c.k] || '').slice(0, 5) : r[c.k]; });
    setEdicion({ id: r.id, datos: d });
  }

  async function guardar() {
    setGuardando(true);
    try {
      const datos = { ...edicion.datos };
      if (!datos.password) delete datos.password;
      const r = edicion.id
        ? await api(`/api/config/${entidad}?id=${edicion.id}`, { method: 'PATCH', json: datos })
        : await api(`/api/config/${entidad}`, { method: 'POST', json: datos });
      if (entidad === 'usuarios' && !edicion.id && r.password) {
        avisar(`Usuario creado. Contraseña ${datos.password ? 'asignada' : 'temporal: ' + r.password}`, 'ok', 20000);
      } else avisar('Guardado correctamente', 'ok');
      setEdicion(null);
      await cargar();
      onCambio?.();
    } catch (e) { avisar(e.message, 'error', 8000); }
    finally { setGuardando(false); }
  }

  async function alternarActivo(r) {
    try {
      await api(`/api/config/${entidad}?id=${r.id}`, { method: 'PATCH', json: { activo: !r.activo } });
      avisar(r.activo ? 'Desactivado' : 'Activado', 'ok');
      cargar(); onCambio?.();
    } catch (e) { avisar(e.message, 'error'); }
  }
  async function eliminar(r) {
    if (!window.confirm('¿Eliminar este registro de forma permanente? Esta acción no se puede deshacer.')) return;
    try {
      await api(`/api/config/${entidad}?id=${r.id}`, { method: 'DELETE' });
      avisar('Eliminado', 'ok'); cargar(); onCambio?.();
    } catch (e) { avisar(e.message, 'error', 9000); }
  }
  async function importar(archivo) {
    const fd = new FormData();
    fd.append('archivo', archivo);
    setImporte({ cargando: true });
    try {
      const r = await api(`/api/config/${entidad}/importar`, { method: 'POST', body: fd });
      setImporte({ resultado: r });
      cargar(); onCambio?.();
    } catch (e) { setImporte(null); avisar(e.message, 'error', 9000); }
  }

  const columnas = esq.campos.filter((c) => !c.soloForm);
  return (
    <div className="tarjeta">
      <div className="fila-entre mb">
        <h2 style={{ margin: 0 }}>{esq.titulo} {filas && <span className="suave pequeno">({filas.length})</span>}</h2>
        <div className="fila">
          <input placeholder="Buscar…" value={buscar} onChange={(e) => setBuscar(e.target.value)} style={{ width: 200 }} />
          {esq.importable && (
            <>
              <button className="btn fantasma peq" onClick={() => descargar(`/api/config/${entidad}/plantilla`, `plantilla_${entidad}.xlsx`).catch((e) => avisar(e.message, 'error'))}>Plantilla</button>
              <label className="btn sec peq" style={{ cursor: 'pointer' }}>Importar Excel
                <input type="file" accept=".xlsx" hidden onChange={(e) => { if (e.target.files[0]) importar(e.target.files[0]); e.target.value = ''; }} />
              </label>
            </>
          )}
          <button className="btn peq" onClick={nuevo}>+ Nuevo</button>
        </div>
      </div>
      {!filas ? <Cargando /> : (
        <div className="tabla-wrap">
          <table className="tabla">
            <thead><tr>{columnas.map((c) => <th key={c.k}>{c.t}</th>)}<th style={{ width: 210 }}>Acciones</th></tr></thead>
            <tbody>
              {visibles.length === 0 && <tr><td colSpan={columnas.length + 1} className="vacio">Sin registros.</td></tr>}
              {visibles.slice(0, 500).map((r) => (
                <tr key={r.id}>
                  {columnas.map((c) => <td key={c.k}>{valorMostrado(c, r)}</td>)}
                  <td>
                    <div className="fila" style={{ gap: 4 }}>
                      <button className="btn fantasma peq" onClick={() => editar(r)}>Editar</button>
                      {'activo' in r && r.id !== yo && <button className="btn fantasma peq" onClick={() => alternarActivo(r)}>{r.activo ? 'Desactivar' : 'Activar'}</button>}
                      {r.id !== yo && <button className="btn fantasma peq" style={{ color: 'var(--rojo-alerta)' }} onClick={() => eliminar(r)}>Eliminar</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibles.length > 500 && <div className="suave pequeno" style={{ padding: 8 }}>Mostrando 500 de {visibles.length}. Use el buscador para filtrar.</div>}
        </div>
      )}

      <Modal abierto={!!edicion} onCerrar={() => setEdicion(null)} titulo={`${edicion?.id ? 'Editar' : 'Nuevo'} · ${esq.titulo}`}
        pie={<><button className="btn sec" onClick={() => setEdicion(null)}>Cancelar</button><button className="btn" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</button></>}>
        {edicion && <FormularioCampos esq={esq} datos={edicion.datos} esNuevo={!edicion.id} cat={cat} onCambio={(d) => setEdicion({ ...edicion, datos: d })} />}
      </Modal>

      <Modal abierto={!!importe} onCerrar={() => !importe?.cargando && setImporte(null)} titulo="Resultado de la carga masiva" ancho>
        {importe?.cargando ? <Cargando texto="Procesando archivo…" /> : importe?.resultado && <ResultadoImporte r={importe.resultado} />}
      </Modal>
    </div>
  );
}

function ResultadoImporte({ r }) {
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="fila">
        <span className="chip">Procesados: {r.procesados}</span>
        <span className="chip Finalizado">Nuevos: {r.insertados}</span>
        <span className="chip">Actualizados: {r.actualizados}</span>
        <span className={`chip ${r.errores.length ? 'Vencida' : ''}`}>Errores: {r.errores.length}</span>
      </div>
      {r.areas_creadas?.length > 0 && <div className="pequeno">Áreas creadas automáticamente: {r.areas_creadas.join(', ')}</div>}
      {r.credenciales?.length > 0 && (
        <>
          <div className="toast">Entregue estas contraseñas temporales a cada usuario de forma segura (no se volverán a mostrar).</div>
          <div className="tabla-wrap"><table className="tabla"><thead><tr><th>Correo</th><th>Contraseña temporal</th></tr></thead>
            <tbody>{r.credenciales.map((c) => <tr key={c.correo}><td>{c.correo}</td><td><code>{c.password_temporal}</code></td></tr>)}</tbody></table></div>
        </>
      )}
      {r.errores.length > 0 && (
        <div className="tabla-wrap"><table className="tabla"><thead><tr><th>Fila</th><th>Error</th></tr></thead>
          <tbody>{r.errores.map((e, i) => <tr key={i}><td>{e.fila}</td><td>{e.mensaje}</td></tr>)}</tbody></table></div>
      )}
    </div>
  );
}

function FormularioCampos({ esq, datos, esNuevo, cat, onCambio }) {
  const set = (k, v) => onCambio({ ...datos, [k]: v });
  const formSel = cat.formularios.find((f) => f.id === datos.formulario_id);
  return (
    <div className="col" style={{ gap: 12 }}>
      {esq.campos.map((c) => {
        if (c.k === 'area_trabajo_id' && datos.rol && datos.rol !== 'jefe_area' && esq.titulo === 'Usuarios') return null;
        if (c.k === 'unidad_id' && datos.rol === 'administrador_aplicacion') return null;
        const et = `${c.t}${c.opcional ? '' : ' *'}`;
        const v = datos[c.k];
        switch (c.tipo) {
          case 'bool':
            return <label key={c.k} className="fila"><input type="checkbox" checked={!!v} onChange={(e) => set(c.k, e.target.checked)} /> {c.t}</label>;
          case 'unidad':
            return (
              <label key={c.k} className="campo">{et}
                <select value={v || ''} onChange={(e) => onCambio({ ...datos, unidad_id: e.target.value, area_trabajo_id: '' })}>
                  <option value="">Seleccione…</option>
                  {cat.unidades.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              </label>
            );
          case 'area':
            return (
              <label key={c.k} className="campo">{c.t}{esq.titulo === 'Usuarios' ? ' *' : ''}
                <select value={v || ''} onChange={(e) => set(c.k, e.target.value)} disabled={!datos.unidad_id}>
                  <option value="">{datos.unidad_id ? 'Sin área' : 'Seleccione la unidad primero'}</option>
                  {cat.areas.filter((a) => a.unidad_id === datos.unidad_id).map((a) => <option key={a.id} value={a.id}>{a.descripcion_area}</option>)}
                </select>
              </label>
            );
          case 'rol':
            return (
              <label key={c.k} className="campo">{et}
                <select value={v || ''} onChange={(e) => set(c.k, e.target.value)}>
                  {ROLES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                </select>
              </label>
            );
          case 'password':
            return (
              <label key={c.k} className="campo">{esNuevo ? 'Contraseña inicial (opcional, mín. 8)' : 'Nueva contraseña (dejar vacío para no cambiar)'}
                <input type="text" autoComplete="new-password" value={v || ''} onChange={(e) => set(c.k, e.target.value)} placeholder={esNuevo ? 'Si se deja vacío se genera una temporal' : ''} />
              </label>
            );
          case 'dias':
            return (
              <div key={c.k} className="campo"><span className="campo">{et}</span>
                <div className="fila">
                  {DIAS.map((d, i) => {
                    const n = i + 1;
                    const sel = (v || []).includes(n);
                    return <button type="button" key={d} className={`opcion ${sel ? 'sel ok' : ''}`} onClick={() => set(c.k, sel ? v.filter((x) => x !== n) : [...(v || []), n].sort())}>{d.slice(0, 3)}</button>;
                  })}
                </div>
              </div>
            );
          case 'hora':
            return <label key={c.k} className="campo">{et}<input type="time" value={v || ''} onChange={(e) => set(c.k, e.target.value)} /></label>;
          case 'formulario':
            return (
              <label key={c.k} className="campo">{et}
                <select value={v || ''} onChange={(e) => onCambio({ ...datos, formulario_id: e.target.value, usuario_responsable_id: '' })}>
                  <option value="">Seleccione…</option>
                  {cat.formularios.filter((f) => f.activo).map((f) => <option key={f.id} value={f.id}>{f.codigo} - {f.nombre} ({f.unidad?.nombre})</option>)}
                </select>
              </label>
            );
          case 'usuario':
            return (
              <label key={c.k} className="campo">{et}
                <select value={v || ''} onChange={(e) => set(c.k, e.target.value)} disabled={!formSel}>
                  <option value="">{formSel ? 'Seleccione…' : 'Seleccione el formulario primero'}</option>
                  {cat.usuarios.filter((u) => u.activo && u.rol !== 'administrador_aplicacion' && u.unidad_id === formSel?.unidad_id)
                    .map((u) => <option key={u.id} value={u.id}>{u.nombre_completo} · {ROL_TXT[u.rol]}{u.area ? ` (${u.area.descripcion_area})` : ''}</option>)}
                </select>
              </label>
            );
          case 'frecuencia':
            return (
              <label key={c.k} className="campo">{et}
                <select value={v || ''} onChange={(e) => set(c.k, e.target.value)}>
                  <option value="">Seleccione…</option>
                  {cat.frecuencias.filter((f) => f.activo).map((f) => <option key={f.id} value={f.id}>{f.nombre_frecuencia} · {diasATexto(f.dias_semana)} {String(f.hora_inicio).slice(0, 5)}–{String(f.hora_fin).slice(0, 5)}</option>)}
                </select>
              </label>
            );
          default:
            return <label key={c.k} className="campo">{et}<input type={c.tipo === 'email' ? 'email' : 'text'} value={v || ''} placeholder={c.ayuda || ''} onChange={(e) => set(c.k, e.target.value)} /></label>;
        }
      })}
    </div>
  );
}
