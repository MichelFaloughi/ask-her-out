import crypto from 'node:crypto';
import { kv } from '@vercel/kv';
import premium from '../lib/premium.js';

const { PRICES, paymentsEnabled } = premium;

// Web-standard handler (not the Node (req, res) form) so the raw body is
// available via request.text(): Stripe signs the exact bytes it sends.

// Verifies a Stripe-Signature header (t=...,v1=...) against the raw payload.
export function verifySignature(header, payload, secret, toleranceSec = 300) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')));
  const { t, v1 } = parts;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request) {
  if (!paymentsEnabled()) return new Response(null, { status: 404 });

  const raw = await request.text();
  const sig = request.headers.get('stripe-signature');
  if (!verifySignature(sig, raw, process.env.STRIPE_WEBHOOK_SECRET)) {
    return Response.json({ error: 'Bad signature' }, { status: 400 });
  }

  const event = JSON.parse(raw);
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const id = session.metadata?.invite_id;
    const items = (session.metadata?.items || '').split(',').filter(k => PRICES[k]);
    if (session.payment_status === 'paid' && id && items.length) {
      const invite = await kv.get(id);
      if (invite) {
        const entitlements = { ...(invite.premium || {}) };
        items.forEach(k => { entitlements[k] = true; });
        await kv.set(id, { ...invite, premium: entitlements }, { keepTtl: true });
      }
    }
  }
  return Response.json({ received: true });
}
