'use client';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ProveedorToast, api } from './ui';
import Notificaciones from './Notificaciones';

const ROL_ET = {
  administrador_aplicacion: 'Administrador de la aplicación',
  administrador_restaurante: 'Administrador de restaurante',
  jefe_area: 'Jefe de área',
};

function enlaces(rol) {
  const l = [];
  if (rol !== 'administrador_aplicacion') l.push({ href: '/tareas', txt: 'Mis check lists', ico: '☑' });
  if (rol !== 'jefe_area') {
    l.push({ href: '/dashboard', txt: 'Dashboard', ico: '◔' });
    l.push({ href: '/reportes', txt: 'Reportes', ico: '☰' });
  }
  if (rol === 'administrador_aplicacion') l.push({ href: '/configuracion', txt: 'Configuración', ico: '⚙' });
  return l;
}

export default function AppShell({ perfil, children }) {
  const ruta = usePathname();
  const [menu, setMenu] = useState(false);
  const links = enlaces(perfil.rol);
  const iniciales = perfil.nombre_completo.split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

  async function salir() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  }

  return (
    <ProveedorToast>
      <div className="barra-marca" />
      <header className="cabecera">
        <div className="cabecera-in">
          <a href="/"><img className="logo" src="/logo.png" alt="Check List Operativo" /></a>
          <nav className="nav">
            {links.map((l) => <a key={l.href} href={l.href} className={ruta.startsWith(l.href) ? 'activo' : ''}>{l.txt}</a>)}
          </nav>
          <div className="fila" style={{ marginLeft: 'auto', position: 'relative' }}>
            {perfil.rol !== 'administrador_aplicacion' && <Notificaciones />}
            <button className="usuario-chip" onClick={() => setMenu(!menu)} title={perfil.nombre_completo}>{iniciales}</button>
            {menu && (
              <div className="panel-notif" style={{ width: 280, padding: 16 }}>
                <strong style={{ color: 'var(--titulo)' }}>{perfil.nombre_completo}</strong>
                <div className="suave pequeno">{perfil.correo}</div>
                <div className="pequeno mt">{ROL_ET[perfil.rol]}</div>
                {perfil.unidad && <div className="pequeno">Unidad: <b>{perfil.unidad}</b></div>}
                {perfil.area && <div className="pequeno">Área: <b>{perfil.area}</b></div>}
                <button className="btn sec peq mt" onClick={salir}>Cerrar sesión</button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="contenedor">{children}</main>
      <nav className="nav-movil">
        {links.map((l) => (
          <a key={l.href} href={l.href} className={ruta.startsWith(l.href) ? 'activo' : ''}><span className="ico">{l.ico}</span>{l.txt}</a>
        ))}
      </nav>
    </ProveedorToast>
  );
}
