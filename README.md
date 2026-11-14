# Chess Test Net

A beautiful, self-contained, anti-cheat protected chess web application.
Play vs a bot or hotseat, with auto-move, Elo ratings, and full settings.

## Features

- **Polished UI** — glassmorphism design, smooth animations, responsive (mobile + desktop)
- **Full chess rules** — castling, en passant, pawn promotion, check/checkmate/stalemate detection
- **Auto-move bot** — four strengths (random, weak, medium, strong) with humanized, randomized move timing
- **Elo rating system** — FIDE-style Elo that goes up/down after every game
- **Anti-cheat / stealth** — move legality validation, timing analysis, accuracy flags, trust score; humanization keeps play looking natural (harder to detect / ban)
- **Settings panel** — board themes, piece sets, time controls, increment, bot strength, anti-cheat thresholds, K-factor
- **Game history & captured pieces** — move list with SAN, captured piece graveyard
- **Clocks** — optional time control with increment, low-time warning glow
- **Export / import** — export game data & settings to JSON
- **Zero dependencies** — vanilla HTML/CSS/JS, no build step, no backend

## Download & run (as a website)

```bash
git clone https://github.com/YOUR_USERNAME/chess.git
cd chess
# open index.html in any browser, or serve it:
python3 -m http.server 8765   # then visit http://localhost:8765
```

That's it. No `npm install`, no build step.

## Install as a browser extension (Chrome / Edge / Brave)

1. Download the ZIP of the `arena/444de9b0-chess` branch, or clone it.
2. Open your browser and go to `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** (toggle in the top-right).
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. The Chess Test Net icon appears in your toolbar — click it to play.

## Extending & re-uploading

This is a plain static repo. To add your own extensions:

1. Clone/download the repo.
2. Edit `index.html`, `style.css`, or any `*.js` module (`chess.js`, `ai.js`, `anti-cheat.js`, `elo.js`, `settings.js`, `ui.js`, `app.js`).
3. Add new files as needed — they're just vanilla JS modules loaded by `<script>` tags.
4. Commit and push, then upload/host wherever you like (GitHub Pages, Vercel, any static host).

Because it's client-side only, there's no server to configure — drop the folder on any static hosting and it works.

## Deploy to Vercel

Connect this repo to Vercel, or run:

```bash
vercel
```

A `vercel.json` is included for static hosting.

## Anti-cheat notes

The anti-cheat validates every move against the engine's legal move list, tracks move timing, and flags suspiciously fast or engine-precise play. The "Humanize" option intentionally injects small mistakes and natural timing variance so play looks human. Settings are persisted to `localStorage` (or `chrome.storage` in extension mode), so your Elo and preferences survive a refresh.

## Project structure

```
index.html      — UI markup
style.css       — styling (themes, glassmorphism, responsive, clock warnings)
manifest.json   — Chrome extension manifest (load unpacked)
chess.js        — chess engine (rules, move gen, checkmate/stalemate)
ai.js           — auto-move bot with strengths + humanization
anti-cheat.js   — move validation, timing/accuracy flags, trust score, stealth delays
elo.js          — Elo rating system
settings.js     — settings manager (localStorage / chrome.storage)
ui.js           — rendering, boards, clocks, modals, toasts
app.js          — main controller wiring everything together
vercel.json     — Vercel static deploy config
```

## License

MIT — use it however you like.
