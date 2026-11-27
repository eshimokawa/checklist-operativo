'use client';
import { useState } from 'react';
import { api } from '@/components/ui';

export default function Login() {
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const r = await api('/api/auth/login', { method: 'POST', json: { correo, password } });
      window.location.href = r.destino || '/';
    } catch (err) {
      setError(err.message);
      setCargando(false);
    }
  }

  return (
    <main className="login-fondo">
      <div className="login-caja">
        <div className="barra-marca" />
        <div className="in">
          <img src="/logo.png" alt="Check List Operativo" style={{ height: 44, marginBottom: 18 }} />
          <h1 className="mayus" style={{ fontSize: '1.2rem' }}>Iniciar sesión</h1>
          <p className="suave pequeno">Gestión y auditoría de check lists operativos. Las cuentas las crea el administrador de la aplicación.</p>
          <form onSubmit={enviar} className="col" style={{ gap: 14, marginTop: 14 }}>
            <label className="campo">Correo electrónico
              <input type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
            </label>
            <label className="campo">Contraseña
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            {error && <div className="toast error" role="alert">{error}</div>}
            <button className="btn grande" disabled={cargando} style={{ justifyContent: 'center' }}>
              {cargando ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
