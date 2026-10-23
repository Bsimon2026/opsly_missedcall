# Opsly365 - Phase 1: /chat server and bot test

This is the first piece of the missed-call WhatsApp product: the cloud endpoint that
decides how the bot answers a customer. It runs on sample shop data in
`data/clients.json`. Supabase (the real database) comes in phase 1b.

## What it does

- `POST /chat` takes a license key, customer number and message, and returns the reply.
- Checks the client's payment status first. A suspended client gets nothing.
- Skips numbers on the client's Ignored list (no reply, no AI cost).
- Typing PERSON hands the chat to the owner.
- Monthly chat cap per client, with a fixed fallback reply once it is reached.
- Daily reply limit per customer number, to stop loops and spam.
- Keeps the last 10 messages per customer and sends them to the AI with the shop's info.
- Answers in the customer's language and only from the shop info.
- Works with DeepSeek or Anthropic. The AI key stays in the server's environment. It is never in any app.

## Setup (Node 20.6 or newer)

1. Install Node.js from nodejs.org if you don't have it. Check with `node --version`.
2. In this folder (next to `server.js`), copy `.env.example` to `.env` and put your AI key in it.
   DeepSeek and Anthropic keys are both supported; the server picks the provider from the key name:

       DEEPSEEK_API_KEY=your-key        (DeepSeek, default model deepseek-flash)
       ANTHROPIC_API_KEY=your-key       (Anthropic, default model claude-haiku-5-5)

   Never share this file, and don't paste the key anywhere else.
3. Start the server:

       npm start

4. In a second terminal, run the test:

       npm test

   Part 1 prints PASS/FAIL for the rules. Part 2 prints the bot's answers to seven
   sample customer messages (price, hours, an unknown product, Arabic, Malayalam,
   a prompt-injection attempt, a booking request). Read these and tell me what to change.

To test the plumbing without spending anything or needing a key:

    npm run start:fake     (then npm test in a second terminal)

## Editing the sample shop

Open `data/clients.json`. `shop_info` is everything the bot knows. Replace the sample
text with a real shop's hours, prices and FAQs. There is no model training: the
bot reads this text on every chat.

## Limits of this version

- State (chat counts, history) is in memory and resets when the server restarts.
- No login, no dashboard, no call handling yet.
- Cost control is the chat cap, the 10-message history and the 300-token reply limit.
  Set a monthly spend limit in your AI account as well.

## Next

Phase 1b: move clients, numbers, messages and payments into Supabase.
Phase 2: Android call reporter. Phase 3: Windows desktop app.
