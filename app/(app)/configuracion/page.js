import { redirect } from 'next/navigation';
import { obtenerSesion } from '@/lib/api';
import Configuracion from '@/components/config/Configuracion';

export default async function Pagina() {
  const s = await obtenerSesion();
  if (s?.perfil.rol !== 'administrador_aplicacion') redirect('/');
  return <Configuracion yo={s.perfil.id} />;
}
