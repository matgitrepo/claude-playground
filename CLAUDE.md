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
├── podcast-generator/
│   ├── index.html
│   └── worker/
│       ├── worker.js
│       └── wrangler.toml
├── market-intel/
│   ├── index.html
│   └── worker/
│       ├── worker.js
│       ├── schema.sql
│       └── wrangler.toml
├── scrum-agents/
│   ├── index.html
│   └── worker/
│       ├── worker.js
│       └── wrangler.toml
├── pm-interview-coach/
│   ├── index.html
│   └── worker/
│       ├── worker.js
│       └── wrangler.toml
├── assumption-mapper/
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
- User enters a city; toggle between **Tomorrow** or **This Weekend** (Sat + Sun side-by-side)
- Three verdict states per day: **Great weather for hiking** / **So-so** / **Better stay at home**
- Nearby hiking trails fetched from Overpass API (background, non-blocking)
- Weather data: Open-Meteo API (free, no key) + Nominatim geocoding (free, no key)
- AI evaluation: OpenAI GPT-4o-mini via a Cloudflare Worker proxy
- API key is stored as a Cloudflare secret — never in the frontend code or GitHub
- Live on GitHub Pages: `https://matgitrepo.github.io/claude-playground/hiking-planner/`
- `CONFIG.WORKER_URL` in `index.html` points to the deployed Cloudflare Worker
- Worker deployment: see `hiking-planner/worker/` — uses Wrangler CLI
  - `wrangler secret put OPENAI_API_KEY` — stores the key securely
  - `ALLOWED_ORIGIN` in `wrangler.toml` — locked to `https://matgitrepo.github.io`
  - Cost protection: model locked to `gpt-4o-mini`, `max_tokens` capped at 300

### Project: Podcast Generator (`podcast-generator/index.html`)
- User enters a topic; app generates a voiced podcast as a downloadable WAV file
- Flow: AI writes dialog → ElevenLabs TTS per segment → browser stitches to WAV
- Two speakers (Host A / Host B) with distinct ElevenLabs voices
- Script viewer (collapsible) shown after generation
- Worker proxies both OpenAI (dialog) and ElevenLabs (TTS) to keep keys secure
- `CONFIG.WORKER_URL` in `index.html` must be updated to the deployed Worker URL
- Worker deployment: see `podcast-generator/worker/` — uses Wrangler CLI
  - `wrangler secret put OPENAI_API_KEY`
  - `wrangler secret put ELEVENLABS_API_KEY`
  - Voice IDs configurable via `VOICE_A` / `VOICE_B` vars in `wrangler.toml`
  - ElevenLabs free tier: ~10,000 chars/month (~3 full podcasts)
- Output: WAV file (browser-generated, never stored server-side)
- Ctrl+Enter submits the topic

### Project: Market Intel (`market-intel/index.html`)
- Shows top 5 trending skills in London product jobs (PM/PO/Head of Product)
- Data source: SerpAPI Google Jobs (free tier: 100 searches/month)
- GitHub Action (`market-intel-collect.yml`) runs daily at 02:00 UTC, calls SerpAPI, stores skill counts in Cloudflare D1
- Skill extraction: keyword matching with word boundaries against curated PM skills list in `scraper/collect.js`
- Trends = last 30 days vs previous 30 days; shows top skills by count until 30 days of data
- `CONFIG.WORKER_URL` in `index.html` — points to deployed Cloudflare Worker
- Worker deployed at: `https://market-intel-worker.claude-playground.workers.dev`
- Worker deployment: see `market-intel/worker/` — uses Wrangler CLI
  - `wrangler d1 create market-intel` — create the D1 database
  - `wrangler d1 execute market-intel --file=schema.sql --remote` — run migrations
  - `wrangler secret put COLLECT_SECRET` — secret for `/collect` endpoint
  - `ALLOWED_ORIGIN` in `wrangler.toml` — currently `"null"` (local only)
- GitHub Actions secrets required: `SERPAPI_KEY`, `MARKET_INTEL_WORKER_URL`, `MARKET_INTEL_COLLECT_SECRET`

### Project: Scrum Agents (`scrum-agents/index.html`)
- User describes a software feature; three Claude agents (BA, Dev, QA) discuss it in structured rounds
- BA writes user stories + acceptance criteria → Dev challenges technically → QA finds gaps and test cases
- User can interject between any rounds via an optional text input
- After any round, "Generate Plan" produces a structured markdown Plan of Action (Scrum Master role)
- Agents cycle (BA → Dev → QA → BA …) if the user continues past the first three turns
- Worker proxies Claude API calls with streaming (SSE forwarded directly, no buffering)
- Model: `claude-sonnet-4-6` — all four roles (ba, dev, qa, summary) use the same endpoint `/chat`
- `CONFIG.WORKER_URL` in `index.html` — points to deployed Cloudflare Worker
- Worker deployed at: `https://scrum-agents-worker.claude-playground.workers.dev`
- Worker deployment: see `scrum-agents/worker/` — uses Wrangler CLI
  - `wrangler secret put ANTHROPIC_API_KEY` — stores the key securely
  - `ALLOWED_ORIGIN` in `wrangler.toml` — currently `"null"` (local only)
  - Rate limiting: 100 requests/day via shared `RATE_LIMIT` KV namespace (ID: `e60c23241f63496093286049ef0896de`)
- Ctrl+Enter starts the sprint

### Project: PM Interview Coach (`pm-interview-coach/index.html`)
- User picks an interview type (Product Sense, Prioritization, Estimation); Claude plays senior PM interviewer
- 3-round structure: opening question → 2 follow-ups → structured feedback (What Landed / What Was Weak / What a Strong Answer Includes)
- Claude responses stream via SSE; full message history sent each turn for context
- Model: `claude-sonnet-4-6` — single `/chat` endpoint, `phase` param controls prompt (question / followup / feedback)
- `CONFIG.WORKER_URL` in `index.html` — points to deployed Cloudflare Worker
- Worker deployment: see `pm-interview-coach/worker/` — uses Wrangler CLI
  - `wrangler secret put ANTHROPIC_API_KEY` — stores the key securely
  - `ALLOWED_ORIGIN` in `wrangler.toml` — currently `"null"` (local only)
- Ctrl+Enter submits answers

### Project: Assumption Mapper (`assumption-mapper/index.html`)
- User describes a feature idea; Claude identifies 6–10 assumptions across Desirability / Feasibility / Viability
- Each assumption has: statement, category, confidence (1–5), impact if wrong (1–5), suggested lean experiment
- Visualizes assumptions as dots on a CSS-based 2x2 grid (x=confidence, y=impact); top-left quadrant ("Validate First") tinted red
- Below the grid: assumption cards grouped by category, color-coded (blue/amber/rose); clicking dot↔card cross-highlights
- Model: `claude-sonnet-4-6` — single `/analyze` endpoint, returns JSON (non-streaming)
- `CONFIG.WORKER_URL` in `index.html` — points to deployed Cloudflare Worker
- Worker deployment: see `assumption-mapper/worker/` — uses Wrangler CLI
  - `wrangler secret put ANTHROPIC_API_KEY` — stores the key securely
  - `ALLOWED_ORIGIN` in `wrangler.toml` — currently `"null"` (local only)
- Ctrl+Enter submits the feature idea

### Running
Open any project's `index.html` directly in a browser — no server or build step needed.
The hiking planner, podcast generator, market intel, scrum-agents, pm-interview-coach, and assumption-mapper apps require their Cloudflare Workers to be deployed first.
