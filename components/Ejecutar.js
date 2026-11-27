'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, Cargando, ChipNivel, Modal, descargar, useToast } from './ui';
import Firma from './Firma';
import {
  evaluarItem, calcularCalificacion, campoEvaluacion, campoObservacion, fechaHoraLocal, horaLocal, normalizar,
} from '@/lib/negocio';

const pad = (n) => String(n).padStart(2, '0');

function Cronometro({ inicio }) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((ahora - inicio) / 1000));
  return <span className="cronometro">Tiempo de ejecución {pad(Math.floor(s / 60))}:{pad(s % 60)}</span>;
}

function Seccion({ titulo, derecha, abrir, children }) {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => { if (abrir) setAbierto(true); }, [abrir]);
  return (
    <div className={`acordeon ${abierto ? 'abierto' : ''}`}>
      <button type="button" className="titulo-acordeon" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>
        <span>{titulo}</span>
        <span className="fila">{derecha}<span className="flecha">▾</span></span>
      </button>
      {abierto && <div className="cuerpo">{children}</div>}
    </div>
  );
}

function claseOpcion(formulario, op) {
  const n = normalizar(op);
  if ((formulario.opciones_no_aplica || []).map(normalizar).includes(n)) return 'na';
  if ((formulario.opciones_conformes || []).map(normalizar).includes(n)) return 'ok';
  return 'nc';
}

function etiquetaPct(p) {
  return p === null || p === undefined ? '—' : `${p.toFixed(2)}%`;
}

