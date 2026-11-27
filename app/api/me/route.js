import { ruta } from '@/lib/api';
export const dynamic = 'force-dynamic';
export const GET = ruta(async ({ sesion }) => ({ perfil: sesion.perfil }));
