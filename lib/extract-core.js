/**
 * Núcleo compartido: servidor Node local y Cloudflare Pages Functions.
 * SHA-256 vía Web Crypto API (Node 20+ y Workers).
 */
import * as cheerio from 'cheerio';
import { fetchHtmlConAnubis } from './anubis-pow.js';
import { hostnamePermitidoExtraccion } from './host-allowed.js';

export const REQUEST_TIMEOUT_MS = 12000;
export const EXTRACT_PROTECTED_TIMEOUT_MS = 120000;

async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function computeProofOfWork(challenge, difficulty = 3) {
  const target = '0'.repeat(difficulty);
  let nonce = 0;
  for (;;) {
    if ((await sha256Hex(challenge + nonce)).startsWith(target)) return nonce;
    nonce++;
  }
}

export function resolverUrl(href, baseUrl) {
  if (!href || typeof href !== 'string') return null;
  const value = href.trim();
  if (!value) return null;
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return null;
  }
}

export function validarUrlPagina(input) {
  if (typeof input !== 'string') return null;
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (!host || !hostnamePermitidoExtraccion(host)) return null;
  return url.href;
}

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
  const nonce = await computeProofOfWork(genJson.challenge, 3);
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

/**
 * @param {string | null | undefined} queryUrl
 * @returns {Promise<{ ok: true, enlaces: string[] } | { ok: false, error: string, status: number }>}
 */
/**
 * @param {string | null | undefined} queryUrl
 * @param {{ anubis?: { id: string, nonce: number, response: string, elapsedTime: number, cookies: string } } | undefined} options
 */
export async function extractLinksFromPage(queryUrl, options) {
  const pageUrl = validarUrlPagina(queryUrl ?? '');
  if (!pageUrl) {
    return {
      ok: false,
      status: 400,
      error:
        'URL no válida. Usa http/https con un dominio público accesible (incluye proxies y mirrors).',
    };
  }

  let html;
  try {
    const controllerHtml = new AbortController();
    const timeoutHtml = setTimeout(
      () => controllerHtml.abort(),
      REQUEST_TIMEOUT_MS + 60000
    );
    const pagina = await fetchHtmlConAnubis(
      pageUrl,
      controllerHtml.signal,
      options?.anubis ?? null
    );
    clearTimeout(timeoutHtml);

    if (!pagina.ok) {
      return {
        ok: false,
        status: pagina.status || 502,
        needsAnubis: Boolean(pagina.needsAnubis),
        error:
          pagina.error ||
          `La página respondió con código ${pagina.status || 'desconocido'}.`,
      };
    }

    html = pagina.html;
  } catch (err) {
    const mensaje =
      err?.name === 'AbortError'
        ? 'La petición tardó demasiado (incluye el desafío anti-bot del sitio).'
        : 'No se pudo cargar la página.';
    return { ok: false, status: 502, error: mensaje };
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
        return {
          ok: false,
          status: 502,
          error:
            'La extracción con protección tardó demasiado. Prueba de nuevo o con menos episodios visibles.',
        };
      }
      throw err;
    } finally {
      clearTimeout(timeoutPow);
    }
  }

  if (protegidos.length > 0 && enlaces.length === 0) {
    return {
      ok: false,
      status: 502,
      error:
        primerErrorProtegido ||
        'No se pudieron resolver los enlaces protegidos del sitio.',
    };
  }

  return { ok: true, enlaces };
}
