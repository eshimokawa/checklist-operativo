import { redirect } from 'next/navigation';
import { obtenerSesion } from '@/lib/api';

export default async function Inicio() {
  const s = await obtenerSesion();
  if (!s) redirect('/login');
  if (s.perfil.rol === 'administrador_aplicacion') redirect('/configuracion');
  if (s.perfil.rol === 'administrador_restaurante') redirect('/dashboard');
  redirect('/tareas');
}
