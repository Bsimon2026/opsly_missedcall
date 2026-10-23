# Opsly365 Missed-Call Follow-Up

Automatic WhatsApp follow-up for every answered and missed call, with a customer
chatbot and a web dashboard. Part of the Opsly365 business-software portal.

## Parts

| Folder | What | Status |
| --- | --- | --- |
| `server/` | Cloud /chat endpoint, license and payment checks, AI replies | Phase 1 done (sample data) |
| `android/` | Call reporter app (Android) | Phase 2 |
| `desktop/` | Windows app that holds the WhatsApp Web session | Phase 3 |
| `dashboard/` | Web dashboard and admin page | Phase 4 |

Start with `server/README.md`.

## Rules for this repo

- Never commit `.env` or any API key. Keys live only in the server's environment.
