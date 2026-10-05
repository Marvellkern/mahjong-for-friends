# Mahjong for Friends

A casual 4-player mahjong for a small group of friends. **Four sets + one pair wins, with no minimum score.**
Play solo against 3 bots in the browser, or create a room and share a link with friends (empty seats become bots).

**Play it: https://mahjong-for-friends.onrender.com** (free hosting: if nobody has played for a while, the first load takes ~30-60 s to wake up).

No accounts, no database, no tracking, no money.

## Quick start

```bash
npm install
npm test            # engine + server tests (Vitest)
npm run dev         # client on http://localhost:5173 (vs-bots mode works with just this)
npm run dev:server  # game server on :3001 (needed for online rooms; Vite proxies /socket.io to it)
```

Production (one Node process serves the client AND the websocket):

```bash
npm run build
npm start           # listens on $PORT (default 3001)
```

Other scripts: `npm run lint`, `npm run typecheck`.

## How to play (the short version)

- Everyone gets 13 tiles; the dealer starts with 14 and discards first.
- On your turn you draw a tile, then discard one. **Tap a tile to lift it, tap it again (or press Discard) to throw it.**
- When someone discards a tile you can use, buttons appear: **Mahjong!**, **Kong**, **Pung**, **Chow** or **Pass** (10 s to decide).
  - *Chow* = 3 in a row in one suit, only from the player on your left (the one right before you).
  - *Pung* = 3 of a kind, *Kong* = 4 of a kind, from anyone.
- Win with **4 sets + 1 pair**, from a discard or your own draw. That's it: no points, no minimum.
- Settings (⚙) has a **"Show tiles I'm waiting for"** hint, sounds, and Leave.

- **Drag tiles left or right to arrange your hand** however you like (only you see the order). **Sort** puts them back in order; each new round starts sorted.

Keyboard: Tab to the hand, ←/→ to move, Enter to select and Enter again to discard, Shift+←/→ to move a tile.

## Rules & defaults

Everything the reference video doesn't specify lives in **one object**, `RULES` in
[packages/engine/src/rules.ts](packages/engine/src/rules.ts). Flip a value there; nothing else hard-codes these.

| Setting | Default | Meaning |
|---|---|---|
| `useBonusTiles` | `false` | 136 tiles, no flowers/seasons. `true` (144 tiles) is **not implemented yet**, so the engine refuses it. **Owner decision.** |
| `chowOnlyFromPrevious` | `true` | Chow only from the player right before you. `false` = chow from anyone. |
| `winOnDiscard` / `winOnSelfDraw` | `true` / `true` | From the video. |
| `claimPriority` | win > pung/kong > chow | Ties go to the player closest in turn order after the discarder. |
| `multipleWinnersPolicy` | `closest_after_discarder` | Only one player wins a contested discard. |
| `dealerRepeatsOnWin` | `false` | Dealer rotates every round. `true` = dealer stays when the dealer wins. |
| `roundEndsWhenWallEmpty` | `true` | Wall runs out → "Wall's empty, nobody wins", next round. (`false` has no defined behaviour, so the engine refuses it.) |
| `deadWall` | `false` | Kong replacements come from the end of the wall. `true` = the last 14 tiles are reserved. |
| `claimWindowMs` | `10000` | Time to claim a discard. |
| `claimMinDelayMs` | `1200` | Minimum pause after every online discard, so timing doesn't reveal who could claim. |
| `turnTimerMs` | `null` | No turn timer. A number = your drawn tile is auto-discarded after that many ms. |
| `fillEmptySeatsWithBots` | `true` | Empty seats become bots when the host starts. |

Other choices made where the brief was silent (not flags, but listed so nothing is hidden):

- **First dealer**: two dice; `(total − 1) mod 4` counting from seat 1. Later rounds follow `dealerRepeatsOnWin`.
- **After claiming a pung or chow** you just discard. You can't declare a self-drawn win or a kong in that same turn, because you didn't draw.
- **Added kong** (pung + 4th tile) is implemented. **Robbing the kong** is not part of this ruleset.
- **Concealed kongs** show their two outer tiles face down; the kind is visible to everyone (common table practice).
- **Seat layout**: the next player in turn order sits on your right, so you chow from your left (like a real table).
- **Local (vs bots) mode** uses a shorter pause after discards (0.45 s), since there's nobody to leak timing to.
- **Bots (v1)** only ever claim a win; otherwise they discard their least useful tile (lone honours first).
- Special hands (seven pairs, thirteen orphans…) are **not** wins.

