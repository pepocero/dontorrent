const inputUrl = document.getElementById('url');
const btnBuscar = document.getElementById('buscar');
const btnCopiar = document.getElementById('copiar');
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

function validarUrlCliente(valor) {
  try {
    const url = new URL(valor);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    return host.endsWith('estrenosgo.in') || host.endsWith('dontorrent.pink');
  } catch {
    return false;
  }
}

async function buscarEnlaces() {
  const url = inputUrl.value.trim();
  if (!validarUrlCliente(url)) {
    setEstado(
      'La URL debe ser válida y del dominio estrenosgo.in o dontorrent.pink.'
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

btnBuscar.addEventListener('click', buscarEnlaces);
btnCopiar.addEventListener('click', copiarEnlaces);
if (btnZoom) {
  btnZoom.addEventListener('click', restablecerZoom);
}
inputUrl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') buscarEnlaces();
});

setEstado('Esperando una URL para comenzar.');
