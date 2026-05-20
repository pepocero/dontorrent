export const ANUBIS_UA =
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

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * PoW Anubis (hex con N ceros iniciales). Pensado para ejecutarse en el navegador.
 */
export async function resolverAnubisPowAsync(randomData, difficulty, signal) {
  const target = '0'.repeat(difficulty);
  let nonce = 0;
  for (;;) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const hashHex = await sha256Hex(`${randomData}${nonce}`);
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

export const ANUBIS_HEADERS = {
  'User-Agent': ANUBIS_UA,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
};
