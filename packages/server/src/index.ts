/** Entry point: `npm start` (production) or `npm run dev:server` (dev, port 3001). */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from './app';

const here = path.dirname(fileURLToPath(import.meta.url));
// Works both from src/ (dev, via tsx) and dist/ (production bundle): both sit one level below packages/server.
const clientDir = path.resolve(here, '../../client/dist');
const port = Number(process.env.PORT) || 3001;

const { http } = createServer({ clientDir });
http.listen(port, () => {
  console.log(`Mahjong for Friends listening on http://localhost:${port}`);
});
