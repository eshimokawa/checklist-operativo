'use client';
import { useState } from 'react';
import { api, Cargando, Modal, useToast } from '../ui';
import { diasATexto, inferirClasificacion } from '@/lib/negocio';
import NuevoFormulario from './NuevoFormulario';

const TIPOS = [['general', 'General / Infraestructura'], ['trabajadores', 'Personal (trabajadores)'], ['equipos', 'Equipos']];
const TIPO_TXT = Object.fromEntries(TIPOS);
const lista = (t) => String(t || '').split(/\n|,|;/).map((x) => x.trim()).filter(Boolean);

export default function Formularios({ cat, onCambio }) {
  const avisar = useToast();
  const [analisis, setAnalisis] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [nuevo, setNuevo] = useState(false);

  async function analizar(archivo) {
    const fd = new FormData();
    fd.append('archivo', archivo);
    setCargando(true);
    try {
      const r = await api('/api/config/formularios/analizar', { method: 'POST', body: fd });
      setAnalisis({
        archivo: r.archivo,
        items: r.formularios.map((f) => ({ def: f, unidad_id: '', frecuencia_id: '', usuario_responsable_id: '', reemplazar: false, guardado: false })),
      });
    } catch (e) { avisar(e.message, 'error', 8000); }
    finally { setCargando(false); }
  }

  async function abrirEdicion(f) {
    try {
      const r = await api(`/api/config/formularios/${f.id}`);
      setEditando(r.formulario);
    } catch (e) { avisar(e.message, 'error'); }
  }

  async function alternar(f) {
    try { await api(`/api/config/formularios/${f.id}`, { method: 'PATCH', json: { activo: !f.activo } }); onCambio(); }
    catch (e) { avisar(e.message, 'error'); }
  }
  async function eliminar(f) {
    if (!window.confirm(`¿Eliminar el formulario ${f.codigo}? Se eliminarán también sus asignaciones y tareas pendientes.`)) return;
    try { await api(`/api/config/formularios/${f.id}`, { method: 'DELETE' }); avisar('Formulario eliminado', 'ok'); onCambio(); }
    catch (e) { avisar(e.message, 'error', 9000); }
  }

  return (
    <>
      <div className="tarjeta">
        <div className="fila-entre">
          <div>
            <h2 style={{ margin: 0 }}>Formularios: crear o cargar desde Excel</h2>
            <p className="suave pequeno" style={{ margin: '4px 0 0' }}>
              Cree un formulario con “+ Nuevo formulario” o cárguelo desde Excel. Cada hoja del Excel se interpreta como un formulario. Se detectan columnas precompletadas / a completar, opciones de los desplegables,
              secciones, subcategorías, preguntas y puntos críticos. Revise y ajuste antes de guardar.
            </p>
          </div>
          <div className="fila">
          <button className="btn sec" onClick={() => setNuevo(true)}>+ Nuevo formulario</button>
          <label className="btn" style={{ cursor: 'pointer' }}>{cargando ? 'Analizando…' : 'Subir Excel (.xlsx)'}
            <input type="file" accept=".xlsx" hidden disabled={cargando} onChange={(e) => { if (e.target.files[0]) analizar(e.target.files[0]); e.target.value = ''; }} />
          </label>
          </div>
        </div>
        {analisis && (
          <div className="mt">
            <div className="fila-entre"><h3 style={{ margin: 0 }}>Archivo: {analisis.archivo}</h3><button className="btn fantasma peq" onClick={() => setAnalisis(null)}>Cerrar</button></div>
            {analisis.items.map((it, i) => (
              <ItemImportacion key={i} it={it} cat={cat}
                onCambio={(n) => setAnalisis((a) => ({ ...a, items: a.items.map((x, j) => (j === i ? n : x)) }))}
                onGuardado={onCambio} archivo={analisis.archivo} />
            ))}
          </div>
        )}
      </div>

      <div className="tarjeta">
        <h2>Formularios registrados</h2>
        {!cat.formularios ? <Cargando /> : (
          <div className="tabla-wrap">
            <table className="tabla">
              <thead><tr><th>Código</th><th>Nombre</th><th>Unidad</th><th>Tipo</th><th>Ítems</th><th>Opciones</th><th>Estándar</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {cat.formularios.length === 0 && <tr><td colSpan={9} className="vacio">Aún no hay formularios. Suba un Excel para comenzar.</td></tr>}
                {cat.formularios.map((f) => (
                  <tr key={f.id}>
                    <td><b>{f.codigo}</b></td><td>{f.nombre}</td><td>{f.unidad?.nombre}</td><td>{TIPO_TXT[f.tipo_evaluacion]}</td>
                    <td>{f.tipo_evaluacion === 'general' ? `${f.formulario_preguntas?.[0]?.count ?? 0} preguntas` : f.tipo_evaluacion === 'equipos' ? `${f.formulario_equipos?.[0]?.count || 'Todos los'} equipos` : 'Trabajadores de la sede'}</td>
                    <td className="pequeno">{(f.opciones_respuesta || []).join(' / ') || '—'}</td>
                    <td>{Number(f.estandar_porcentaje).toFixed(0)}%</td>
                    <td><span className={`chip ${f.activo ? 'Finalizado' : 'Vencida'}`}>{f.activo ? 'Activo' : 'Inactivo'}</span></td>
                    <td><div className="fila" style={{ gap: 4 }}>
                      <button className="btn fantasma peq" onClick={() => abrirEdicion(f)}>Editar</button>
                      <button className="btn fantasma peq" onClick={() => alternar(f)}>{f.activo ? 'Desactivar' : 'Activar'}</button>
                      <button className="btn fantasma peq" style={{ color: 'var(--rojo-alerta)' }} onClick={() => eliminar(f)}>Eliminar</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="suave pequeno mt">Para programar un formulario use la pestaña <b>Asignaciones</b> (formulario + usuario responsable + frecuencia).</p>
      </div>

      <NuevoFormulario abierto={nuevo} cat={cat} onCerrar={() => setNuevo(false)} onCreado={() => { setNuevo(false); onCambio(); }} />

      <Modal abierto={!!editando} onCerrar={() => setEditando(null)} titulo={`Editar ${editando?.codigo || ''}`} ancho>
        {editando && <EdicionExistente f={editando} onListo={() => { setEditando(null); onCambio(); }} />}
      </Modal>
    </>
  );
}

function ItemImportacion({ it, cat, onCambio, onGuardado, archivo }) {
  const avisar = useToast();
  const [guardando, setGuardando] = useState(false);
  const d = it.def;
  const set = (k, v) => onCambio({ ...it, [k]: v });
  const usuarios = cat.usuarios.filter((u) => u.activo && u.rol !== 'administrador_aplicacion' && u.unidad_id === it.unidad_id);

  async function guardar() {
    setGuardando(true);
    try {
      const r = await api('/api/config/formularios/guardar', {
        method: 'POST',
        json: {
          formulario: d, unidad_id: it.unidad_id, frecuencia_id: it.frecuencia_id || null,
          usuario_responsable_id: it.usuario_responsable_id || null, reemplazar: it.reemplazar, origen_archivo: `${archivo} › ${d.hoja}`,
        },
      });
      let msg = `Formulario ${d.codigo} guardado.`;
      if (r.equipos) msg += ` Equipos: ${r.equipos.creados} nuevos, ${r.equipos.actualizados} actualizados.`;
      if (r.asignacion) msg += ' Asignación creada.';
      avisar(msg, 'ok', 7000);
      onCambio({ ...it, guardado: true });
      onGuardado();
    } catch (e) { avisar(e.message, 'error', 9000); }
    finally { setGuardando(false); }
  }

  if (d.error) return <div className="toast error mt">Hoja “{d.hoja}”: {d.error}</div>;
  return (
    <div className="tarjeta mt" style={{ border: '1px solid var(--borde)', boxShadow: 'none', opacity: it.guardado ? 0.6 : 1 }}>
      <div className="fila-entre"><h3 style={{ margin: 0 }}>Hoja: {d.hoja}</h3>{it.guardado && <span className="chip Finalizado">Guardado</span>}</div>
      {d.advertencias?.map((a, i) => <div key={i} className="toast mt" style={{ background: 'var(--ambar)' }}>{a}</div>)}
      <EditorDefinicion d={d} onCambio={(nd) => onCambio({ ...it, def: nd })} tipoEditable />
      <div className="grid grid-4 mt" style={{ alignItems: 'end' }}>
        <label className="campo">Unidad *
          <select value={it.unidad_id} onChange={(e) => onCambio({ ...it, unidad_id: e.target.value, usuario_responsable_id: '' })}>
            <option value="">Seleccione…</option>
            {cat.unidades.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </label>
        <label className="campo">Frecuencia de llenado
          <select value={it.frecuencia_id} onChange={(e) => set('frecuencia_id', e.target.value)}>
            <option value="">(asignar después)</option>
            {cat.frecuencias.filter((f) => f.activo).map((f) => <option key={f.id} value={f.id}>{f.nombre_frecuencia} · {diasATexto(f.dias_semana)} {String(f.hora_inicio).slice(0, 5)}–{String(f.hora_fin).slice(0, 5)}</option>)}
          </select>
        </label>
        <label className="campo">Usuario responsable
          <select value={it.usuario_responsable_id} onChange={(e) => set('usuario_responsable_id', e.target.value)} disabled={!it.unidad_id}>
            <option value="">(asignar después)</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre_completo}{u.area ? ` (${u.area.descripcion_area})` : ''}</option>)}
          </select>
        </label>
        <div className="col">
          <label className="fila pequeno"><input type="checkbox" checked={it.reemplazar} onChange={(e) => set('reemplazar', e.target.checked)} /> Reemplazar si el código ya existe</label>
          <button className="btn" disabled={guardando || !it.unidad_id} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar formulario'}</button>
        </div>
      </div>
    </div>
  );
}

function EdicionExistente({ f, onListo }) {
  const avisar = useToast();
  const [d, setD] = useState(f);
  const [guardando, setGuardando] = useState(false);
  async function guardar() {
    setGuardando(true);
    try {
      const cuerpo = {
        codigo: d.codigo, nombre: d.nombre, estandar_porcentaje: d.estandar_porcentaje, opciones_respuesta: d.opciones_respuesta,
        opciones_conformes: d.opciones_conformes, opciones_no_aplica: d.opciones_no_aplica, aspectos_informativos: d.aspectos_informativos,
        campos: d.campos,
      };
      if (d.tipo_evaluacion === 'general') cuerpo.secciones = d.secciones;
      await api(`/api/config/formularios/${f.id}`, { method: 'PATCH', json: cuerpo });
      avisar('Formulario actualizado', 'ok');
      onListo();
    } catch (e) { avisar(e.message, 'error', 9000); }
    finally { setGuardando(false); }
  }
  return (
    <>
      <p className="suave pequeno">Unidad: <b>{f.unidad?.nombre}</b> · Tipo: <b>{TIPO_TXT[f.tipo_evaluacion]}</b>. Los cambios aplican a las próximas ejecuciones; el historial conserva lo registrado.</p>
      <EditorDefinicion d={d} onCambio={setD} />
      <div className="fila mt" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
      </div>
    </>
  );
}

/** Editor de la definición (metadatos, opciones, campos y preguntas) */
function EditorDefinicion({ d, onCambio, tipoEditable = false }) {
  const set = (k, v) => onCambio({ ...d, [k]: v });
  const ev = (d.campos || []).find((c) => c.rol === 'evaluacion');
  const usaOpciones = d.tipo_evaluacion === 'general' || ev?.tipo === 'opciones';
  const opciones = d.opciones_respuesta || [];

  function setOpciones(texto) {
    const ops = lista(texto);
    const inf = inferirClasificacion(ops);
    let campos = d.campos;
    if (ev?.tipo === 'opciones') campos = d.campos.map((c) => (c.rol === 'evaluacion' ? { ...c, opciones: ops } : c));
    onCambio({
      ...d, campos, opciones_respuesta: ops,
      opciones_conformes: (d.opciones_conformes || []).filter((o) => ops.includes(o)).length ? d.opciones_conformes.filter((o) => ops.includes(o)) : inf.conformes,
      opciones_no_aplica: (d.opciones_no_aplica || []).filter((o) => ops.includes(o)).length ? d.opciones_no_aplica.filter((o) => ops.includes(o)) : inf.noAplica,
    });
  }
  function clasificar(op, clase) {
    const conf = (d.opciones_conformes || []).filter((o) => o !== op);
    const na = (d.opciones_no_aplica || []).filter((o) => o !== op);
    if (clase === 'ok') conf.push(op);
    if (clase === 'na') na.push(op);
    onCambio({ ...d, opciones_conformes: conf, opciones_no_aplica: na });
  }
  function setCampo(i, cambios) {
    let campos = d.campos.map((c, j) => (j === i ? { ...c, ...cambios } : c));
    if (cambios.rol === 'evaluacion') campos = campos.map((c, j) => (j !== i && c.rol === 'evaluacion' ? { ...c, rol: 'dato' } : c));
    const nuevoEv = campos.find((c) => c.rol === 'evaluacion');
    const extra = {};
    if (nuevoEv?.tipo === 'opciones' && (cambios.rol === 'evaluacion' || cambios.opciones)) {
      const inf = inferirClasificacion(nuevoEv.opciones || []);
      Object.assign(extra, { opciones_respuesta: nuevoEv.opciones || [], opciones_conformes: inf.conformes, opciones_no_aplica: inf.noAplica });
    }
    onCambio({ ...d, ...extra, campos });
  }

  return (
    <div className="col mt" style={{ gap: 12 }}>
      <div className="grid grid-4">
        <label className="campo">Código *<input value={d.codigo || ''} onChange={(e) => set('codigo', e.target.value)} /></label>
        <label className="campo" style={{ gridColumn: 'span 2' }}>Nombre *<input value={d.nombre || ''} onChange={(e) => set('nombre', e.target.value)} /></label>
        <label className="campo">Estándar (%)<input type="number" min="0" max="100" value={d.estandar_porcentaje ?? 0} onChange={(e) => set('estandar_porcentaje', e.target.value)} /></label>
        {tipoEditable && (
          <label className="campo">Tipo de evaluación
            <select value={d.tipo_evaluacion} onChange={(e) => set('tipo_evaluacion', e.target.value)}>
              {TIPOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </label>
        )}
      </div>

      {usaOpciones && (
        <div>
          <label className="campo">Opciones de respuesta (separadas por coma, en el orden a mostrar)
            <input value={opciones.join(', ')} onChange={(e) => setOpciones(e.target.value)} />
          </label>
          <div className="fila mt">
            {opciones.map((op) => {
              const clase = (d.opciones_conformes || []).includes(op) ? 'ok' : (d.opciones_no_aplica || []).includes(op) ? 'na' : 'nc';
              return (
                <div key={op} className="fila" style={{ gap: 4, border: '1px solid var(--borde)', borderRadius: 12, padding: '4px 8px' }}>
                  <b className="pequeno">{op}</b>
                  <select value={clase} onChange={(e) => clasificar(op, e.target.value)} style={{ width: 'auto', padding: '3px 6px', fontSize: '0.8rem' }}>
                    <option value="ok">Conforme</option><option value="nc">No conforme</option><option value="na">No aplica (excluida)</option>
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {d.tipo_evaluacion !== 'general' && (
        <>
          <label className="campo">Aspectos a evaluar (uno por línea; opcional — se muestran como referencia)
            <textarea rows={3} value={(d.aspectos_informativos || []).join('\n')} onChange={(e) => set('aspectos_informativos', e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))} />
          </label>
          <div>
            <h4 style={{ margin: '6px 0' }}>Columnas del formulario</h4>
            <div className="tabla-wrap">
              <table className="tabla">
                <thead><tr><th>Columna</th><th>Origen</th><th>Tipo</th><th>Opciones</th><th>Rol</th><th>Regla de conformidad</th><th>Oblig.</th></tr></thead>
                <tbody>
                  {(d.campos || []).map((c, i) => (
                    <tr key={c.clave + i}>
                      <td><input value={c.etiqueta} onChange={(e) => setCampo(i, { etiqueta: e.target.value })} style={{ minWidth: 150 }} /></td>
                      <td className="pequeno">{c.origen === 'precompletado' ? `Precompletado (${c.fuente || '—'})` : 'A completar'}</td>
                      <td>{c.origen === 'usuario' ? (
                        <select value={c.tipo} onChange={(e) => setCampo(i, { tipo: e.target.value })}>
                          <option value="opciones">Desplegable</option><option value="numero">Número</option><option value="texto">Texto</option>
                        </select>) : 'Texto'}</td>
                      <td>{c.tipo === 'opciones' && c.origen === 'usuario' ? <input value={(c.opciones || []).join(', ')} onChange={(e) => setCampo(i, { opciones: lista(e.target.value) })} style={{ minWidth: 180 }} /> : '—'}</td>
                      <td>{c.origen === 'usuario' ? (
                        <select value={c.rol} onChange={(e) => setCampo(i, { rol: e.target.value })}>
                          <option value="evaluacion">Evaluación</option><option value="observacion">Observación / acción correctiva</option><option value="dato">Dato adicional</option>
                        </select>) : 'Dato'}</td>
                      <td>{c.rol === 'evaluacion' && c.tipo === 'numero' ? (
                        <div className="fila" style={{ gap: 4 }}>
                          <select value={c.regla?.tipo || 'rango_parametro'} onChange={(e) => setCampo(i, { regla: { ...(c.regla || {}), tipo: e.target.value } })} style={{ width: 'auto' }}>
                            <option value="rango_parametro">Dentro del parámetro del equipo</option><option value="max">Menor o igual a</option><option value="min">Mayor o igual a</option>
                          </select>
                          {['max', 'min'].includes(c.regla?.tipo) && <input type="number" step="any" style={{ width: 80 }} value={c.regla?.valor ?? ''} onChange={(e) => setCampo(i, { regla: { ...c.regla, valor: e.target.value } })} />}
                        </div>
                      ) : c.rol === 'evaluacion' ? <span className="pequeno">Según opciones conformes</span> : '—'}</td>
                      <td>{c.origen === 'usuario' && c.rol === 'dato' ? <input type="checkbox" checked={!!c.requerido} onChange={(e) => setCampo(i, { requerido: e.target.checked })} /> : c.rol === 'evaluacion' ? '✓' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {d.tipo_evaluacion === 'equipos' && d.equipos && (
            <details>
              <summary className="pequeno" style={{ cursor: 'pointer' }}>{d.equipos.length ? `${d.equipos.length} equipos vinculados (se registran/actualizan en el maestro)` : 'Sin equipos en el Excel: se usarán todos los equipos de la sede/área'}</summary>
              <div className="tabla-wrap mt"><table className="tabla"><thead><tr><th>Código</th><th>Descripción</th><th>Área</th><th>Parámetro</th></tr></thead>
                <tbody>{d.equipos.map((e) => <tr key={e.codigo_equipo}><td>{e.codigo_equipo}</td><td>{e.descripcion_equipo}</td><td>{(typeof e.area === 'string' ? e.area : e.area?.descripcion_area) || '—'}</td><td>{e.temperatura_funcionamiento || '—'}</td></tr>)}</tbody></table></div>
            </details>
          )}
        </>
      )}

      {d.tipo_evaluacion === 'general' && (
        <div>
          <h4 style={{ margin: '6px 0' }}>Preguntas ({(d.secciones || []).reduce((a, s) => a + s.preguntas.length, 0)})</h4>
          {(d.secciones || []).map((s, si) => (
            <details key={si} open={si === 0}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--titulo)' }}>{s.nombre} ({s.preguntas.length})</summary>
              <div className="tabla-wrap" style={{ margin: '6px 0 10px' }}>
                <table className="tabla">
                  <thead><tr><th>Subcategoría</th><th>Pregunta / aspecto</th><th>Punto crítico</th></tr></thead>
                  <tbody>
                    {s.preguntas.map((p, pi) => {
                      const upd = (c) => onCambio({ ...d, secciones: d.secciones.map((x, a) => (a !== si ? x : { ...x, preguntas: x.preguntas.map((y, b) => (b === pi ? { ...y, ...c } : y)) })) });
                      return (
                        <tr key={pi}>
                          <td className="pequeno">{p.subcategoria || '—'}</td>
                          <td><input value={p.texto} onChange={(e) => upd({ texto: e.target.value })} /></td>
                          <td className="centro"><input type="checkbox" checked={!!p.es_punto_critico} onChange={(e) => upd({ es_punto_critico: e.target.checked })} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
