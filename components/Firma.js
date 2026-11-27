'use client';
import { useEffect, useRef, useState } from 'react';

/** Firma dibujada con mouse o pantalla táctil. onCambio(dataURL | null) */
export default function Firma({ onCambio }) {
  const ref = useRef(null);
  const dibujando = useRef(false);
  const ultimo = useRef(null);
  const [vacia, setVacia] = useState(true);

  useEffect(() => {
    const c = ref.current;
    const ajustar = () => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = r.width * dpr;
      c.height = r.height * dpr;
      const ctx = c.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1d1d4f';
      setVacia(true);
      onCambio?.(null);
    };
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const punto = (e) => {
    const r = ref.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const inicio = (e) => {
    e.preventDefault();
    ref.current.setPointerCapture?.(e.pointerId);
    dibujando.current = true;
    ultimo.current = punto(e);
    const ctx = ref.current.getContext('2d');
    ctx.beginPath();
    ctx.arc(ultimo.current.x, ultimo.current.y, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = '#1d1d4f';
    ctx.fill();
  };
  const mover = (e) => {
    if (!dibujando.current) return;
    e.preventDefault();
    const p = punto(e);
    const ctx = ref.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(ultimo.current.x, ultimo.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ultimo.current = p;
  };
  const fin = () => {
    if (!dibujando.current) return;
    dibujando.current = false;
    setVacia(false);
    onCambio?.(exportar());
  };
  // Exporta en PNG con fondo blanco (para PDF)
  const exportar = () => {
    const c = ref.current;
    const t = document.createElement('canvas');
    t.width = c.width; t.height = c.height;
    const ctx = t.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, t.width, t.height);
    ctx.drawImage(c, 0, 0);
    return t.toDataURL('image/png');
  };
  const limpiar = () => {
    const c = ref.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    setVacia(true);
    onCambio?.(null);
  };

  return (
    <div>
      <canvas
        ref={ref}
        className="firma-canvas"
        onPointerDown={inicio}
        onPointerMove={mover}
        onPointerUp={fin}
        onPointerLeave={fin}
        onPointerCancel={fin}
      />
      <div className="fila-entre" style={{ marginTop: 6 }}>
        <span className="suave pequeno">{vacia ? 'Firme dentro del recuadro' : 'Firma registrada'}</span>
        <button type="button" className="btn fantasma peq" onClick={limpiar}>Limpiar</button>
      </div>
    </div>
  );
}
