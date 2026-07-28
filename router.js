/**
 * BE WILD · Router por hash
 * ----------------------------------------------------------------------------
 * Se usa hash (#/carga) y no History API porque GitHub Pages no puede reescribir
 * rutas: al refrescar en /base daría 404.
 */

const rutas = new Map();
let alCambiar = null;
let rutaPorDefecto = '';

/**
 * Registra una vista.
 * @param {string} ruta   Identificador sin '#/' (ej. 'carga').
 * @param {{titulo: string, render: Function, destruir?: Function}} vista
 */
export function registrar(ruta, vista) {
  rutas.set(ruta, vista);
  if (!rutaPorDefecto) rutaPorDefecto = ruta;
}

/** Callback que se dispara en cada navegación: (ruta, vista) => void */
export function alNavegar(fn) {
  alCambiar = fn;
}

/** Ruta activa en este momento. */
export function rutaActual() {
  return location.hash.replace(/^#\/?/, '') || rutaPorDefecto;
}

/** Navega por código. */
export function ir(ruta) {
  if (rutaActual() === ruta) return resolver();
  location.hash = '#/' + ruta;
}

/** Arranca el router y resuelve la ruta inicial. */
export function iniciar() {
  window.addEventListener('hashchange', resolver);
  resolver();
}

let vistaActiva = null;

function resolver() {
  const ruta = rutaActual();
  const vista = rutas.get(ruta);

  if (!vista) {
    location.hash = '#/' + rutaPorDefecto;
    return;
  }

  // Permite que la vista anterior libere timers o listeners.
  if (vistaActiva && typeof vistaActiva.destruir === 'function') {
    try { vistaActiva.destruir(); } catch (e) { /* no bloquear la navegación */ }
  }
  vistaActiva = vista;

  if (alCambiar) alCambiar(ruta, vista);
}
