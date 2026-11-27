import { ruta, ROLES } from '@/lib/api';
import { guardarFormulario } from '@/lib/formularios';
export const dynamic = 'force-dynamic';

export const POST = ruta(async ({ req, db }) => guardarFormulario(db, await req.json()), { roles: [ROLES.ADMIN_APP] });
