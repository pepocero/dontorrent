import { extractLinksFromPage } from '../../lib/extract-core.js';

const securityHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

export async function onRequestGet(context) {
  const url = new URL(context.request.url).searchParams.get('url');
  const result = await extractLinksFromPage(url);

  if (!result.ok) {
    return new Response(JSON.stringify({ ok: false, error: result.error }), {
      status: result.status,
      headers: securityHeaders,
    });
  }

  return new Response(JSON.stringify({ ok: true, enlaces: result.enlaces }), {
    status: 200,
    headers: securityHeaders,
  });
}
