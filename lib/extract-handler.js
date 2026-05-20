import { extractLinksFromPage, validarUrlPagina } from './extract-core.js';
import { obtenerDesafioAnubis } from './anubis-pow.js';

function errorUrlInvalida() {
  return jsonResponse(
    {
      ok: false,
      error:
        'URL no válida. Usa http/https con un dominio público accesible (incluye proxies y mirrors).',
    },
    400
  );
}

const securityHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: securityHeaders });
}

function normalizarAnubis(body) {
  if (!body || typeof body !== 'object') return null;
  const a = body.anubis;
  if (!a || typeof a !== 'object') return null;
  const nonce = Number(a.nonce);
  if (!a.id || !Number.isFinite(nonce) || !a.response) return null;
  return {
    id: String(a.id),
    nonce,
    response: String(a.response),
    elapsedTime: Number(a.elapsedTime) || 0,
    cookies: typeof a.cookies === 'string' ? a.cookies : '',
  };
}

export async function handleAnubisChallenge(url) {
  const pageUrl = validarUrlPagina(url ?? '');
  if (!pageUrl) return errorUrlInvalida();

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);
    const result = await obtenerDesafioAnubis(pageUrl, controller.signal);
    clearTimeout(t);
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, result.status || 502);
    }
    return jsonResponse(result);
  } catch (err) {
    const error =
      err?.name === 'AbortError'
        ? 'La petición tardó demasiado.'
        : 'No se pudo comprobar el acceso al sitio.';
    return jsonResponse({ ok: false, error }, 502);
  }
}

export async function handleExtractLinks(url, anubisBody) {
  const pageUrl = validarUrlPagina(url ?? '');
  if (!pageUrl) return errorUrlInvalida();

  try {
    const anubis = normalizarAnubis(anubisBody ? { anubis: anubisBody } : null);
    const result = await extractLinksFromPage(
      pageUrl,
      anubis ? { anubis } : undefined
    );
    if (!result.ok) {
      const body = { ok: false, error: result.error };
      if (result.needsAnubis) body.needsAnubis = true;
      return jsonResponse(body, result.status);
    }
    return jsonResponse({ ok: true, enlaces: result.enlaces });
  } catch {
    return jsonResponse(
      { ok: false, error: 'Error interno al procesar la página.' },
      500
    );
  }
}

export function extractLinksExpress(req, res) {
  const url = req.query?.url ?? req.body?.url;
  const anubis =
    req.body?.anubis ??
    (req.query?.anubis_id
      ? {
          id: req.query.anubis_id,
          nonce: req.query.anubis_nonce,
          response: req.query.anubis_response,
          elapsedTime: req.query.anubis_elapsed,
          cookies: req.query.anubis_cookies,
        }
      : null);

  handleExtractLinks(url, anubis).then(async (response) => {
    const data = await response.json();
    res.status(response.status).json(data);
  });
}

export function anubisChallengeExpress(req, res) {
  handleAnubisChallenge(req.query?.url).then(async (response) => {
    const data = await response.json();
    res.status(response.status).json(data);
  });
}

export { securityHeaders };
