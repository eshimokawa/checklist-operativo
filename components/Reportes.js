'use client';
import { useEffect, useState } from 'react';
import { api, Cargando, ChipNivel, descargar, useToast } from './ui';
import Filtros, { aQuery } from './Filtros';
import { fechaHoraLocal, fechaLocal, horaLocal } from '@/lib/negocio';

export default function Reportes({ esAdmin }) {
  const avisar = useToast();
  const [f, setF] = useState({ desde: fechaLocal(new Date(Date.now() - 29 * 86400000)), hasta: fechaLocal() });
  const [datos, setDatos] = useState(null);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    setDatos(null);
    const t = setTimeout(() => api(`/api/reportes?${aQuery(f)}`).then(setDatos).catch((e) => { avisar(e.message, 'error'); setDatos({ filas: [], total: 0 }); }), 250);
    return () => clearTimeout(t);
  }, [f, avisar]);

  async function exportar() {
    setExportando(true);
    try { await descargar(`/api/reportes/excel?${aQuery(f)}`, 'reporte.xlsx'); }
    catch (e) { avisar(e.message, 'error'); }
    finally { setExportando(false); }
  }

  return (
    <>
      <div className="fila-entre mb">
        <h1>Historial y reportes</h1>
        <button className="btn" onClick={exportar} disabled={exportando}>{exportando ? 'Generando…' : '⬇ Exportar a Excel'}</button>
      </div>
      <Filtros valor={f} onCambio={setF} esAdmin={esAdmin} />
      <div className="tarjeta">
        {!datos ? <Cargando /> : (
          <>
            <div className="suave pequeno mb">{datos.total} registro(s){datos.total > 1000 ? ' · se muestran los primeros 1000 (la exportación incluye todos)' : ''}</div>
            <div className="tabla-wrap">
              <table className="tabla">
                <thead>
                  <tr><th>Fecha</th><th>Formulario</th><th>Unidad</th><th>Área / Auditado</th><th>Responsable</th><th>Estado</th><th>Registro</th><th>Tiempo</th><th>Calificación</th><th>Correo</th><th></th></tr>
                </thead>
                <tbody>
                  {datos.filas.length === 0 && <tr><td colSpan={11} className="vacio">Sin resultados para los filtros seleccionados.</td></tr>}
                  {datos.filas.map((e) => (
                    <tr key={e.id}>
                      <td>{e.fecha_programada}<div className="suave pequeno">{horaLocal(e.ventana_inicio)}–{horaLocal(e.ventana_fin)}</div></td>
                      <td><b>{e.formulario?.codigo}</b> {e.formulario?.nombre}</td>
                      <td>{e.unidad?.nombre}</td>
                      <td className="pequeno">{e.auditado_descripcion || e.area?.descripcion_area || '—'}</td>
                      <td>{e.auditor?.nombre_completo}</td>
                      <td><span className={`chip ${e.estado}`}>{e.estado}</span>{e.completado_fuera_plazo && <div className="pequeno" style={{ color: 'var(--rojo-alerta)' }}>Fuera de plazo</div>}</td>
                      <td className="pequeno">{e.fecha_hora_registro ? fechaHoraLocal(e.fecha_hora_registro) : '—'}</td>
                      <td>{e.tiempo_ejecucion_minutos ?? '—'}{e.tiempo_ejecucion_minutos !== null ? ' min' : ''}</td>
                      <td><ChipNivel etiqueta={e.etiqueta_calificacion} pct={e.calificacion_porcentaje} /></td>
                      <td>{e.estado === 'Finalizado' ? (e.correo_enviado ? '✓' : '—') : ''}</td>
                      <td><a className="btn peq sec" href={`/ejecutar/${e.id}`}>Ver</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
