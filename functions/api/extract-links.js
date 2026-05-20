import { handleExtractLinks } from '../../lib/extract-handler.js';

export async function onRequestGet(context) {
  const params = new URL(context.request.url).searchParams;
  const url = params.get('url');
  const anubis =
    params.get('anubis_id') != null
      ? {
          id: params.get('anubis_id'),
          nonce: params.get('anubis_nonce'),
          response: params.get('anubis_response'),
          elapsedTime: params.get('anubis_elapsed'),
          cookies: params.get('anubis_cookies') ?? '',
        }
      : null;
  return handleExtractLinks(url, anubis);
}

export async function onRequestPost(context) {
  let body = null;
  try {
    body = await context.request.json();
  } catch {
    return handleExtractLinks(null, null);
  }
  return handleExtractLinks(body?.url, body?.anubis ?? null);
}
