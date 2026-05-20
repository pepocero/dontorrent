import { handleAnubisChallenge } from '../../lib/extract-handler.js';

export async function onRequestGet(context) {
  const url = new URL(context.request.url).searchParams.get('url');
  return handleAnubisChallenge(url);
}
