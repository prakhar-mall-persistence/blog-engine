// Email notifications for the approval gate. Pluggable, zero-dependency:
//   RESEND_API_KEY                  → Resend HTTP API (simplest to set up)
//   MAILER_URL (+ MAILER_TOKEN)     → POST to your own service (e.g. go-mailer)
// Falls back to dry-run (prints the email) when neither is configured.
// Recipient comes from EMAIL_TO.

function html(post, prUrl) {
  const take = (post.keyTakeaways || []).map((t) => `<li style="margin:6px 0">${t}</li>`).join('');
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#0a0a0a">
    <p style="font:600 12px/1 ui-monospace;letter-spacing:.1em;color:#5925DC;text-transform:uppercase">Matrix · blog engine</p>
    <h1 style="font-weight:300;font-size:26px;letter-spacing:-.02em">${post.title}</h1>
    <p style="color:#565560;font-size:15px">${post.description}</p>
    <p style="font-size:13px;color:#8a8a94">${post.category} · ${post.tag} · ${post.readTime} · slug <code>${post.slug}</code></p>
    ${take ? `<p style="font:600 12px/1 ui-monospace;letter-spacing:.08em;color:#5925DC;text-transform:uppercase">Key takeaways</p><ul style="font-size:14px;color:#241f30">${take}</ul>` : ''}
    <p style="margin-top:22px"><a href="${prUrl}" style="background:#5925DC;color:#fff;padding:11px 20px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px">Review &amp; merge the PR →</a></p>
    <p style="font-size:12px;color:#8a8a94;margin-top:18px">Merging deploys it to persistence.dev/resources/blog/${post.slug}/</p>
  </div>`;
}

export async function emailApproval(post, { prUrl, mode = 'auto', log = console.log } = {}) {
  const to = process.env.EMAIL_TO;
  const subject = `📝 Blog draft ready: ${post.title}`;
  const body = html(post, prUrl);

  const hasResend = !!process.env.RESEND_API_KEY;
  const hasMailer = !!process.env.MAILER_URL;
  if (mode === 'dry' || (!hasResend && !hasMailer)) {
    log(`✉️  [dry] Email to ${to || '(set EMAIL_TO)'} — subject: "${subject}"`);
    log('    No email provider configured (set RESEND_API_KEY or MAILER_URL to actually send).');
    return { mode: 'dry', to, subject };
  }
  if (!to) throw new Error('EMAIL_TO not set');

  if (hasResend) {
    const send = (from) => fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html: body }),
    }).then((r) => r.json());
    let r = await send(process.env.EMAIL_FROM || 'Matrix <blog@persistence.dev>');
    // Until persistence.dev is verified in Resend, fall back to the test sender.
    if (!r.id && /not verified/i.test(r.message || '')) {
      log('    ⚠ EMAIL_FROM domain not verified in Resend — using onboarding@resend.dev. Verify the domain to send from @persistence.dev.');
      r = await send('Matrix <onboarding@resend.dev>');
    }
    if (r.id) { log(`✉️  Emailed ${to} via Resend (${r.id})`); return { mode: 'resend', id: r.id }; }
    throw new Error(`resend: ${JSON.stringify(r)}`);
  }
  // Generic mailer service (e.g. go-mailer)
  const res = await fetch(process.env.MAILER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(process.env.MAILER_TOKEN ? { Authorization: `Bearer ${process.env.MAILER_TOKEN}` } : {}) },
    body: JSON.stringify({ to, subject, html: body }),
  });
  if (!res.ok) throw new Error(`mailer ${res.status}: ${(await res.text()).slice(0, 160)}`);
  log(`✉️  Emailed ${to} via MAILER_URL`);
  return { mode: 'mailer' };
}
