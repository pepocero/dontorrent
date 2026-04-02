import express from 'express';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
  res.type('image/svg+xml');
  res.sendFile(join(__dirname, 'public', 'favicon.svg'));
});

const ALLOWED_HOST_SUFFIXES = ['estrenosgo.in', 'dontorrent.pink'];
/** Carga HTML inicial */
const REQUEST_TIMEOUT_MS = 12000;
/** PoW + varias llamadas por episodio (DonTorrent protegido) */
const EXTRACT_PROTECTED_TIMEOUT_MS = 120000;

function sha256Hex(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function computeProofOfWork(challenge, difficulty = 3) {
  const target = '0'.repeat(difficulty);
  let nonce = 0;
  for (;;) {
    if (sha256Hex(challenge + nonce).startsWith(target)) return nonce;
    nonce++;
  }
}

/**
 * Resuelve la URL real del .torrent vía /api_validate_pow.php (misma lógica que don_download.js).
 */
async function resolverDescargaProtegida(pageOrigin, contentId, tabla, signal) {
  const apiUrl = new URL('/api_validate_pow.php', pageOrigin).href;
  const genRes = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'generate',
      content_id: parseInt(contentId, 10),
      tabla,
    }),
    signal,
  });
  const genJson = await genRes.json();
  if (!genRes.ok || !genJson.success) {
    throw new Error(genJson.error || 'Error al generar el desafío de descarga.');
  }
  const nonce = computeProofOfWork(genJson.challenge, 3);
  const valRes = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'validate',
      challenge: genJson.challenge,
      nonce,
    }),
    signal,
  });
  const valJson = await valRes.json();
  if (valRes.status === 429 || valJson.status === 'limit_exceeded') {
    throw new Error(
      'Límite de descargas en el sitio; espera unos minutos e inténtalo de nuevo.'
    );
  }
  if (valJson.status === 'captcha_required') {
    throw new Error(
      'El sitio ha pedido captcha; abre la página en el navegador para descargar.'
    );
  }
  if (!valRes.ok || !valJson.success) {
    throw new Error(valJson.error || 'Error al validar la descarga.');
  }
  const raw = valJson.download_url;
  if (!raw || typeof raw !== 'string') return null;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return resolverUrl(raw, pageOrigin);
}

function validarUrl(input) {
  if (typeof input !== 'string') return null;
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (!host) return null;
  const permitido = ALLOWED_HOST_SUFFIXES.some((suffix) =>
    host.endsWith(suffix)
  );
  if (!permitido) return null;
  return url.href;
}

function resolverUrl(href, baseUrl) {
  if (!href || typeof href !== 'string') return null;
  const value = href.trim();
  if (!value) return null;
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return null;
  }
}

app.get('/api/extract-links', async (req, res) => {
  const pageUrl = validarUrl(req.query.url);
  if (!pageUrl) {
    return res.status(400).json({
      ok: false,
      error:
        'URL no válida. Debe ser de estrenosgo.in o dontorrent.pink y usar http/https.',
    });
  }

  let html;
  try {
    const controllerHtml = new AbortController();
    const timeoutHtml = setTimeout(
      () => controllerHtml.abort(),
      REQUEST_TIMEOUT_MS
    );
    const response = await fetch(pageUrl, {
      signal: controllerHtml.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
    });
    clearTimeout(timeoutHtml);

    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        error: `La página respondió con código ${response.status}.`,
      });
    }

    html = await response.text();
  } catch (err) {
    const mensaje =
      err?.name === 'AbortError'
        ? 'La petición tardó demasiado.'
        : 'No se pudo cargar la página.';
    return res.status(502).json({ ok: false, error: mensaje });
  }

  const $ = cheerio.load(html);
  const enlaces = [];
  const vistos = new Set();

  const pageOrigin = new URL(pageUrl).origin;

  const selector =
    'a.text-white.bg-primary.rounded-pill.d-block.shadow-sm.text-decoration-none.my-1.py-1[download][target="_blank"]';

  $(selector).each((_, el) => {
    const $el = $(el);
    const texto = $el.text().trim();
    if (texto !== 'Descargar') return;

    const href = $el.attr('href');
    const absoluta = resolverUrl(href, pageUrl);
    if (absoluta && !vistos.has(absoluta)) {
      vistos.add(absoluta);
      enlaces.push(absoluta);
    }
  });

  const protegidos = $('a.protected-download[data-content-id][data-tabla]')
    .toArray()
    .map((el) => $(el))
    .filter(($el) => $el.text().trim() === 'Descargar');

  let primerErrorProtegido = null;

  if (protegidos.length > 0) {
    const controllerPow = new AbortController();
    const timeoutPow = setTimeout(
      () => controllerPow.abort(),
      EXTRACT_PROTECTED_TIMEOUT_MS
    );
    try {
      for (const $btn of protegidos) {
        const contentId = $btn.attr('data-content-id');
        const tabla = $btn.attr('data-tabla');
        if (!contentId || !tabla) continue;
        try {
          const absoluta = await resolverDescargaProtegida(
            pageOrigin,
            contentId,
            tabla,
            controllerPow.signal
          );
          if (absoluta && !vistos.has(absoluta)) {
            vistos.add(absoluta);
            enlaces.push(absoluta);
          }
        } catch (e) {
          if (!primerErrorProtegido && e && typeof e.message === 'string') {
            primerErrorProtegido = e.message;
          }
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        clearTimeout(timeoutPow);
        return res.status(502).json({
          ok: false,
          error:
            'La extracción con protección tardó demasiado. Prueba de nuevo o con menos episodios visibles.',
        });
      }
      throw err;
    } finally {
      clearTimeout(timeoutPow);
    }
  }

  if (protegidos.length > 0 && enlaces.length === 0) {
    return res.status(502).json({
      ok: false,
      error:
        primerErrorProtegido ||
        'No se pudieron resolver los enlaces protegidos del sitio.',
    });
  }

  return res.json({ ok: true, enlaces });
});

app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
});
