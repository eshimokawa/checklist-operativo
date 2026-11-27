// Crea el primer Administrador de la aplicación.
// Uso: node scripts/crear-admin.mjs correo@empresa.com "Nombre Completo" "Contraseña-Segura-123"
// Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno (o en .env.local).
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

for (const f of ['.env.local', '.env']) {
  if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const [correo, nombre, password] = process.argv.slice(2);
if (!correo || !nombre || !password || password.length < 8) {
  console.error('Uso: node scripts/crear-admin.mjs <correo> "<nombre completo>" "<contraseña de 8+ caracteres>"');
  process.exit(1);
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await db.auth.admin.createUser({ email: correo.toLowerCase(), password, email_confirm: true });
if (error) { console.error('Error en Supabase Auth:', error.message); process.exit(1); }
const { error: e2 } = await db.from('usuarios').insert({
  id: data.user.id, nombre_completo: nombre, correo: correo.toLowerCase(), rol: 'administrador_aplicacion', activo: true,
});
if (e2) { await db.auth.admin.deleteUser(data.user.id); console.error('Error al crear el perfil:', e2.message); process.exit(1); }
console.log(`✔ Administrador creado: ${correo}`);