## Online rooms

- **Create a room** → you get a 4-letter code and a link like `https://your-host/?room=ABCD`. Send it to friends.
- The host can add/remove bots per seat and presses **Start game**. Empty seats are filled with bots.
- Identity is a random token per browser tab, with no accounts. **Reloading, or reopening the link after closing the tab,
  puts you back in your seat with your hand.** A disconnected player's seat shows "disconnected" and the game
  **waits** for them (bots don't take over mid-round). Claim windows still time out after 10 s.
- **Rooms live in server memory.** If the server restarts (deploy, crash, or a free host going to sleep) all rooms
  are lost and players see "That room doesn't exist". Just create a new one. Idle rooms are cleaned up after 30 minutes.

### Play on your Wi-Fi without deploying

```bash
npm run build && npm start
```

Then friends on the same network open `http://<your-computer's-local-IP>:3001` (e.g. `http://192.168.1.20:3001`).
You may need to allow Node through your firewall.

## Deploying

**Deploy target: Render (free tier).** [`render.yaml`](render.yaml) describes the service, so setup is:

1. Push this repo to GitHub (a private repo is fine).
2. On [render.com](https://render.com), sign in with GitHub → **New** → **Blueprint** → pick the repo → **Apply**.
3. Wait for the first build (a few minutes). Your game is at `https://mahjong-for-friends-XXXX.onrender.com`.
4. Every push to `main` redeploys automatically.

Any other host that runs a long-lived Node process with websockets works too. The app is a single service:

- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`
- **Port:** read from `PORT` (hosts set this automatically)
- **Health check:** `GET /healthz`
- **Node:** 20 or newer

Notes for common free tiers:

- **Render** (Web Service): free instances **spin down when idle** and take ~30-60 s to wake. The first visitor waits;
  rooms from before the sleep are gone. The client reconnects automatically once the server is back.
- **Railway / Fly.io**: same commands. Keep a single instance. Rooms are in memory, so multiple instances would not share them.
- Serverless platforms (Vercel functions, Netlify functions) **won't work**: they can't hold websocket connections.

## Project layout

```
packages/
  engine/   pure TS rules engine: tiles, notation, wall (seeded RNG), canWin/waits, claims, reducer, bots, views, autoplay timing
  server/   express + socket.io: rooms.ts (room state + timers), views.ts (what each player may see), app.ts (wiring)
  client/   Vite + React + Tailwind: components/ (Tile, Hand, Table, ActionBar, Lobby, RoundEnd), state/ (useLocalGame, useRemoteGame), strings.ts
```

- The engine is a pure reducer: `applyAction(state, seat, action) → { state, events } | { error }`. It never mutates its input
  and never calls `Math.random` (the RNG state lives in the game state, so games replay from a seed).
- `legalActions(state, seat)` is the single source of truth: the UI renders it and the reducer only accepts actions from it.
- The server only ever sends `buildPlayerView(...)` for **your** seat: other hands are just counts until the round ends.
- All UI text is in [packages/client/src/strings.ts](packages/client/src/strings.ts) (ready for a translation).

## Tests

- **Win detection** (every row of the brief's table, incl. seven pairs = not a win) and waits, plus a < 1 ms performance check.
- **Claims**: chow only from the previous player, suits only, no wrapping; pung beats chow; win beats pung;
  two wins on one discard → closest after the discarder; kongs, added kongs, kong-replacement self-draw, draw rounds.
- **Simulator**: 1,000 bot rounds + 1,000 random-legal-move rounds (to exercise claims and kongs), asserting after every action
  that all 136 tiles are accounted for exactly once, hand sizes are legal, every round ends, and views never leak hidden tiles.
- **Server**: 4 socket clients play a full round with no hidden-tile leaks; malformed/illegal actions are rejected; reconnect
  restores the seat; a reopened tab reclaims only a *disconnected* seat.

## Credits & licences

- Tile faces are drawn in code (SVG). No third-party tile art.
- Sounds are synthesized with the Web Audio API (no audio files). Off by default.
- Fonts from Google Fonts, both under the SIL Open Font License: [Inter](https://fonts.google.com/specimen/Inter) and
  [Noto Serif TC](https://fonts.google.com/noto/specimen/Noto+Serif+TC) (subset to the 8 tile characters only).
- Rules reference: SCMP, "Learn how to play mahjong in 2.5 minutes".
