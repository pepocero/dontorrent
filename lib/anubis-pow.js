import {
  ANUBIS_HEADERS,
  extraerSetCookie,
  fusionarCookies,
  parsearDesafioAnubis,
} from './anubis-shared.js';

/**
 * Obtiene datos del desafío Anubis (sin resolver PoW; apto para Cloudflare Workers).
 */
export async function obtenerDesafioAnubis(pageUrl, signal) {
  const res1 = await fetch(pageUrl, {
    signal,
    redirect: 'follow',
    headers: ANUBIS_HEADERS,
  });

  if (!res1.ok) {
    return {
      ok: false,
      status: res1.status,
      error: `La página respondió con código ${res1.status}.`,
    };
  }

  const html = await res1.text();
  const desafio = parsearDesafioAnubis(html);
  if (!desafio) {
    return { ok: true, needsAnubis: false };
  }

  if (desafio.algorithm !== 'fast') {
    return {
      ok: false,
      status: 502,
      error:
        'El sitio usa un desafío anti-bot no soportado. Ábrelo en el navegador e inténtalo más tarde.',
    };
  }

  const cookies = fusionarCookies('', extraerSetCookie(res1.headers));
  return {
    ok: true,
    needsAnubis: true,
    challengeId: desafio.challenge.id,
    randomData: desafio.challenge.randomData,
    difficulty: desafio.difficulty,
    algorithm: desafio.algorithm,
    cookies,
  };
}

/**
 * @param {string} pageUrl
 * @param {AbortSignal} signal
 * @param {{ id: string, nonce: number, response: string, elapsedTime: number, cookies: string }} solucionAnubis
 */
async function aplicarSolucionAnubis(pageUrl, signal, solucionAnubis) {
  let cookies =
    typeof solucionAnubis.cookies === 'string' ? solucionAnubis.cookies : '';

  const passUrl = new URL('/.within.website/x/cmd/anubis/api/pass-challenge', pageUrl);
  passUrl.searchParams.set('id', solucionAnubis.id);
  passUrl.searchParams.set('response', solucionAnubis.response);
  passUrl.searchParams.set('nonce', String(solucionAnubis.nonce));
  passUrl.searchParams.set('redir', pageUrl);
  passUrl.searchParams.set(
    'elapsedTime',
    String(solucionAnubis.elapsedTime ?? 0)
  );

  const resPass = await fetch(passUrl.href, {
    signal,
    redirect: 'manual',
    headers: { ...ANUBIS_HEADERS, Cookie: cookies },
  });

  cookies = fusionarCookies(cookies, extraerSetCookie(resPass.headers));

  if (resPass.status !== 302 && resPass.status !== 303 && resPass.status !== 307) {
    return {
      ok: false,
      status: 502,
      error:
        resPass.status === 500
          ? 'El sitio rechazó la verificación anti-bot. Inténtalo de nuevo.'
          : `El sitio respondió ${resPass.status} al validar el acceso.`,
    };
  }

  let next = resPass.headers.get('location');
  let hops = 0;
  while (next && hops < 8) {
    const r = await fetch(next, {
      signal,
      redirect: 'manual',
      headers: { ...ANUBIS_HEADERS, Cookie: cookies },
    });
    cookies = fusionarCookies(cookies, extraerSetCookie(r.headers));
    if (r.status >= 300 && r.status < 400) {
      next = r.headers.get('location');
      hops++;
      continue;
    }
    if (r.ok) {
      const html = await r.text();
      if (!parsearDesafioAnubis(html)) {
        return { ok: true, html, status: r.status };
      }
      break;
    }
    return { ok: false, status: r.status };
  }

  const resFinal = await fetch(pageUrl, {
    signal,
    redirect: 'follow',
    headers: { ...ANUBIS_HEADERS, Cookie: cookies },
  });

  if (!resFinal.ok) {
    return { ok: false, status: resFinal.status };
  }

  const html = await resFinal.text();
  if (parsearDesafioAnubis(html)) {
    return {
      ok: false,
      status: 502,
      error:
        'No se pudo acceder al contenido tras la verificación anti-bot. Inténtalo de nuevo.',
    };
  }

  return { ok: true, html, status: resFinal.status };
}

/**
 * @param {string} pageUrl
 * @param {AbortSignal} signal
 * @param {{ id: string, nonce: number, response: string, elapsedTime: number, cookies: string } | null | undefined} solucionAnubis
 */
export async function fetchHtmlConAnubis(pageUrl, signal, solucionAnubis) {
  if (
    solucionAnubis?.id &&
    solucionAnubis.nonce != null &&
    solucionAnubis.response
  ) {
    return aplicarSolucionAnubis(pageUrl, signal, solucionAnubis);
  }

  const res1 = await fetch(pageUrl, {
    signal,
    redirect: 'follow',
    headers: ANUBIS_HEADERS,
  });

  if (!res1.ok) {
    return { ok: false, status: res1.status };
  }

  const html = await res1.text();
  const desafio = parsearDesafioAnubis(html);
  if (!desafio) {
    return { ok: true, html, status: res1.status };
  }

  if (desafio.algorithm !== 'fast') {
    return {
      ok: false,
      status: 502,
      error:
        'El sitio usa un desafío anti-bot no soportado. Ábrelo en el navegador e inténtalo más tarde.',
    };
  }

  return {
    ok: false,
    status: 422,
    needsAnubis: true,
    error:
      'El sitio requiere verificación anti-bot. Vuelve a buscar (se resolverá en tu navegador).',
  };
}
