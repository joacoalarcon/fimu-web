// Waitlist signup for fimu.cl.
//
// Saves each signup to every configured destination and succeeds if at least
// one of them stored it:
//   - Supabase table `public.waitlist` (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
//   - Google Sheet via Apps Script web app (APPS_SCRIPT_URL)
// Optionally sends a confirmation email with Resend (RESEND_API_KEY).
// Failures are logged with their real cause (Vercel → Logs).

const MOTIVOS = ['paciente', 'medico', 'clinica'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APP_URL = (process.env.APP_URL || 'https://app.fimu.cl').replace(/\/$/, '');

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

function betaUrlFor(email) {
  return `${APP_URL}/auth?mode=signup&ref=waitlist&email=${encodeURIComponent(email)}`;
}

async function saveToSupabase(entry) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null; // not configured

  const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/waitlist?on_conflict=email`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      // Re-submitting the same email updates the row instead of failing.
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(entry),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return true;
}

async function saveToSheet(entry) {
  const scriptUrl = process.env.APPS_SCRIPT_URL;
  if (!scriptUrl) return null; // not configured

  // Apps Script answers POST /exec with a 302 to googleusercontent.com; fetch follows it.
  const r = await fetch(scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(entry),
    redirect: 'follow',
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Apps Script ${r.status}: ${text.slice(0, 300)}`);

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    // An HTML page here means the web app is not deployed with access
    // "Cualquier persona" or the URL is not the /exec deployment URL.
    throw new Error(`Apps Script devolvió HTML (revisar acceso "Cualquier persona" y URL /exec): ${text.slice(0, 200)}`);
  }
  if (json.error) throw new Error(`Apps Script: ${json.error}`);
  return true;
}

async function sendConfirmation({ nombre, email, motivo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const from = process.env.WAITLIST_EMAIL_FROM || 'FiMU <hola@fimu.cl>';
  const first = nombre.split(/\s+/)[0].replace(/[<>&"]/g, '');
  const isPatient = motivo === 'paciente';

  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f3f9f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #e1eceb;border-radius:16px;">
<tr><td style="padding:28px;">
<img src="https://fimu.cl/fimu-logo.png" alt="FiMU" width="120" style="display:block;border:0;">
<h1 style="margin:24px 0 0;font-size:22px;color:#132e30;">¡Hola, ${first}! Ya estás en la lista 🎉</h1>
<p style="margin:12px 0 0;font-size:15px;line-height:23px;color:#5b6b6c;">Gracias por sumarte a FiMU, tu ficha médica universal.
${isPatient ? 'La beta ya está abierta: puedes crear tu cuenta y subir tu primer examen hoy mismo.' : 'Te contactaremos pronto para contarte cómo FiMU puede trabajar con tu equipo.'}</p>
${isPatient ? `<p style="margin:24px 0 0;"><a href="${betaUrlFor(email)}" style="display:inline-block;background:#1f9191;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px;">Probar la beta</a></p>` : ''}
<p style="margin:24px 0 0;font-size:12px;color:#8a9899;">¿Dudas? Responde este correo. · <a href="https://fimu.cl" style="color:#1f9191;">fimu.cl</a></p>
</td></tr></table></td></tr></table></body></html>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `waitlist-${email}`,
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Ya estás en la lista de FiMU',
        html,
        tags: [{ name: 'type', value: 'waitlist' }],
      }),
    });
    if (!r.ok) console.error('waitlist: Resend error', r.status, await r.text());
  } catch (err) {
    console.error('waitlist: Resend request failed', err);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { nombre, email, motivo } = parseBody(req.body);

  if (!nombre?.trim() || !email?.trim() || !motivo) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }
  if (!EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'Email inválido' });
  }
  if (!MOTIVOS.includes(motivo)) {
    return res.status(400).json({ error: 'Tipo inválido' });
  }

  const entry = {
    nombre: nombre.trim().slice(0, 120),
    email: email.trim().toLowerCase().slice(0, 254),
    motivo,
  };

  const results = await Promise.allSettled([saveToSupabase(entry), saveToSheet(entry)]);
  for (const r of results) {
    if (r.status === 'rejected') console.error('waitlist: destination failed:', r.reason?.message || r.reason);
  }

  const saved = results.some((r) => r.status === 'fulfilled' && r.value === true);
  const configured = results.some((r) => r.status === 'rejected' || r.value !== null);

  if (!configured) {
    console.error('waitlist: no destination configured (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY or APPS_SCRIPT_URL)');
  }
  if (!saved) {
    return res.status(configured ? 502 : 500).json({ error: 'Error al guardar. Intenta de nuevo.' });
  }

  await sendConfirmation(entry);

  return res.status(200).json({ ok: true, betaUrl: motivo === 'paciente' ? betaUrlFor(entry.email) : null });
}
