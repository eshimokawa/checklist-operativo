import { redirect } from 'next/navigation';
import { obtenerSesion } from '@/lib/api';
import Dashboard from '@/components/Dashboard';

export default async function Pagina() {
  const s = await obtenerSesion();
  if (s?.perfil.rol === 'jefe_area') redirect('/tareas');
  return <Dashboard esAdmin={s?.perfil.rol === 'administrador_aplicacion'} />;
}
