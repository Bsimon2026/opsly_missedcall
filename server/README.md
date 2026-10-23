# Opsly365 - server (/chat endpoint and database)

The cloud part of the missed-call WhatsApp product: it decides how the bot answers a
customer, keeps every client's data in Supabase, and enforces licence and payment status.

## What it does

- `POST /chat` takes a license key, customer number and message, and returns the reply.
- Checks the client's payment status first. A suspended client gets nothing.
- Skips Ignored numbers (no reply, no AI cost). A number it has not seen becomes a Customer.
- Typing PERSON hands the chat to the owner. A paused chat stays quiet until the pause ends.
- Monthly chat cap per client with a fixed fallback reply, and a daily limit per customer number.
- Keeps the last 10 messages per customer and sends them to the AI with the shop's info.
- Works with DeepSeek or Anthropic. AI and database keys stay in the server's environment.

## Setup (Node 20.6 or newer)

1. **Database.** In Supabase: SQL Editor, New query, paste all of `db/schema.sql`, Run.
   It is safe to run again. It also creates three TEST clients (delete them before real clients).
2. **Keys.** Copy `.env.example` to `.env` next to `server.js` and fill in:
   - one AI key (`DEEPSEEK_API_KEY` or `ANTHROPIC_API_KEY`)
   - `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (the *secret* key, never the publishable one)
3. **Check the database:** `npm run check-db` should end with "Database is ready."
4. **Start:** `npm start`. The startup line shows the AI provider and `supabase store`.
5. **Test** in a second terminal: `npm test`. Part 1 prints PASS/FAIL for the rules;
   Part 2 prints the bot's replies to seven sample messages.

Without Supabase keys the server falls back to `data/clients.json` and memory (resets on restart).
To test the plumbing without any AI key: set `FAKE_AI=1` (PowerShell: `$env:FAKE_AI=1; node server.js`).

## Security model

Every table has Row Level Security on and no policies, and the public and logged-in roles
have no access. Only the server, using the secret key, can read or write. The Android app,
the desktop app and the dashboard never talk to the database directly.

## Next

Phase 2: Android call reporter (POST /calls). Phase 3: Windows desktop app and /outbox.
Phase 4: dashboard and admin page.
