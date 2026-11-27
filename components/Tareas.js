'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, Cargando, ChipNivel } from './ui';
import { fechaLocal, horaLocal } from '@/lib/negocio';

function Tarea({ t }) {
  const futura = t.estado === 'Pendiente' && new Date(t.ventana_inicio) > new Date();
  const vencida = t.estado === 'Vencida' || (t.estado === 'Pendiente' && new Date(t.ventana_fin) < new Date());
  const estado = vencida ? 'Vencida' : t.estado;
  return (
    <a href={`/ejecutar/${t.id}`} className={`tarea ${futura ? 'Futura' : estado}`} style={{ color: 'inherit', textDecoration: 'none' }}>
      <div className="col" style={{ gap: 2, flex: 1, minWidth: 220 }}>
        <strong style={{ color: 'var(--titulo)' }}>{t.formulario?.codigo} - {t.formulario?.nombre}</strong>
        <span className="pequeno suave">
          {t.unidad?.nombre}{t.area ? ` · ${t.area.descripcion_area}` : ''} · {t.fecha_programada} · Ventana {horaLocal(t.ventana_inicio)} – {horaLocal(t.ventana_fin)}
        </span>
      </div>
      <div className="fila">
        {estado === 'Finalizado' ? <ChipNivel etiqueta={t.etiqueta_calificacion} pct={t.calificacion_porcentaje} /> : null}
        <span className={`chip ${estado}`}>
          {estado === 'Vencida' ? <span className="ico-estado vencida" /> : estado === 'Pendiente' ? <span className="ico-estado asignada" /> : '✓'}
          {futura ? 'Programada' : estado === 'Pendiente' ? 'Tarea asignada' : estado === 'Vencida' ? 'Tarea vencida' : 'Finalizado'}
        </span>
        <span className="btn peq">{estado === 'Finalizado' ? 'Ver' : 'Completar'}</span>
      </div>
    </a>
  );
}

export default function Tareas() {
  const [fecha, setFecha] = useState(fechaLocal());
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try { setDatos(await api(`/api/tareas?fecha=${fecha}`)); setError(''); }
    catch (e) { setError(e.message); }
  }, [fecha]);

  useEffect(() => { setDatos(null); cargar(); }, [cargar]);
  useEffect(() => {
    const f = () => cargar();
    window.addEventListener('tareas:actualizar', f);
    return () => window.removeEventListener('tareas:actualizar', f);
  }, [cargar]);

  return (
    <>
      <div className="fila-entre mb">
        <div>
          <h1>Mis check lists</h1>
          <div className="leyenda">
            <span><span className="ico-estado asignada" /> Tarea asignada</span>
            <span><span className="ico-estado vencida" /> Tarea vencida</span>
          </div>
        </div>
        <label className="campo" style={{ width: 190 }}>Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
      </div>
      {error && <div className="toast error mb">{error}</div>}
      {!datos ? <Cargando /> : (
        <div className="col" style={{ gap: 10 }}>
          {datos.tareas.length === 0 && <div className="tarjeta vacio">No tiene check lists programados para esta fecha.</div>}
          {datos.tareas.map((t) => <Tarea key={t.id} t={t} />)}
          {datos.atrasadas?.length > 0 && (
            <>
              <h3 className="mt">Pendientes de días anteriores</h3>
              {datos.atrasadas.map((t) => <Tarea key={t.id} t={t} />)}
            </>
          )}
        </div>
      )}
    </>
  );
}
