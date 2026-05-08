const inputUrl = document.getElementById('url');
const btnBuscar = document.getElementById('buscar');
const btnCopiar = document.getElementById('copiar');
const btnNuevosEnlaces = document.getElementById('nuevos-enlaces');
const btnZoom = document.getElementById('restablecer-zoom');
const lista = document.getElementById('lista');
const estado = document.getElementById('estado');
const toast = document.getElementById('toast');

let enlacesActuales = [];

function setEstado(texto) {
  estado.textContent = texto;
}

function mostrarToast(texto) {
  if (!toast) return;
  toast.textContent = texto;
  toast.classList.add('mostrar');
  clearTimeout(mostrarToast._timer);
  mostrarToast._timer = setTimeout(() => {
    toast.classList.remove('mostrar');
  }, 2200);
}

function limpiarLista() {
  lista.innerHTML = '';
  enlacesActuales = [];
  btnCopiar.disabled = true;
}

function renderLista(enlaces) {
  lista.innerHTML = '';
  enlaces.forEach((url) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = url;
    li.appendChild(a);
    lista.appendChild(li);
  });
}

/** Debe coincidir con lib/host-allowed.js */
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

function hostnamePermitidoExtraccion(host) {
  if (!host || typeof host !== 'string') return false;
  const h = host.trim().toLowerCase();
  if (!h) return false;
  return !esHostNoPublico(h);
}

function validarUrlCliente(valor) {
  try {
    const url = new URL(valor);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    return hostnamePermitidoExtraccion(url.hostname);
  } catch {
    return false;
  }
}

async function buscarEnlaces() {
  const url = inputUrl.value.trim();
  if (!validarUrlCliente(url)) {
    setEstado(
      'La URL debe usar http/https y un dominio público accesible (incluye proxies y mirrors).'
    );
    limpiarLista();
    return;
  }

  btnBuscar.disabled = true;
  btnCopiar.disabled = true;
  setEstado('Buscando enlaces...');
  lista.innerHTML = '';

  try {
    const res = await fetch(`/api/extract-links?url=${encodeURIComponent(url)}`);
    const data = await res.json();

    if (!data.ok) {
      setEstado(data.error || 'No se pudieron obtener los enlaces.');
      limpiarLista();
      return;
    }

    enlacesActuales = data.enlaces || [];
    renderLista(enlacesActuales);
    btnCopiar.disabled = enlacesActuales.length === 0;

    if (enlacesActuales.length === 0) {
      setEstado('No se encontraron enlaces con texto "Descargar".');
    } else {
      setEstado(`Se encontraron ${enlacesActuales.length} enlace(s).`);
    }
  } catch (err) {
    setEstado('Error de conexión con el servidor.');
    limpiarLista();
  } finally {
    btnBuscar.disabled = false;
  }
}

async function copiarEnlaces() {
  if (!enlacesActuales.length) return;
  const texto = enlacesActuales.join('\n');

  try {
    await navigator.clipboard.writeText(texto);
    setEstado('Enlaces copiados al portapapeles.');
    mostrarToast('Enlaces copiados al portapapeles.');
  } catch {
    const temp = document.createElement('textarea');
    temp.value = texto;
    document.body.appendChild(temp);
    temp.select();
    try {
      document.execCommand('copy');
      setEstado('Enlaces copiados al portapapeles.');
      mostrarToast('Enlaces copiados al portapapeles.');
    } catch {
      setEstado('No se pudo copiar al portapapeles.');
    } finally {
      document.body.removeChild(temp);
    }
  }
}

function restablecerZoom() {
  try {
    document.documentElement.style.zoom = '1';
    document.body.style.zoom = '1';
  } catch (_) {
    /* ignorar */
  }
  mostrarToast('Atajo: Ctrl+0 o Cmd+0 para zoom al 100%');
}

function nuevosEnlaces() {
  inputUrl.value = '';
  limpiarLista();
  btnBuscar.disabled = false;
  setEstado('Esperando una URL para comenzar.');
  if (toast) {
    toast.classList.remove('mostrar');
  }
  inputUrl.focus();
}

btnBuscar.addEventListener('click', buscarEnlaces);
btnCopiar.addEventListener('click', copiarEnlaces);
if (btnNuevosEnlaces) {
  btnNuevosEnlaces.addEventListener('click', nuevosEnlaces);
}
if (btnZoom) {
  btnZoom.addEventListener('click', restablecerZoom);
}
inputUrl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') buscarEnlaces();
});

setEstado('Esperando una URL para comenzar.');
