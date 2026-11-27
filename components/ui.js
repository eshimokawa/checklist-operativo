'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/** fetch JSON con manejo de errores y expiración de sesión */
export async function api(url, opciones = {}) {
  const init = { ...opciones, headers: { ...(opciones.headers || {}) } };
  if (opciones.json !== undefined) {
    init.body = JSON.stringify(opciones.json);
    init.headers['Content-Type'] = 'application/json';
    delete init.json;
  }
  const r = await fetch(url, init);
  if (r.status === 401 && typeof window !== 'undefined' && !url.includes('/api/auth/')) {
    window.location.href = '/login';
    throw new Error('Sesión expirada');
  }
  const tipo = r.headers.get('content-type') || '';
  const datos = tipo.includes('application/json') ? await r.json() : null;
  if (!r.ok) throw new Error(datos?.error || `Error ${r.status}`);
  return datos;
}

/** Descarga un archivo de una ruta GET protegida */
export async function descargar(url, nombrePorDefecto = 'archivo') {
  const r = await fetch(url);
  if (!r.ok) {
    let msg = `Error ${r.status}`;
    try { msg = (await r.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  const blob = await r.blob();
  const disp = r.headers.get('content-disposition') || '';
  const nombre = (disp.match(/filename="([^"]+)"/) || [])[1] || nombrePorDefecto;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

const ToastCtx = createContext(() => {});
export function ProveedorToast({ children }) {
  const [lista, setLista] = useState([]);
  const avisar = useCallback((texto, tipo = 'info', ms = 4500) => {
    const id = Math.random();
    setLista((l) => [...l, { id, texto, tipo }]);
    setTimeout(() => setLista((l) => l.filter((t) => t.id !== id)), ms);
  }, []);
  return (
    <ToastCtx.Provider value={avisar}>
      {children}
      <div className="toast-zona" aria-live="polite">
        {lista.map((t) => <div key={t.id} className={`toast ${t.tipo}`}>{t.texto}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Modal({ abierto, onCerrar, titulo, children, ancho = false, pie }) {
  useEffect(() => {
    if (!abierto) return;
    const esc = (e) => e.key === 'Escape' && onCerrar?.();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [abierto, onCerrar]);
  if (!abierto) return null;
  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar?.()}>
      <div className={`modal ${ancho ? 'ancho' : ''}`} role="dialog" aria-modal="true">
        {titulo && <div className="fila-entre mb"><h2 style={{ margin: 0 }}>{titulo}</h2>{onCerrar && <button className="btn fantasma" onClick={onCerrar} aria-label="Cerrar">✕</button>}</div>}
        {children}
        {pie && <div className="fila mt" style={{ justifyContent: 'flex-end' }}>{pie}</div>}
      </div>
    </div>
  );
}

export function Acordeon({ titulo, derecha, abiertoInicial = false, children }) {
  const [abierto, setAbierto] = useState(abiertoInicial);
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

export function Cargando({ texto = 'Cargando…' }) {
  return <div className="vacio"><span className="spinner" /> <div className="mt">{texto}</div></div>;
}

export function ChipNivel({ etiqueta, pct }) {
  if (!etiqueta) return <span className="suave">-</span>;
  return <span className={`chip ${etiqueta}`}>{pct !== undefined && pct !== null ? `${Number(pct).toFixed(2)}% · ` : ''}{etiqueta}</span>;
}
