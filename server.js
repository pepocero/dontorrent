import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { extractLinksFromPage } from './lib/extract-core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use((_, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

app.use(express.static(join(__dirname, 'public')));

app.get('/favicon.ico', (_, res) => {
  res.redirect(302, '/favicon.svg');
});

app.get('/api/extract-links', async (req, res) => {
  const result = await extractLinksFromPage(req.query.url);
  if (!result.ok) {
    return res.status(result.status).json({ ok: false, error: result.error });
  }
  return res.json({ ok: true, enlaces: result.enlaces });
});

app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
});
