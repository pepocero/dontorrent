/**
 * Hostnames oficiales: estrenosgo.<TLD> y dontorrent.<TLD>
 * con cualquier extensión de un segmento (.in, .pink, .racing, .org, …).
 * Además, permite proxies/dominios alternativos siempre que sean públicos.
 * Se bloquean hosts locales/privados para evitar SSRF.
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

function esIPv4(host) {
  const partes = host.split('.');
  if (partes.length !== 4) return false;
  return partes.every((parte) => {
    if (!/^\d+$/.test(parte)) return false;
    if (parte.length > 1 && parte.startsWith('0')) return false;
    const n = Number(parte);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

function esIPv6(host) {
  return host.includes(':');
}

function esHostNoPublico(host) {
  if (!host) return true;
  if (host === 'localhost') return true;
  if (host.endsWith('.localhost') || host.endsWith('.local')) return true;

  if (esIPv4(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
    return false;
  }

  if (esIPv6(host)) {
    if (host === '::1') return true;
    if (host.startsWith('fe80:')) return true;
    if (host.startsWith('fc') || host.startsWith('fd')) return true;
    if (host === '::') return true;
    return false;
  }

  return false;
}

export function hostnamePermitidoExtraccion(hostname) {
  if (!hostname || typeof hostname !== 'string') return false;
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  if (esHostNoPublico(host)) return false;
  return true;
}
