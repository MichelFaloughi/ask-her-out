# TODO

Running list of follow-ups. Tick items off or delete them when done.

## Before shipping the redesign
- [ ] Deploy production: `vercel deploy --prod` (must be run by Michel, the agent can't)
- [ ] Check the preview on a real phone: https://ask-her-out-preview.vercel.app
- [ ] Create the `hello@ask-her-out.com` inbox (footer, Privacy and Terms link to it), or change the address in index.html, privacy.html, terms.html

## Security housekeeping
- [ ] Regenerate the Vercel "Protection Bypass for Automation" secret (it appeared in a shared screenshot), then update the Stripe sandbox webhook URL with the new value
- [ ] Move the Google Maps key in index.html to an env var like the server already does

## Going live with payments (when there is traffic)
- [ ] Stripe live mode: add `STRIPE_SECRET_KEY` (live) to the Production environment
- [ ] Create a live-mode webhook for `checkout.session.completed` at `https://ask-her-out.com/api/stripe-webhook`, add its `STRIPE_WEBHOOK_SECRET` to Production
- [ ] Set `PAYMENTS_ENABLED=true` in Production and redeploy
- [ ] Fill in the Stripe account details Stripe requires for live payouts (business info, bank)

## Growth and product ideas
- [ ] Sample invite on the homepage ("see an example") so visitors can try the No button
- [ ] OG image for the homepage so shared links get a preview card
- [ ] Simple metric: invites created per week (a counter in KV or Vercel Analytics)
- [ ] Creator-facing results page or richer "she said yes" email with the stats card
- [ ] Edit an invite after creating it
- [ ] Second domain askherout.app (parked for now)

## Dev notes
- After each preview deploy, re-point the alias: `vercel alias set <deploy-url> ask-her-out-preview.vercel.app` (the Stripe sandbox webhook points at it)
- Local end-to-end tests live in the agent scratchpad (`test.mjs` with a fake Redis); consider moving them into the repo under `test/`
