'use client';
import { useEffect, useState } from 'react';
import { api } from './ui';

export function useCatalogos() {
  const [c, setC] = useState({ unidades: [], areas: [], formularios: [] });
  useEffect(() => { api('/api/catalogos').then(setC).catch(() => {}); }, []);
  return c;
}

export default function Filtros({ valor, onCambio, esAdmin, campos = ['unidad', 'desde', 'hasta', 'formulario', 'area', 'estado'], children }) {
  const cat = useCatalogos();
  const set = (k) => (e) => onCambio({ ...valor, [k]: e.target.value });
  const areas = cat.areas.filter((a) => !valor.unidad || a.unidad_id === valor.unidad);
  const forms = cat.formularios.filter((f) => !valor.unidad || f.unidad_id === valor.unidad);
  return (
    <div className="tarjeta mb">
      <div className="grid grid-4" style={{ alignItems: 'end' }}>
        {campos.includes('unidad') && (
          <label className="campo">Unidad
            <select value={valor.unidad || ''} onChange={set('unidad')} disabled={!esAdmin && cat.unidades.length <= 1}>
              {esAdmin && <option value="">Todas</option>}
              {cat.unidades.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </label>
        )}
        {campos.includes('desde') && <label className="campo">Desde<input type="date" value={valor.desde || ''} onChange={set('desde')} /></label>}
        {campos.includes('hasta') && <label className="campo">Hasta<input type="date" value={valor.hasta || ''} onChange={set('hasta')} /></label>}
        {campos.includes('formulario') && (
          <label className="campo">Formulario
            <select value={valor.formulario || ''} onChange={set('formulario')}>
              <option value="">Todos</option>
              {forms.map((f) => <option key={f.id} value={f.id}>{f.codigo} - {f.nombre}</option>)}
            </select>
          </label>
        )}
        {campos.includes('area') && (
          <label className="campo">Área
            <select value={valor.area || ''} onChange={set('area')}>
              <option value="">Todas</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.descripcion_area}{esAdmin && !valor.unidad ? ` (${cat.unidades.find((u) => u.id === a.unidad_id)?.nombre || ''})` : ''}</option>)}
            </select>
          </label>
        )}
        {campos.includes('estado') && (
          <label className="campo">Estado
            <select value={valor.estado || ''} onChange={set('estado')}>
              <option value="">Todos</option>
              <option>Pendiente</option><option>Vencida</option><option>Finalizado</option>
            </select>
          </label>
        )}
        {children}
      </div>
    </div>
  );
}

export function aQuery(f) {
  return new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
}
