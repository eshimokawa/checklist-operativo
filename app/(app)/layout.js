import { redirect } from 'next/navigation';
import { obtenerSesion } from '@/lib/api';
import AppShell from '@/components/AppShell';

export const dynamic = 'force-dynamic';

export default async function LayoutApp({ children }) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect('/login');
  const p = sesion.perfil;
  const perfil = {
    id: p.id, nombre_completo: p.nombre_completo, correo: p.correo, rol: p.rol,
    unidad: p.unidad?.nombre || null, area: p.area?.descripcion_area || null,
  };
  return <AppShell perfil={perfil}>{children}</AppShell>;
}
