'use client';
import { useEffect, useState } from 'react';
import { api, Cargando, useToast } from './ui';
import Filtros, { aQuery } from './Filtros';
import { fechaLocal, fechaHoraLocal } from '@/lib/negocio';

const COLOR = { Bueno: 'var(--verde)', Regular: 'var(--ambar)', Deficiente: 'var(--rojo-alerta)' };
const nivel = (p) => (p >= 90 ? 'Bueno' : p >= 70 ? 'Regular' : 'Deficiente');

function Kpi({ et, valor, sub, color }) {
  return (
    <div className="kpi" style={color ? { borderTopColor: color } : undefined}>
      <div className="et">{et}</div>
      <div className="valor" style={color ? { color } : undefined}>{valor}</div>
      {sub && <div className="suave pequeno">{sub}</div>}
    </div>
  );
}

function TablaRecurrencia({ titulo, filas, columnas }) {
  return (
    <div className="tarjeta">
      <h3>{titulo}</h3>
      {filas.length === 0 ? <div className="vacio pequeno">Sin incumplimientos en el periodo.</div> : (
        <table className="tabla">
          <thead><tr>{columnas.map((c) => <th key={c.k}>{c.t}</th>)}<th>Incumpl.</th><th style={{ width: '30%' }}>% sobre aplicables</th></tr></thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>
                {columnas.map((c) => <td key={c.k} className={c.peq ? 'pequeno suave' : ''}>{f[c.k]}</td>)}
                <td><b>{f.incumplimientos}</b><span className="suave pequeno"> / {f.aplicables}</span></td>
                <td>
                  <div className="barra-h"><span style={{ width: `${Math.min(100, f.porcentaje)}%`, background: f.porcentaje > 50 ? 'var(--rojo-alerta)' : 'var(--ciruela)' }} /></div>
                  <span className="pequeno">{f.porcentaje.toFixed(1)}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function Dashboard({ esAdmin }) {
  const avisar = useToast();
  const [f, setF] = useState({ desde: fechaLocal(new Date(Date.now() - 29 * 86400000)), hasta: fechaLocal() });
  const [d, setD] = useState(null);

  useEffect(() => {
    setD(null);
    const t = setTimeout(() => api(`/api/dashboard?${aQuery(f)}`).then(setD).catch((e) => avisar(e.message, 'error')), 250);
    return () => clearTimeout(t);
  }, [f, avisar]);

  const totalNiv = d ? d.niveles.Bueno + d.niveles.Regular + d.niveles.Deficiente : 0;

  return (
    <>
      <h1 className="mb">Dashboard de indicadores</h1>
      <Filtros valor={f} onCambio={setF} esAdmin={esAdmin} campos={['unidad', 'desde', 'hasta', 'formulario', 'area']} />
      {!d ? <Cargando /> : (
        <div className="col" style={{ gap: 16 }}>
          {/* Alerta crítica: ventana móvil de 30 días */}
          <div className={`tarjeta ${d.alertaCritica.length ? 'alerta-critica' : ''}`}>
            <div className="fila-entre">
              <h2 style={{ margin: 0 }}>⚠ Alerta crítica de reincidencia (últimos 30 días)</h2>
              <span className={`chip ${d.alertaCritica.length ? 'Deficiente' : 'Bueno'}`}>{d.alertaCritica.length} en alerta</span>
            </div>
            <p className="suave pequeno">Trabajadores y equipos con más del 50 % de incumplimiento en sus evaluaciones aplicables de los últimos 30 días.</p>
            {d.alertaCritica.length === 0 ? <div className="pequeno">Ningún trabajador o equipo supera el umbral.</div> : (
              <div className="tabla-wrap">
                <table className="tabla">
                  <thead><tr><th>Tipo</th><th>Nombre / Equipo</th><th>Unidad</th><th>Área</th><th>Evaluaciones</th><th>Incumplimientos</th><th>% Incumpl.</th><th>Última</th></tr></thead>
                  <tbody>
                    {d.alertaCritica.map((a) => (
                      <tr key={a.tipo + a.entidad_id}>
                        <td><span className="chip">{a.tipo === 'trabajador' ? '👤 Trabajador' : '🧊 Equipo'}</span></td>
                        <td><b>{a.nombre}</b></td><td>{a.unidad}</td><td>{a.area || '—'}</td>
                        <td>{a.evaluaciones_aplicables}</td><td>{a.incumplimientos}</td>
                        <td><span className="chip Deficiente">{Number(a.porcentaje_incumplimiento).toFixed(2)}%</span></td>
                        <td className="pequeno">{fechaHoraLocal(a.ultima_evaluacion).slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-4">
            <Kpi et="Calificación promedio" valor={d.totales.promedio === null ? '—' : `${d.totales.promedio.toFixed(2)}%`}
              sub={d.totales.promedio === null ? 'Sin ejecuciones' : nivel(d.totales.promedio)} color={d.totales.promedio === null ? null : COLOR[nivel(d.totales.promedio)]} />
            <Kpi et="Finalizados" valor={d.totales.Finalizado} sub={`de ${d.totales.programadas} programados`} />
            <Kpi et="Pendientes" valor={d.totales.Pendiente} color="#B98900" />
            <Kpi et="Vencidos" valor={d.totales.Vencida} color="var(--rojo-alerta)"
              sub={d.totales.cumplimientoEjecucion === null ? '' : `Cumplimiento de ejecución ${d.totales.cumplimientoEjecucion.toFixed(1)}%`} />
          </div>

          <div className="grid grid-2">
            <div className="tarjeta">
              <h3>Distribución por nivel</h3>
              {totalNiv === 0 ? <div className="vacio pequeno">Sin datos.</div> : (
                <>
                  <div className="dist">
                    {['Bueno', 'Regular', 'Deficiente'].map((n) => d.niveles[n] > 0 && (
                      <div key={n} style={{ width: `${(d.niveles[n] / totalNiv) * 100}%`, background: COLOR[n] }}>{Math.round((d.niveles[n] / totalNiv) * 100)}%</div>
                    ))}
                  </div>
                  <div className="fila mt">
                    {['Bueno', 'Regular', 'Deficiente'].map((n) => <span key={n} className={`chip ${n}`}>{n}: {d.niveles[n]}</span>)}
                  </div>
                  <p className="suave pequeno">Bueno ≥ 90 % · Regular 70 % – 89.99 % · Deficiente &lt; 70 %</p>
                </>
              )}
            </div>
            <div className="tarjeta">
              <h3>Promedio por formulario</h3>
              {d.porFormulario.length === 0 ? <div className="vacio pequeno">Sin datos.</div> : d.porFormulario.map((x) => (
                <div key={x.formulario} style={{ marginBottom: 10 }}>
                  <div className="fila-entre pequeno"><span>{x.formulario} <span className="suave">({x.ejecuciones})</span></span><b style={{ color: COLOR[nivel(x.promedio)] }}>{x.promedio.toFixed(2)}%</b></div>
                  <div className="barra-h" style={{ position: 'relative' }}>
                    <span style={{ width: `${x.promedio}%`, background: COLOR[nivel(x.promedio)] }} />
                  </div>
                  {x.estandar > 0 && <div className="suave pequeno">Estándar {x.estandar}% {x.promedio >= x.estandar ? '✓ cumple' : '✗ no cumple'}</div>}
                </div>
              ))}
            </div>
          </div>

          <TablaRecurrencia titulo="Recurrencia de incumplimiento por pregunta / aspecto" filas={d.recurrencia.porPregunta}
            columnas={[{ k: 'aspecto', t: 'Pregunta / Aspecto' }, { k: 'formulario', t: 'Formulario', peq: true }]} />
          <div className="grid grid-2">
            <TablaRecurrencia titulo="Por área" filas={d.recurrencia.porArea} columnas={[{ k: 'area', t: 'Área' }, { k: 'unidad', t: 'Unidad', peq: true }]} />
            <TablaRecurrencia titulo="Por formulario" filas={d.recurrencia.porFormulario} columnas={[{ k: 'formulario', t: 'Formulario' }]} />
          </div>
        </div>
      )}
    </>
  );
}
