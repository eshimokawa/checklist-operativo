'use client';
import { useEffect, useMemo, useState } from 'react';
import { api, Modal, useToast } from '../ui';
import { diasATexto, inferirClasificacion } from '@/lib/negocio';

const TIPOS = [['general', 'General / Infraestructura'], ['trabajadores', 'Personal (trabajadores)'], ['equipos', 'Equipos']];
const OPC_DEF = { general: 'SI, NO, N/A', trabajadores: 'Conforme, No conforme', equipos: 'Conforme, No conforme' };
const ROL_TXT = { administrador_restaurante: 'Administrador de restaurante', jefe_area: 'Jefe de área' };
const lista = (t) => String(t || '').split(/\n|,|;/).map((x) => x.trim()).filter(Boolean);
const slug = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'lectura';
const preguntaVacia = () => ({ subcategoria: '', texto: '', es_punto_critico: false });

function estadoInicial(unidadId) {
  return {
    codigo: '', nombre: '', unidad_id: unidadId || '', tipo_evaluacion: 'general', estandar_porcentaje: 90,
    opciones: OPC_DEF.general, clas: {}, aspectos: '',
    ev_tipo: 'opciones', ev_etiqueta: 'Temperatura real', ev_unidad: '°C', regla_tipo: 'rango_parametro', regla_valor: '', obs_opciones: '',
    equipos_ids: [], frecuencia_id: '', usuario_id: '',
    secciones: [{ nombre: '', preguntas: [preguntaVacia()] }],
  };
}

/** Arma la definición que espera POST /api/config/formularios/guardar */
function construirDefinicion(n) {
  const ops = lista(n.opciones);
  const inf = inferirClasificacion(ops);
  const clase = (o) => n.clas[o] || (inf.conformes.includes(o) ? 'ok' : inf.noAplica.includes(o) ? 'na' : 'nc');
  const d = {
    codigo: n.codigo.trim(), nombre: n.nombre.trim(), tipo_evaluacion: n.tipo_evaluacion, estandar_porcentaje: Number(n.estandar_porcentaje),
    opciones_respuesta: [], opciones_conformes: [], opciones_no_aplica: [], campos: [], secciones: [],
    aspectos_informativos: n.tipo_evaluacion === 'general' ? [] : n.aspectos.split('\n').map((x) => x.trim()).filter(Boolean),
  };
  if (n.tipo_evaluacion !== 'equipos' || n.ev_tipo === 'opciones') {
    d.opciones_respuesta = ops;
    d.opciones_conformes = ops.filter((o) => clase(o) === 'ok');
    d.opciones_no_aplica = ops.filter((o) => clase(o) === 'na');
  }
  if (n.tipo_evaluacion === 'general') {
    d.secciones = n.secciones
      .map((s) => ({
        nombre: s.nombre.trim() || 'General',
        preguntas: s.preguntas.filter((p) => p.texto.trim()).map((p) => ({ subcategoria: p.subcategoria.trim() || null, texto: p.texto.trim(), es_punto_critico: !!p.es_punto_critico })),
      }))
      .filter((s) => s.preguntas.length);
    if (!d.secciones.length) throw new Error('Agregue al menos una pregunta.');
    return d;
  }
  const obsOps = lista(n.obs_opciones);
  const observacion = { clave: 'observacion', etiqueta: 'Observaciones y acción correctiva', origen: 'usuario', tipo: obsOps.length ? 'opciones' : 'texto', opciones: obsOps, rol: 'observacion', requerido: false };
  const revision = { clave: 'revision', etiqueta: 'Revisión', origen: 'usuario', tipo: 'opciones', opciones: ops, rol: 'evaluacion', requerido: true, regla: { tipo: 'opciones' } };
  const pre = (clave, etiqueta, fuente) => ({ clave, etiqueta, origen: 'precompletado', fuente, tipo: 'texto', rol: 'dato' });
  if (n.tipo_evaluacion === 'trabajadores') {
    d.campos = [pre('colaborador', 'Colaborador', 'nombre_completo'), pre('area', 'Área', 'area'), revision, observacion];
    return d;
  }
  d.campos = [pre('area', 'Área', 'area'), pre('codigo', 'Código', 'codigo_equipo'), pre('descripcion', 'Descripción', 'descripcion_equipo')];
  if (n.ev_tipo === 'numero') {
    if (!n.ev_etiqueta.trim()) throw new Error('Indique el nombre de la lectura numérica.');
    if (n.regla_tipo !== 'rango_parametro' && n.regla_valor === '') throw new Error('Indique el valor límite de la regla.');
    if (n.regla_tipo === 'rango_parametro') d.campos.push(pre('parametro', 'Parámetro', 'temperatura_funcionamiento'));
    let clave = slug(n.ev_etiqueta);
    if (['area', 'codigo', 'descripcion', 'parametro', 'observacion'].includes(clave)) clave += '_valor';
    d.campos.push({
      clave, etiqueta: n.ev_etiqueta.trim(), origen: 'usuario', tipo: 'numero', opciones: [], rol: 'evaluacion', requerido: true,
      unidad: n.ev_unidad.trim() || undefined,
      regla: n.regla_tipo === 'rango_parametro' ? { tipo: 'rango_parametro' } : { tipo: n.regla_tipo, valor: Number(n.regla_valor) },
    });
  } else d.campos.push(revision);
  d.campos.push(observacion);
  d.equipos_ids = n.equipos_ids;
  return d;
}

