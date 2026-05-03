/**
 * Hostnames oficiales: estrenosgo.<TLD> y dontorrent.<TLD>
 * con cualquier extensión de un segmento (.in, .pink, .racing, .org, …).
 * Subdominios permitidos (p. ej. www.dontorrent.racing).
 * No coincide con dontorrent.evil.com (TLD de varias etiquetas) ni noestrenosgo.com.
 */
const DNS_LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?';

function patronMarca(nombre) {
  return new RegExp(
    `^(?:${DNS_LABEL}\\.)*${nombre}\\.${DNS_LABEL}$`,
    'i'
  );
}

const RE_ESTRENSOS = patronMarca('estrenosgo');
const RE_DON = patronMarca('dontorrent');

export function hostnamePermitidoExtraccion(hostname) {
  if (!hostname || typeof hostname !== 'string') return false;
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  return RE_ESTRENSOS.test(host) || RE_DON.test(host);
}
