# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Maintenance Rules

1. **Always keep this file up to date.** After any change to the project — adding files, modifying game logic, changing structure — update the relevant sections of this file before ending the conversation. No need for the user to ask.

2. **Always commit and push changes to GitHub.** Whenever files in the repository are modified, or at the end of a session, stage the relevant files, create a descriptive commit, and push to the remote. No need for the user to ask. Exception: confirm before any destructive git operations (force push, reset --hard, etc.).

## Repository Structure

Monorepo — each project lives in its own subfolder. New projects should get their own subfolder.

```
claude-playground/
├── tic-tac-toe/
│   └── index.html
├── shopping-agent/
│   └── index.html
├── hiking-planner/
│   ├── index.html
│   └── worker/
│       ├── worker.js
│       └── wrangler.toml
└── .vscode/settings.json
```

### Project: Tic Tac Toe (`tic-tac-toe/index.html`)
- Two-player (X and O), played in the browser
- Dark-themed UI using CSS Grid for the 3x3 board
- Tracks score across rounds (wins for X, wins for O, draws)
- Highlights the winning cells on victory
- Restart button resets the board without clearing the score

### Project: EU Fashion Deal Finder (`shopping-agent/index.html`)
- Searches Zalando (new), ASOS (new), and Vinted (secondhand) in parallel
- Filters results by size (XS–XXL and EU numeric 36–46)
- Sorts all results by effective price (item price + shipping), ascending
- Converts GBP (ASOS) and PLN (Vinted) to EUR using hardcoded rates
- Shows source badge (Zalando/ASOS/Vinted) and condition badge (New/Used) on each card
- Warning banner displayed if any source fails, rest of results still shown
- API keys configured in the `CONFIG` block at the top of the `<script>` tag:
  - `ZALANDO_CLIENT_ID` — from developers.zalando.com (free, requires approval)
  - `RAPIDAPI_KEY` — from rapidapi.com (free tier: ~100 req/month)
  - Vinted requires no key (unofficial API via allorigins.win CORS proxy)

### Project: Hiking Weather Planner (`hiking-planner/index.html`)
- User enters a city; app fetches tomorrow's weather and AI evaluates hiking suitability
- Three verdict states: **Great weather for hiking** / **So-so** / **Better stay at home**
- Weather data: Open-Meteo API (free, no key) + Nominatim geocoding (free, no key)
- AI evaluation: OpenAI GPT-4o-mini via a Cloudflare Worker proxy
- API key is stored as a Cloudflare secret — never in the frontend code or GitHub
- `CONFIG.WORKER_URL` in `index.html` must be updated to the deployed Worker URL
- Worker deployment: see `hiking-planner/worker/` — uses Wrangler CLI
  - `wrangler secret put OPENAI_API_KEY` — stores the key securely
  - `ALLOWED_ORIGIN` in `wrangler.toml` — whitelist your frontend's URL
  - Cost protection: model locked to `gpt-4o-mini`, `max_tokens` capped at 300

### Running
Open any project's `index.html` directly in a browser — no server or build step needed.
The hiking planner requires the Cloudflare Worker to be deployed first (see above).
