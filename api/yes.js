const { kv } = require('@vercel/kv');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { id, noCount, hesitationMs } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  const invite = await kv.get(id);
  if (!invite) return res.status(200).json({ ok: true });

  // Record the first "yes" only; later refreshes don't overwrite it
  if (!invite.result) {
    const result = { at: Date.now(), noCount: Number(noCount) || 0 };
    if (Number.isFinite(hesitationMs)) result.hesitationMs = Math.round(hesitationMs);
    await kv.set(id, { ...invite, result }, { keepTtl: true });
  }

  if (!invite.email) return res.status(200).json({ ok: true });

  const hesitation = Number.isFinite(hesitationMs)
    ? `<p style="color:#666">She took <strong>${(hesitationMs / 1000).toFixed(1)}s</strong> to answer.</p>`
    : '';
  const dodgeMsg = noCount > 0
    ? `It took her <strong>${noCount}</strong> ${noCount === 1 ? 'attempt' : 'attempts'} to catch the "No" button before she gave in 😄`
    : 'She clicked Yes right away — no hesitation! 🎉';

  await resend.emails.send({
    // from: 'onboarding@resend.dev',
    from: 'noreply@ask-her-out.com',
    to: invite.email,
    subject: `${invite.n} said yes! 💖`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;text-align:center">
        <h1 style="color:#ff4d6d">She said yes! 💖</h1>
        <p style="font-size:18px"><strong>${invite.n}</strong> accepted your invite!</p>
        <p style="color:#666">${dodgeMsg}</p>
        ${hesitation}
        ${invite.d ? `<p style="color:#888">Date: ${invite.d}${invite.t ? ' at ' + invite.t : ''}</p>` : ''}
        ${invite.p ? `<p style="color:#888">Place: ${invite.p}</p>` : ''}
      </div>
    `,
  });

  return res.status(200).json({ ok: true });
};
