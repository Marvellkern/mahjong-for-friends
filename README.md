# Mahjong for Friends

A casual 4-player mahjong for a small group of friends. **Four sets + one pair wins, with no minimum score.**

> Status: work in progress (built in phases, see the project brief).

## Packages

| Package | What |
|---|---|
| `packages/engine` | Pure TypeScript rules engine. Zero dependencies, no I/O, seeded RNG. |
| `packages/server` | Node + Socket.IO. Serves the built client and runs the rooms. |
| `packages/client` | Vite + React + Tailwind UI. |

## Commands

```bash
npm install
npm test          # Vitest, all packages
npm run lint
npm run typecheck
```
