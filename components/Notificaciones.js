'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, useToast } from './ui';

// Alertas internas: verifica el motor de frecuencias cada minuto (instancias + alertas exactas)
// y muestra el panel de notificaciones con indicadores de tareas pendientes/vencidas.
export default function Notificaciones() {
  const [datos, setDatos] = useState({ notificaciones: [], no_leidas: 0, pendientes: 0, vencidas: 0 });
  const [abierto, setAbierto] = useState(false);
  const vistas = useRef(null);
  const avisar = useToast();

  const refrescar = useCallback(async () => {
    try {
      await api('/api/motor/tick', { method: 'POST' });
      const d = await api('/api/notificaciones');
      // Aviso emergente para alertas nuevas desde la última consulta
      if (vistas.current) {
        d.notificaciones.filter((n) => !n.leida && !vistas.current.has(n.id)).forEach((n) => avisar(`🔔 ${n.mensaje}`, 'info', 9000));
      }
      vistas.current = new Set(d.notificaciones.map((n) => n.id));
      setDatos(d);
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('tareas:actualizar'));
    } catch { /* silencioso */ }
  }, [avisar]);

  useEffect(() => {
    refrescar();
    // Alineado al inicio de cada minuto para disparar las alertas en la hora exacta
    let intervalo;
    const espera = setTimeout(() => {
      refrescar();
      intervalo = setInterval(refrescar, 60000);
    }, 60000 - (Date.now() % 60000) + 1500);
    return () => { clearTimeout(espera); clearInterval(intervalo); };
  }, [refrescar]);

  async function marcarTodas() {
    await api('/api/notificaciones', { method: 'PATCH', json: { todas: true } });
    refrescar();
  }

  async function abrir(n) {
    if (!n.leida) await api('/api/notificaciones', { method: 'PATCH', json: { ids: [n.id] } }).catch(() => {});
    if (n.ejecucion_id) window.location.href = `/ejecutar/${n.ejecucion_id}`;
  }

  return (
    <>
      <div className="indicadores-tareas" title="Tareas pendientes / vencidas">
        {datos.pendientes > 0 && <a href="/tareas" className="chip Pendiente"><span className="ico-estado asignada" />{datos.pendientes}</a>}
        {datos.vencidas > 0 && <a href="/tareas" className="chip Vencida"><span className="ico-estado vencida" />{datos.vencidas}</a>}
      </div>
      <button className="campana" onClick={() => setAbierto(!abierto)} aria-label="Notificaciones">
        🔔{datos.no_leidas > 0 && <span className="globo">{datos.no_leidas}</span>}
      </button>
      {abierto && (
        <div className="panel-notif" onMouseLeave={() => setAbierto(false)}>
          <div className="fila-entre" style={{ padding: '12px 14px', borderBottom: '1px solid #eee' }}>
            <strong style={{ color: 'var(--titulo)' }}>Notificaciones</strong>
            {datos.no_leidas > 0 && <button className="btn fantasma peq" onClick={marcarTodas}>Marcar todas</button>}
          </div>
          {datos.notificaciones.length === 0 && <div className="vacio pequeno">Sin notificaciones</div>}
          {datos.notificaciones.map((n) => (
            <div key={n.id} className={`item ${n.leida ? '' : 'nueva'}`} onClick={() => abrir(n)}>
              <div className="pequeno" style={{ fontWeight: 700, color: n.tipo_alerta === 'cierre_proximo' ? 'var(--rojo-alerta)' : 'var(--titulo)' }}>
                {n.tipo_alerta === 'cierre_proximo' ? '⏰ Cierre próximo' : '▶ Inicio de ventana'}
              </div>
              <div>{n.mensaje}</div>
              <div className="suave pequeno">{new Date(n.fecha_creacion).toLocaleString('es-PE')}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