export default function NuevoFormulario({ abierto, cat, onCerrar, onCreado }) {
  const avisar = useToast();
  const [n, setN] = useState(() => estadoInicial(''));
  const [equipos, setEquipos] = useState([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setN(estadoInicial(cat.unidades.find((u) => u.activo)?.id));
    api('/api/config/equipos').then((r) => setEquipos(r.filas)).catch(() => setEquipos([]));
  }, [abierto, cat.unidades]);

  const set = (cambios) => setN((x) => ({ ...x, ...cambios }));
  const ops = lista(n.opciones);
  const inf = inferirClasificacion(ops);
  const clase = (o) => n.clas[o] || (inf.conformes.includes(o) ? 'ok' : inf.noAplica.includes(o) ? 'na' : 'nc');
  const usaOp = n.tipo_evaluacion !== 'equipos' || n.ev_tipo === 'opciones';
  const equiposUnidad = useMemo(() => equipos.filter((e) => e.activo && e.unidad_id === n.unidad_id), [equipos, n.unidad_id]);
  const usuarios = cat.usuarios.filter((u) => u.activo && u.rol !== 'administrador_aplicacion' && u.unidad_id === n.unidad_id);

  const cambiarTipo = (tipo) => set({
    tipo_evaluacion: tipo,
    ...(Object.values(OPC_DEF).includes(n.opciones.trim()) ? { opciones: OPC_DEF[tipo], clas: {} } : {}),
  });
  const setSeccion = (i, cambios) => set({ secciones: n.secciones.map((s, k) => (k === i ? { ...s, ...cambios } : s)) });
  const setPregunta = (i, j, cambios) => setSeccion(i, { preguntas: n.secciones[i].preguntas.map((p, k) => (k === j ? { ...p, ...cambios } : p)) });

  async function crear() {
    try {
      if (!n.unidad_id) throw new Error('Seleccione la unidad.');
      if (Boolean(n.frecuencia_id) !== Boolean(n.usuario_id)) throw new Error('Para asignar el formulario indique frecuencia y usuario responsable (o deje ambos vacíos).');
      if (n.tipo_evaluacion === 'equipos' && !equiposUnidad.length) throw new Error('La unidad no tiene equipos activos. Cárguelos primero en la pestaña Equipos.');
      const formulario = construirDefinicion(n);
      setGuardando(true);
      const r = await api('/api/config/formularios/guardar', {
        method: 'POST',
        json: {
          formulario, unidad_id: n.unidad_id, frecuencia_id: n.frecuencia_id || null, usuario_responsable_id: n.usuario_id || null,
          reemplazar: false, origen_archivo: 'Creado manualmente',
        },
      });
      avisar(`Formulario ${formulario.codigo} creado${r.asignacion ? ' y asignado' : '. Asígnelo en la pestaña Asignaciones'}.`, 'ok', 7000);
      onCreado();
    } catch (e) {
      avisar(e.message, 'error', 8000);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Nuevo formulario" ancho
      pie={<><button className="btn sec" onClick={onCerrar}>Cancelar</button><button className="btn" disabled={guardando} onClick={crear}>{guardando ? 'Creando…' : 'Crear formulario'}</button></>}>
      <div className="col" style={{ gap: 14 }}>
        <div className="grid grid-4">
          <label className="campo">Código *<input value={n.codigo} placeholder="Ej. LM-LCO" onChange={(e) => set({ codigo: e.target.value })} /></label>
          <label className="campo" style={{ gridColumn: 'span 2' }}>Nombre *<input value={n.nombre} placeholder="Ej. La Mar - Limpieza de cocina" onChange={(e) => set({ nombre: e.target.value })} /></label>
          <label className="campo">Estándar (%)<input type="number" min="0" max="100" value={n.estandar_porcentaje} onChange={(e) => set({ estandar_porcentaje: e.target.value })} /></label>
          <label className="campo">Unidad *
            <select value={n.unidad_id} onChange={(e) => set({ unidad_id: e.target.value, equipos_ids: [], usuario_id: '' })}>
              <option value="">Seleccione…</option>
              {cat.unidades.filter((u) => u.activo).map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </label>
          <label className="campo" style={{ gridColumn: 'span 2' }}>Tipo de evaluación *
            <select value={n.tipo_evaluacion} onChange={(e) => cambiarTipo(e.target.value)}>
              {TIPOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </label>
        </div>

        {n.tipo_evaluacion === 'equipos' && (
          <div className="grid grid-4" style={{ alignItems: 'end' }}>
            <label className="campo">Forma de evaluar *
              <select value={n.ev_tipo} onChange={(e) => set({ ev_tipo: e.target.value })}>
                <option value="opciones">Con opciones (ej. Conforme / No conforme)</option>
                <option value="numero">Con una lectura numérica</option>
              </select>
            </label>
            {n.ev_tipo === 'numero' && (
              <>
                <label className="campo">Nombre de la lectura *<input value={n.ev_etiqueta} onChange={(e) => set({ ev_etiqueta: e.target.value })} /></label>
                <label className="campo">Unidad de medida<input value={n.ev_unidad} placeholder="°C, %, …" onChange={(e) => set({ ev_unidad: e.target.value })} /></label>
                <label className="campo">Es conforme si…
                  <select value={n.regla_tipo} onChange={(e) => set({ regla_tipo: e.target.value })}>
                    <option value="rango_parametro">Está dentro del parámetro del equipo</option>
                    <option value="max">Es menor o igual a</option>
                    <option value="min">Es mayor o igual a</option>
                  </select>
                </label>
                {n.regla_tipo !== 'rango_parametro' && (
                  <label className="campo">Valor límite *<input type="number" step="any" value={n.regla_valor} onChange={(e) => set({ regla_valor: e.target.value })} /></label>
                )}
              </>
            )}
          </div>
        )}

        {usaOp && (
          <div>
            <label className="campo">Opciones de respuesta * (separadas por coma, en el orden a mostrar)
              <input value={n.opciones} onChange={(e) => set({ opciones: e.target.value })} />
            </label>
            <div className="fila mt">
              {ops.map((o) => (
                <div key={o} className="fila" style={{ gap: 4, border: '1px solid var(--borde)', borderRadius: 12, padding: '4px 8px' }}>
                  <b className="pequeno">{o}</b>
                  <select value={clase(o)} onChange={(e) => set({ clas: { ...n.clas, [o]: e.target.value } })} style={{ width: 'auto', padding: '3px 6px', fontSize: '0.8rem' }}>
                    <option value="ok">Conforme</option><option value="nc">No conforme</option><option value="na">No aplica (excluida)</option>
                  </select>
                </div>
              ))}
            </div>
            <p className="suave pequeno" style={{ margin: '6px 0 0' }}>La calificación cuenta las respuestas conformes sobre las aplicables; las de “No aplica” no se cuentan.</p>
          </div>
        )}

        {n.tipo_evaluacion === 'general' && (
          <div>
            <h3 style={{ margin: '4px 0 8px' }}>Secciones y preguntas</h3>
            {n.secciones.map((s, i) => (
              <div key={i} className="tarjeta" style={{ border: '1px solid var(--borde)', boxShadow: 'none', padding: 12, marginBottom: 10 }}>
                <div className="fila">
                  <label className="campo" style={{ flex: 1 }}>Sección / Área {i + 1}
                    <input value={s.nombre} placeholder="Ej. Área de mantenimiento" onChange={(e) => setSeccion(i, { nombre: e.target.value })} />
                  </label>
                  {n.secciones.length > 1 && (
                    <button className="btn fantasma peq" style={{ color: 'var(--rojo-alerta)', alignSelf: 'flex-end' }} onClick={() => set({ secciones: n.secciones.filter((_, k) => k !== i) })}>Quitar sección</button>
                  )}
                </div>
                <div className="tabla-wrap mt">
                  <table className="tabla">
                    <thead><tr><th style={{ width: '24%' }}>Subcategoría</th><th>Pregunta / aspecto a evaluar *</th><th style={{ width: 90 }}>Punto crítico</th><th style={{ width: 40 }} /></tr></thead>
                    <tbody>
                      {s.preguntas.map((p, j) => (
                        <tr key={j}>
                          <td><input value={p.subcategoria} placeholder="Opcional" onChange={(e) => setPregunta(i, j, { subcategoria: e.target.value })} /></td>
                          <td><input value={p.texto} onChange={(e) => setPregunta(i, j, { texto: e.target.value })} /></td>
                          <td className="centro"><input type="checkbox" checked={p.es_punto_critico} onChange={(e) => setPregunta(i, j, { es_punto_critico: e.target.checked })} /></td>
                          <td>{s.preguntas.length > 1 && <button className="btn fantasma peq" title="Quitar pregunta" onClick={() => setSeccion(i, { preguntas: s.preguntas.filter((_, k) => k !== j) })}>✕</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button className="btn fantasma peq mt" onClick={() => setSeccion(i, { preguntas: [...s.preguntas, { ...preguntaVacia(), subcategoria: s.preguntas[s.preguntas.length - 1]?.subcategoria || '' }] })}>+ Agregar pregunta</button>
              </div>
            ))}
            <button className="btn sec peq" onClick={() => set({ secciones: [...n.secciones, { nombre: '', preguntas: [preguntaVacia()] }] })}>+ Agregar sección</button>
          </div>
        )}

        {n.tipo_evaluacion !== 'general' && (
          <>
            <label className="campo">Aspectos a evaluar (uno por línea; opcional — se muestran como referencia)
              <textarea rows={3} value={n.aspectos} onChange={(e) => set({ aspectos: e.target.value })} />
            </label>
            <label className="campo">Opciones para “Observaciones y acción correctiva” (opcional, separadas por coma; vacío = texto libre)
              <input value={n.obs_opciones} placeholder="Ej. Se corrige en el momento, Se informa a mantenimiento" onChange={(e) => set({ obs_opciones: e.target.value })} />
            </label>
            <p className="suave pequeno" style={{ margin: 0 }}>
              {n.tipo_evaluacion === 'trabajadores'
                ? 'Se evaluarán automáticamente los trabajadores activos de la sede (y solo los del área del responsable si es Jefe de área).'
                : `Columnas precompletadas: Área, Código, Descripción${n.ev_tipo === 'numero' && n.regla_tipo === 'rango_parametro' ? ' y Parámetro (temperatura de funcionamiento del equipo).' : '.'}`}
            </p>
          </>
        )}

        {n.tipo_evaluacion === 'equipos' && (
          <div>
            <div className="fila-entre">
              <h3 style={{ margin: '4px 0' }}>Equipos a evaluar</h3>
              {equiposUnidad.length > 0 && (
                <button className="btn fantasma peq" onClick={() => set({ equipos_ids: n.equipos_ids.length === equiposUnidad.length ? [] : equiposUnidad.map((e) => e.id) })}>
                  {n.equipos_ids.length === equiposUnidad.length ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              )}
            </div>
            <p className="suave pequeno" style={{ margin: '2px 0 8px' }}>Si no marca ninguno, se usarán todos los equipos activos de la sede (o del área del responsable).</p>
            {equiposUnidad.length ? (
              <div className="tabla-wrap" style={{ maxHeight: 260, overflow: 'auto' }}>
                <table className="tabla">
                  <thead><tr><th style={{ width: 40 }} /><th>Código</th><th>Descripción</th><th>Área</th><th>Parámetro</th></tr></thead>
                  <tbody>
                    {equiposUnidad.map((e) => (
                      <tr key={e.id}>
                        <td><input type="checkbox" checked={n.equipos_ids.includes(e.id)}
                          onChange={(ev) => set({ equipos_ids: ev.target.checked ? [...n.equipos_ids, e.id] : n.equipos_ids.filter((x) => x !== e.id) })} /></td>
                        <td><b>{e.codigo_equipo}</b></td><td>{e.descripcion_equipo}</td><td>{e.area?.descripcion_area || '—'}</td>
                        <td className="pequeno">{e.temperatura_funcionamiento || (n.ev_tipo === 'numero' && n.regla_tipo === 'rango_parametro' ? <span style={{ color: 'var(--rojo-alerta)' }}>Sin parámetro</span> : '—')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="toast" style={{ background: 'var(--ambar)' }}>Esta unidad no tiene equipos registrados. Cárguelos en la pestaña Equipos.</div>}
          </div>
        )}

        <div className="grid grid-2" style={{ borderTop: '1px solid var(--borde)', paddingTop: 12 }}>
          <label className="campo">Frecuencia de llenado (opcional)
            <select value={n.frecuencia_id} onChange={(e) => set({ frecuencia_id: e.target.value })}>
              <option value="">(asignar después)</option>
              {cat.frecuencias.filter((f) => f.activo).map((f) => <option key={f.id} value={f.id}>{f.nombre_frecuencia} · {diasATexto(f.dias_semana)} {String(f.hora_inicio).slice(0, 5)}–{String(f.hora_fin).slice(0, 5)}</option>)}
            </select>
          </label>
          <label className="campo">Usuario responsable (opcional)
            <select value={n.usuario_id} onChange={(e) => set({ usuario_id: e.target.value })}>
              <option value="">(asignar después)</option>
              {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre_completo} · {ROL_TXT[u.rol]}{u.area ? ` (${u.area.descripcion_area})` : ''}</option>)}
            </select>
          </label>
        </div>
      </div>
    </Modal>
  );
}
