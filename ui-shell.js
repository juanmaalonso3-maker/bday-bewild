/**
 * BE WILD · Estructura de la interfaz
 * ----------------------------------------------------------------------------
 * Arma la navegación, mantiene el título de la vista, el indicador de conexión
 * y el selector de terminal. No sabe nada de datos.
 */

import { VERSION, ZONA_HORARIA } from './config.js';
import * as terminal from './ui-terminal.js';
import * as router from './router.js';

/** Secciones del menú. `grupo` define en qué bloque del sidebar aparece. */
export const SECCIONES = [
  { ruta: 'carga',       etiqueta: 'Carga de clientes',  grupo: 'principal' },
  { ruta: 'cumpleanos',  etiqueta: 'Cumpleaños del mes', grupo: 'principal' },
  { ruta: 'base',        etiqueta: 'Base de datos',      grupo: 'principal' },
  { ruta: 'dashboard',   etiqueta: 'Dashboard',          grupo: 'principal' },
  { ruta: 'logs',        etiqueta: 'Registro',           grupo: 'sistema' },
  { ruta: 'ajustes',     etiqueta: 'Ajustes',            grupo: 'sistema' }
];

/** Dibuja el menú lateral. */
export function construirNav() {
  const contenedores = {
    principal: document.getElementById('nav-principal'),
    sistema:   document.getElementById('nav-sistema')
  };

  SECCIONES.forEach(sec => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav__item';
    btn.dataset.ruta = sec.ruta;
    btn.innerHTML = `<span>${sec.etiqueta}</span><span class="nav__badge" data-badge="${sec.ruta}"></span>`;
    btn.addEventListener('click', () => router.ir(sec.ruta));
    contenedores[sec.grupo].appendChild(btn);
  });
}

/** Marca el ítem activo y actualiza el título. */
export function marcarActiva(ruta, titulo) {
  document.querySelectorAll('.nav__item').forEach(btn => {
    if (btn.dataset.ruta === ruta) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  document.getElementById('titulo-vista').textContent = titulo;
  document.title = `BE WILD · ${titulo}`;
}

/**
 * Escribe un número al lado de una sección del menú (ej. cumpleaños pendientes).
 * @param {string} ruta
 * @param {number|null} valor  null o 0 lo oculta.
 */
export function badge(ruta, valor) {
  const el = document.querySelector(`[data-badge="${ruta}"]`);
  if (el) el.textContent = valor ? String(valor) : '';
}

/**
 * Indicador de conexión de la barra superior.
 * @param {'conectando'|'ok'|'offline'|'error'} estado
 * @param {string} [texto]
 */
export function estadoConexion(estado, texto) {
  const el = document.getElementById('estado-conexion');
  const etiquetas = {
    conectando: 'Conectando…',
    ok:         'Conectado',
    offline:    'Sin conexión',
    error:      'Error de conexión'
  };
  el.dataset.estado = estado;
  el.querySelector('.estado__texto').textContent = texto || etiquetas[estado];
}

/** Fecha de hoy en el encabezado, escrita en criollo. */
export function pintarFecha() {
  const hoy = new Date().toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: ZONA_HORARIA
  });
  document.getElementById('fecha-hoy').textContent = hoy;
}

/** Conecta el botón de terminal y muestra la versión. */
export function montarEncabezado() {
  document.getElementById('terminal-actual').textContent = terminal.nombre();
  document.getElementById('btn-terminal')
    .addEventListener('click', () => terminal.pedirTerminal());
  document.getElementById('version-app').textContent = 'v' + VERSION;
  pintarFecha();
}
