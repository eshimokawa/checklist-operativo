import sgMail from '@sendgrid/mail';
import fs from 'fs';
import path from 'path';
import { COLORES_ETIQUETA } from './negocio';
import { resumen } from './reporte';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function htmlCorreo(rep) {
  const R = resumen(rep);
  const color = COLORES_ETIQUETA[R.etiqueta] || COLORES_ETIQUETA.Deficiente;
  const fila = (k, v, extra = '') =>
    `<tr><td style="padding:7px 0;color:#71255E;font-weight:700;width:170px;vertical-align:top">${k}</td><td style="padding:7px 0;color:#534A4B;${extra}">${v}</td></tr>`;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#F3EEF3;font-family:Raleway,'Segoe UI',Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3EEF3;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(73,47,71,.12)">
        <tr><td style="padding:22px 28px 14px;border-bottom:4px solid #870064" align="left">
          <img src="cid:logo" alt="Check List Operativo" height="40" style="display:block;height:40px">
        </td></tr>
        <tr><td style="padding:24px 28px 8px;font-size:15px;color:#534A4B">Se le ha enviado el siguiente formulario:</td></tr>
        <tr><td style="padding:4px 28px 8px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
            ${fila('Formulario:', esc(R.formularioNombre))}
            ${fila('Ubicación:', esc(R.ubicacion))}
            ${fila('Calificación:', `<span style="display:inline-block;padding:3px 12px;border-radius:999px;background:${color.fondo};color:#FFFFFF;font-weight:700">${esc(R.calificacion)} · ${esc(R.etiqueta)}</span>`)}
            ${fila('Estándar:', esc(R.estandar))}
            ${fila('Fecha:', esc(R.fecha))}
            ${fila('Tiempo de Ejecución:', esc(R.tiempo))}
            ${fila('Auditor:', esc(R.auditor))}
            ${fila('Auditado:', esc(R.auditado))}
          </table>
        </td></tr>
        <tr><td style="padding:16px 28px 26px;font-size:13px;color:#7A7272;border-top:1px solid #EFE7EF">Adjunto a este correo encontrará el formulario en versión PDF.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function enviarReporte(rep, pdfBuffer, destinatario) {
  const key = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM_EMAIL;
  if (!key || !from) throw new Error('SendGrid no está configurado (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL).');
  sgMail.setApiKey(key);
  const R = resumen(rep);
  const adjuntos = [
    {
      content: pdfBuffer.toString('base64'),
      filename: `${rep.formulario.codigo}_${(R.fecha || '').slice(0, 10)}_${(rep.unidad?.codigo || '').replace(/\W/g, '')}.pdf`,
      type: 'application/pdf',
      disposition: 'attachment',
    },
  ];
  const logo = path.join(process.cwd(), 'public', 'logo.png');
  if (fs.existsSync(logo)) {
    adjuntos.push({ content: fs.readFileSync(logo).toString('base64'), filename: 'logo.png', type: 'image/png', disposition: 'inline', content_id: 'logo' });
  }
  try {
    await sgMail.send({
      to: destinatario,
      from: { email: from, name: process.env.SENDGRID_FROM_NAME || 'Check List Operativo' },
      subject: `Check list: ${R.formularioNombre} · ${R.ubicacion} · ${R.calificacion} (${R.etiqueta})`,
      html: htmlCorreo(rep),
      text: `Se le ha enviado el siguiente formulario:\nFormulario: ${R.formularioNombre}\nUbicación: ${R.ubicacion}\nCalificación: ${R.calificacion}\nEstándar: ${R.estandar}\nFecha: ${R.fecha}\nTiempo de Ejecución: ${R.tiempo}\nAuditor: ${R.auditor}\nAuditado: ${R.auditado}\n\nAdjunto a este correo encontrará el formulario en versión PDF.`,
      attachments: adjuntos,
    });
  } catch (e) {
    const detalle = e?.response?.body?.errors?.map((x) => x.message).join('; ');
    throw new Error(`SendGrid rechazó el envío${detalle ? ': ' + detalle : ''}`);
  }
}
