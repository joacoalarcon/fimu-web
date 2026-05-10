export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { nombre, email, motivo } = req.body || {};

  if (!nombre?.trim() || !email?.trim() || !motivo) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email)) {
    return res.status(400).json({ error: 'Email inválido' });
  }
  const motivosValidos = ['paciente', 'medico', 'clinica'];
  if (!motivosValidos.includes(motivo)) {
    return res.status(400).json({ error: 'Tipo inválido' });
  }

  const scriptUrl = process.env.APPS_SCRIPT_URL;
  if (!scriptUrl) {
    return res.status(500).json({ error: 'Configuración incompleta' });
  }

  try {
    const r = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nombre.trim(), email: email.trim(), motivo }),
    });
    if (!r.ok) throw new Error('Apps Script error');
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(500).json({ error: 'Error al guardar. Intenta de nuevo.' });
  }
}