// ---------------------------------------------------------------- Vista de resultado (finalizado)
function VistaFinalizada({ ej, firma, onCorreo, enviando }) {
  const grupos = useMemo(() => {
    const s = [];
    for (const r of ej.respuestas) {
      let g = s.find((x) => x.nombre === r.seccion_nombre);
      if (!g) { g = { nombre: r.seccion_nombre, items: [], c: 0, a: 0 }; s.push(g); }
      g.items.push(r);
      if (r.es_conforme !== null) { g.a += 1; if (r.es_conforme) g.c += 1; }
    }
    return s;
  }, [ej.respuestas]);
  const avisar = useToast();
  return (
    <div className="tarjeta">
      <div className={`banner-calif ${ej.etiqueta_calificacion}`}>
        Calificación: {Number(ej.calificacion_porcentaje).toFixed(2)}% ({ej.etiqueta_calificacion})
      </div>
      <div className="grid grid-4 mt pequeno">
        <div><b>Fecha:</b> {fechaHoraLocal(ej.fecha_hora_registro)}</div>
        <div><b>Tiempo de ejecución:</b> {ej.tiempo_ejecucion_minutos} min</div>
        <div><b>Estándar:</b> {Number(ej.formulario.estandar_porcentaje).toFixed(2)}%</div>
        <div><b>Auditor:</b> {ej.auditor?.nombre_completo}</div>
        <div><b>Auditado:</b> {ej.auditado_descripcion}</div>
        <div><b>Correo enviado:</b> {ej.correo_enviado ? 'Sí' : 'No'}</div>
        {ej.completado_fuera_plazo && <div><span className="chip Vencida">Completado fuera de plazo</span></div>}
      </div>
      <div className="fila mt">
        <button className="btn" onClick={() => descargar(`/api/ejecuciones/${ej.id}/pdf`, 'checklist.pdf').catch((e) => avisar(e.message, 'error'))}>Descargar PDF</button>
        <button className="btn sec" disabled={enviando} onClick={onCorreo}>{enviando ? 'Enviando…' : ej.correo_enviado ? 'Reenviar por correo' : 'Enviar por correo'}</button>
      </div>
      {grupos.map((g) => (
        <div key={g.nombre}>
          <div className="barra-seccion"><span>{g.nombre}</span><span>{g.a ? ((g.c / g.a) * 100).toFixed(2) + '%' : 'N/A'}</span></div>
          {g.items.map((r, i) => (
            <div key={r.id} className="fila-entre" style={{ padding: '8px 10px', background: i % 2 ? '#f6f4f6' : '#fff' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                {r.subcategoria && (i === 0 || g.items[i - 1].subcategoria !== r.subcategoria) && <div className="subcat">{r.subcategoria}</div>}
                <div style={{ fontWeight: 600 }}>{r.item_descripcion}</div>
                {r.valores?._parametro && <div className="suave pequeno">Parámetro: {r.valores._parametro}</div>}
              </div>
              <div className="derecha" style={{ minWidth: 160 }}>
                <b style={{ color: r.es_conforme === false ? 'var(--rojo-alerta)' : r.es_conforme ? 'var(--verde)' : '#777' }}>{r.respuesta_seleccionada}</b>
                {r.observacion_accion_correctiva && <div className="pequeno" style={{ color: '#8e1c1c' }}>{r.observacion_accion_correctiva}</div>}
              </div>
            </div>
          ))}
        </div>
      ))}
      <h3 className="mt">Firmas:</h3>
      {firma ? <img src={firma} alt="Firma del auditor" style={{ maxWidth: 260, border: '1px solid #ddd', borderRadius: 10 }} /> : <span className="suave">Sin firma</span>}
      <div className="pequeno suave">Auditor: {ej.auditor?.nombre_completo}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Componente principal
export default function Ejecutar({ id }) {
  const avisar = useToast();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [resp, setResp] = useState({});
  const [inicio] = useState(() => Date.now());
  const [errores, setErrores] = useState({});
  const [abrirSecciones, setAbrirSecciones] = useState(new Set());
  const [modalFirma, setModalFirma] = useState(false);
  const [firma, setFirma] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    try { setDatos(await api(`/api/ejecuciones/${id}`)); }
    catch (e) { setError(e.message); }
  }, [id]);
  useEffect(() => { cargar(); }, [cargar]);

  // Aviso al salir con cambios sin guardar
  useEffect(() => {
    const h = (e) => { if (Object.keys(resp).length && !resultado) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [resp, resultado]);

  const ej = datos?.ejecucion;
  const formulario = ej?.formulario;
  const items = datos?.items || [];
  const ce = formulario ? campoEvaluacion(formulario) : null;
  const co = formulario ? campoObservacion(formulario) : null;
  const aspectos = formulario?.aspectos_informativos || [];

  const evaluados = useMemo(() => {
    if (!formulario) return [];
    return items.map((it) => {
      const r = evaluarItem(formulario, it, resp[it.key] || {});
      return { ...it, ...r };
    });
  }, [items, resp, formulario]);
  const calif = useMemo(() => calcularCalificacion(evaluados.filter((x) => x.es_conforme !== undefined && (x.ok || x.es_conforme === false))), [evaluados]);
  const respondidos = evaluados.filter((x) => x.ok).length;

  const secciones = useMemo(() => {
    const s = [];
    for (const it of items) {
      let g = s.find((x) => x.nombre === it.seccion_nombre);
      if (!g) { g = { nombre: it.seccion_nombre, items: [] }; s.push(g); }
      g.items.push(it);
    }
    return s;
  }, [items]);

  function actualizar(key, cambios) {
    setResp((r) => ({ ...r, [key]: { ...(r[key] || {}), ...cambios } }));
    if (errores[key]) setErrores((e) => { const x = { ...e }; delete x[key]; return x; });
  }
  function actualizarValor(key, clave, valor) {
    setResp((r) => ({ ...r, [key]: { ...(r[key] || {}), valores: { ...(r[key]?.valores || {}), [clave]: valor } } }));
    if (errores[key]) setErrores((e) => { const x = { ...e }; delete x[key]; return x; });
  }
  function marcarSeccion(g, opcion) {
    setResp((r) => {
      const n = { ...r };
      for (const it of g.items) {
        if (formulario.tipo_evaluacion === 'general') { if (!n[it.key]?.respuesta) n[it.key] = { ...(n[it.key] || {}), respuesta: opcion }; }
        else if (!n[it.key]?.valores?.[ce.clave]) n[it.key] = { ...(n[it.key] || {}), valores: { ...(n[it.key]?.valores || {}), [ce.clave]: opcion } };
      }
      return n;
    });
  }

  function validar() {
    const errs = {};
    const secc = new Set();
    for (const x of evaluados) if (!x.ok) { errs[x.key] = x.error; secc.add(x.seccion_nombre); }
    setErrores(errs);
    setAbrirSecciones(secc);
    const n = Object.keys(errs).length;
    if (n) {
      const primeros = evaluados.filter((x) => !x.ok).slice(0, 4).map((x) => `• ${x.texto}: ${x.error}`).join('\n');
      avisar(`Faltan ${n} ítem(s) por completar:\n${primeros}${n > 4 ? '\n…' : ''}`, 'error', 8000);
      return false;
    }
    return true;
  }

  async function finalizar() {
    if (!firma) { avisar('Dibuje la firma del auditor.', 'error'); return; }
    setGuardando(true);
    try {
      const cuerpo = {
        inicio: new Date(inicio).toISOString(),
        firma,
        respuestas: items.map((it) => ({ key: it.key, ...(resp[it.key] || {}) })),
      };
      const r = await api(`/api/ejecuciones/${id}/finalizar`, { method: 'POST', json: cuerpo });
      setModalFirma(false);
      setResultado(r);
    } catch (e) {
      avisar(e.message, 'error', 10000);
    } finally {
      setGuardando(false);
    }
  }

  async function enviarCorreo() {
    setEnviando(true);
    try {
      const r = await api(`/api/ejecuciones/${id}/correo`, { method: 'POST' });
      avisar(`Reporte enviado a ${r.destino}`, 'ok');
      return true;
    } catch (e) {
      avisar(e.message, 'error', 9000);
      return false;
    } finally {
      setEnviando(false);
    }
  }

  if (error) return <div className="tarjeta"><div className="toast error">{error}</div><a className="btn sec mt" href="/tareas">Regresar</a></div>;
  if (!datos) return <Cargando texto="Cargando check list…" />;

  const vencida = ej.estado === 'Vencida' || (ej.estado === 'Pendiente' && new Date(ej.ventana_fin) < new Date());
  const editable = datos.puede_editar && ej.estado !== 'Finalizado';

  return (
    <>
      <div className="enc-ejec fila-entre mb" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1>{formulario.codigo} - {formulario.nombre}</h1>
          <div>Ubicación: {ej.unidad?.nombre}{ej.area ? ` · ${ej.area.descripcion_area}` : ''}</div>
          {editable ? <Cronometro inicio={inicio} /> : <span className="cronometro">Tiempo de ejecución {ej.tiempo_ejecucion_minutos ?? '--'} min</span>}
          <div className="leyenda">
            <span><span className="ico-estado asignada" /> Tarea asignada</span>
            <span><span className="ico-estado vencida" /> Tarea vencida</span>
            <span><span className="ico-critico">⚠</span> Punto crítico</span>
          </div>
        </div>
        <div className="col" style={{ alignItems: 'flex-end' }}>
          <input type="date" value={ej.fecha_programada} readOnly style={{ width: 170 }} />
          <span className={`chip ${vencida && ej.estado !== 'Finalizado' ? 'Vencida' : ej.estado}`}>
            {ej.estado === 'Finalizado' ? 'Finalizado' : vencida ? 'Tarea vencida' : 'Tarea asignada'}
          </span>
          <span className="pequeno suave">Ventana {horaLocal(ej.ventana_inicio)} – {horaLocal(ej.ventana_fin)}</span>
        </div>
      </div>

      {ej.estado === 'Finalizado' ? (
        <VistaFinalizada ej={ej} firma={datos.firma} enviando={enviando} onCorreo={async () => { if (await enviarCorreo()) cargar(); }} />
      ) : (
        <div className="tarjeta">
          {!datos.puede_editar && <div className="toast mb">Solo el responsable asignado ({ej.auditor?.nombre_completo}) puede completar este check list. Vista de solo lectura.</div>}
          {vencida && datos.puede_editar && <div className="toast error mb">La ventana de ejecución ya cerró: el check list quedará registrado como completado fuera de plazo.</div>}
          {items.length === 0 && <div className="vacio">No hay {formulario.tipo_evaluacion === 'trabajadores' ? 'trabajadores' : formulario.tipo_evaluacion === 'equipos' ? 'equipos' : 'preguntas'} activos para evaluar. Contacte al administrador.</div>}

          {aspectos.length > 0 && (
            <Seccion titulo="Aspectos a evaluar">
              <ul style={{ margin: 0, paddingLeft: 20 }}>{aspectos.map((a) => <li key={a}>{a}</li>)}</ul>
            </Seccion>
          )}

          {secciones.map((g) => {
            const pctSec = calif.porSeccion[g.nombre];
            const pendientes = g.items.filter((it) => !evaluados.find((x) => x.key === it.key)?.ok).length;
            const derecha = (
              <>
                {pendientes > 0 ? <span className="chip Pendiente">{pendientes} pendiente(s)</span> : <span className="chip Finalizado">Completo</span>}
                <span className="chip">{etiquetaPct(pctSec)}</span>
              </>
            );
            const opcionConforme = formulario.tipo_evaluacion === 'general'
              ? formulario.opciones_conformes?.[0]
              : ce?.tipo === 'opciones' ? formulario.opciones_conformes?.[0] : null;
            return (
              <Seccion key={g.nombre} titulo={g.nombre} derecha={derecha} abrir={abrirSecciones.has(g.nombre)}>
                {editable && opcionConforme && (
                  <div className="derecha mb"><button className="btn fantasma peq" onClick={() => marcarSeccion(g, opcionConforme)}>Completar vacíos con “{opcionConforme}”</button></div>
                )}
                {formulario.tipo_evaluacion === 'general'
                  ? <Preguntas g={g} formulario={formulario} resp={resp} errores={errores} editable={editable} actualizar={actualizar} evaluados={evaluados} />
                  : <TablaFilas g={g} formulario={formulario} resp={resp} errores={errores} editable={editable} actualizarValor={actualizarValor} evaluados={evaluados} ce={ce} co={co} />}
              </Seccion>
            );
          })}

          {editable && items.length > 0 && (
            <div className="barra-calif">
              <div className="fila">
                <strong>Calificación en vivo:</strong>
                <ChipNivel etiqueta={calif.aplicables ? calif.etiqueta : null} pct={calif.aplicables ? calif.pct : null} />
                <span className="suave pequeno">{respondidos}/{items.length} respondidos · Estándar {Number(formulario.estandar_porcentaje).toFixed(0)}%</span>
              </div>
              <div className="fila">
                <a className="btn sec" href="/tareas">Regresar</a>
                <button className="btn" onClick={() => { if (validar()) setModalFirma(true); }}>Finalizar</button>
              </div>
            </div>
          )}
        </div>
      )}

      <Modal abierto={modalFirma} onCerrar={() => !guardando && setModalFirma(false)} titulo="Firma del auditor"
        pie={<><button className="btn sec" disabled={guardando} onClick={() => setModalFirma(false)}>Cancelar</button>
          <button className="btn" disabled={guardando || !firma} onClick={finalizar}>{guardando ? 'Guardando…' : 'Guardar y finalizar'}</button></>}>
        <p className="pequeno">Auditor: <b>{ej.auditor?.nombre_completo}</b> · Calificación: <b>{calif.pct.toFixed(2)}% ({calif.etiqueta})</b></p>
        <Firma onCambio={setFirma} />
      </Modal>

      <Modal abierto={!!resultado} titulo="Check list finalizado">
        {resultado && (
          <>
            <div className={`banner-calif ${resultado.ejecucion.etiqueta_calificacion}`}>
              Calificación: {Number(resultado.ejecucion.calificacion_porcentaje).toFixed(2)}% ({resultado.ejecucion.etiqueta_calificacion})
            </div>
            <p className="pequeno mt">
              Registro: {fechaHoraLocal(resultado.ejecucion.fecha_hora_registro)} · Tiempo de ejecución: {resultado.ejecucion.tiempo_ejecucion_minutos} min · Estado: Finalizado
            </p>
            <p><b>¿Desea enviar el reporte por correo electrónico?</b><br /><span className="suave">Destinatario: {resultado.correo_destino}</span></p>
            <div className="fila" style={{ justifyContent: 'flex-end' }}>
              <button className="btn sec" disabled={enviando} onClick={() => { setResultado(null); setResp({}); cargar(); }}>No, gracias</button>
              <button className="btn" disabled={enviando} onClick={async () => { await enviarCorreo(); setResultado(null); setResp({}); cargar(); }}>
                {enviando ? 'Enviando…' : 'Sí, enviar'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------- Formularios generales
function Preguntas({ g, formulario, resp, errores, editable, actualizar, evaluados }) {
  let subAnterior = null;
  return g.items.map((it) => {
    const r = resp[it.key] || {};
    const ev = evaluados.find((x) => x.key === it.key);
    const mostrarSub = it.subcategoria && it.subcategoria !== subAnterior;
    subAnterior = it.subcategoria;
    return (
      <div key={it.key}>
        {mostrarSub && <div className="subcat">{it.subcategoria}</div>}
        <div className="pregunta">
          <div className="texto">{it.es_punto_critico && <span className="ico-critico" title="Punto crítico">⚠</span>}{it.texto}</div>
          <div className="opciones">
            {formulario.opciones_respuesta.map((op) => (
              <button key={op} type="button" disabled={!editable}
                className={`opcion ${r.respuesta === op ? 'sel ' + claseOpcion(formulario, op) : ''}`}
                onClick={() => actualizar(it.key, { respuesta: op })}>{op}</button>
            ))}
          </div>
          {(ev?.es_conforme === false || r.observacion) && (
            <textarea className={errores[it.key] ? 'invalido' : ''} style={{ marginTop: 8 }} rows={2} disabled={!editable}
              placeholder="Motivo del incumplimiento / acción correctiva (obligatorio)"
              value={r.observacion || ''} onChange={(e) => actualizar(it.key, { observacion: e.target.value })} />
          )}
          {errores[it.key] && <div className="pequeno" style={{ color: 'var(--rojo-alerta)' }}>{errores[it.key]}</div>}
        </div>
      </div>
    );
  });
}

// ---------------------------------------------------------------- Formularios de personal / equipos
function Control({ campo, valor, onCambio, editable, invalido, formulario }) {
  const cls = invalido ? 'invalido' : '';
  if (campo.tipo === 'opciones') {
    const ops = campo.opciones?.length ? campo.opciones : formulario.opciones_respuesta;
    return (
      <select className={cls} value={valor || ''} disabled={!editable} onChange={(e) => onCambio(e.target.value)}>
        <option value="">Seleccione…</option>
        {ops.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (campo.tipo === 'numero') {
    return <input className={cls} type="number" inputMode="decimal" step="any" value={valor ?? ''} disabled={!editable} onChange={(e) => onCambio(e.target.value)} style={{ maxWidth: 130 }} />;
  }
  return <textarea className={cls} rows={1} value={valor || ''} disabled={!editable} onChange={(e) => onCambio(e.target.value)} />;
}

function TablaFilas({ g, formulario, resp, errores, editable, actualizarValor, evaluados, ce, co }) {
  const pre = (formulario.campos || []).filter((c) => c.origen === 'precompletado');
  const usuario = (formulario.campos || []).filter((c) => c.origen === 'usuario');
  return (
    <div className="tabla-wrap">
      <table className="tabla responsiva">
        <thead>
          <tr>
            <th>#</th>
            {pre.map((c) => <th key={c.clave}>{c.etiqueta}</th>)}
                        {usuario.map((c) => <th key={c.clave}>{c.etiqueta}{c.rol === 'evaluacion' ? ' *' : ''}</th>)}
          </tr>
        </thead>
        <tbody>
          {g.items.map((it, i) => {
            const r = resp[it.key] || {};
            const v = r.valores || {};
            const ev = evaluados.find((x) => x.key === it.key);
            const err = errores[it.key];
            return (
              <tr key={it.key} className={ev?.es_conforme === false ? 'fila-nc' : ''}>
                <td className="num">{i + 1}</td>
                {pre.map((c) => (
                  <td key={c.clave} data-et={c.etiqueta}>
                    {c.fuente === 'nombre_completo' || c.fuente === 'codigo_equipo' ? <b>{it.datos?.[c.fuente]}</b> : it.datos?.[c.fuente] || '—'}
                  </td>
                ))}
                {usuario.map((c) => {
                  const esObs = c.rol === 'observacion';
                  const invalido = !!err && ((c.rol === 'evaluacion' && !v[c.clave]) || (esObs && ev?.es_conforme === false && !v[c.clave]) || (c.requerido && !v[c.clave]));
                  return (
                    <td key={c.clave} data-et={c.etiqueta} style={esObs ? { minWidth: 220 } : undefined}>
                      <Control campo={c} valor={v[c.clave]} editable={editable} invalido={invalido} formulario={formulario}
                        onCambio={(x) => actualizarValor(it.key, c.clave, x)} />
                      {c.rol === 'evaluacion' && ev?.es_conforme !== undefined && v[c.clave] !== undefined && v[c.clave] !== '' && (
                        <div className="pequeno" style={{ color: ev.es_conforme === false ? 'var(--rojo-alerta)' : ev.es_conforme ? 'var(--verde)' : '#777', fontWeight: 700 }}>
                          {ev.es_conforme === false ? 'No conforme' : ev.es_conforme ? 'Conforme' : 'No aplica'}
                        </div>
                      )}
                      {esObs && err && <div className="pequeno" style={{ color: 'var(--rojo-alerta)' }}>{err}</div>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
