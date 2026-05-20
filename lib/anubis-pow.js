import { createHash } from 'node:crypto';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const RE_CHALLENGE =
  /<script id="anubis_challenge" type="application\/json">([\s\S]*?)<\/script>/;

export function parsearDesafioAnubis(html) {
  const m = html.match(RE_CHALLENGE);
  if (!m) return null;
  try {
    const data = JSON.parse(m[1]);
    if (!data?.challenge?.randomData || !data?.rules?.difficulty) return null;
    return {
      challenge: data.challenge,
      difficulty: data.rules.difficulty,
      algorithm: data.rules.algorithm || 'fast',
    };
  } catch {
    return null;
  }
}

function sha256Hex(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Validación del servidor Anubis: hash hex con N ceros iniciales.
 * @param {string} randomData
 * @param {number} difficulty
 * @param {AbortSignal | undefined} signal
 */
export function resolverAnubisPow(randomData, difficulty, signal) {
  const target = '0'.repeat(difficulty);
  let nonce = 0;
  for (;;) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const hashHex = sha256Hex(`${randomData}${nonce}`);
    if (hashHex.startsWith(target)) {
      return { nonce, hashHex };
    }
    nonce++;
  }
}

/** @param {Headers} headers */
export function extraerSetCookie(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const raw = headers.get('set-cookie');
  if (!raw) return [];
  return raw.split(/,(?=\s*[^;,=\s]+=)/);
}

export function fusionarCookies(existing, setCookieHeaders) {
  const jar = new Map();
  for (const part of (existing || '').split('; ').filter(Boolean)) {
    const eq = part.indexOf('=');
    if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
  }
  for (const raw of setCookieHeaders) {
    const part = raw.split(';')[0];
    const eq = part.indexOf('=');
    if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

/**
 * Obtiene HTML de una URL pública, resolviendo el desafío Anubis si aparece.
 * @param {string} pageUrl
 * @param {AbortSignal} signal
 */
export async function fetchHtmlConAnubis(pageUrl, signal) {
  const headers = {
    'User-Agent': UA,
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  };

  const res1 = await fetch(pageUrl, { signal, redirect: 'follow', headers });
  if (!res1.ok) {
    return { ok: false, status: res1.status };
  }

  let html = await res1.text();
  const desafio = parsearDesafioAnubis(html);
  if (!desafio) {
    return { ok: true, html, status: res1.status };
  }

  if (desafio.algorithm !== 'fast') {
    return {
      ok: false,
      status: 502,
      error:
        'El sitio usa un desafío anti-bot no soportado. Abre la URL en el navegador y vuelve a intentarlo más tarde.',
    };
  }

  let cookies = fusionarCookies('', extraerSetCookie(res1.headers));
  const powStart = Date.now();
  let nonce;
  let hashHex;
  try {
    ({ nonce, hashHex } = resolverAnubisPow(
      desafio.challenge.randomData,
      desafio.difficulty,
      signal
    ));
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    return {
      ok: false,
      status: 502,
      error: 'No se pudo resolver el desafío anti-bot del sitio.',
    };
  }

  const passUrl = new URL('/.within.website/x/cmd/anubis/api/pass-challenge', pageUrl);
  passUrl.searchParams.set('id', desafio.challenge.id);
  passUrl.searchParams.set('response', hashHex);
  passUrl.searchParams.set('nonce', String(nonce));
  passUrl.searchParams.set('redir', pageUrl);
  passUrl.searchParams.set('elapsedTime', String(Date.now() - powStart));

  const resPass = await fetch(passUrl.href, {
    signal,
    redirect: 'manual',
    headers: { ...headers, Cookie: cookies },
  });

  cookies = fusionarCookies(cookies, extraerSetCookie(resPass.headers));

  if (resPass.status !== 302 && resPass.status !== 303 && resPass.status !== 307) {
    return {
      ok: false,
      status: 502,
      error:
        resPass.status === 500
          ? 'El sitio rechazó el desafío anti-bot. Inténtalo de nuevo.'
          : `El sitio respondió ${resPass.status} al validar el acceso.`,
    };
  }

  let next = resPass.headers.get('location');
  let hops = 0;
  while (next && hops < 8) {
    const r = await fetch(next, {
      signal,
      redirect: 'manual',
      headers: { ...headers, Cookie: cookies },
    });
    cookies = fusionarCookies(cookies, extraerSetCookie(r.headers));
    if (r.status >= 300 && r.status < 400) {
      next = r.headers.get('location');
      hops++;
      continue;
    }
    if (r.ok) {
      html = await r.text();
      const otro = parsearDesafioAnubis(html);
      if (!otro) {
        return { ok: true, html, status: r.status };
      }
      break;
    }
    return { ok: false, status: r.status };
  }

  const resFinal = await fetch(pageUrl, {
    signal,
    redirect: 'follow',
    headers: { ...headers, Cookie: cookies },
  });

  if (!resFinal.ok) {
    return { ok: false, status: resFinal.status };
  }

  html = await resFinal.text();
  if (parsearDesafioAnubis(html)) {
    return {
      ok: false,
      status: 502,
      error:
        'No se pudo acceder al contenido tras el desafío anti-bot. Inténtalo de nuevo.',
    };
  }

  return { ok: true, html, status: resFinal.status };
}

export { UA as ANUBIS_USER_AGENT };
