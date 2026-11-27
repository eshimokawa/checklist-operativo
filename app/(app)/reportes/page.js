import { redirect } from 'next/navigation';
import { obtenerSesion } from '@/lib/api';
import Reportes from '@/components/Reportes';

export default async function Pagina() {
  const s = await obtenerSesion();
  if (s?.perfil.rol === 'jefe_area') redirect('/tareas');
  return <Reportes esAdmin={s?.perfil.rol === 'administrador_aplicacion'} />;
}
