/**
 * BE WILD · Estructura de la interfaz
 * ----------------------------------------------------------------------------
 * Arma la navegación, mantiene el título de la vista, el indicador de conexión
 * y los datos de la sesión. No sabe nada de datos de clientes.
 */

import { VERSION, ZONA_HORARIA } from './config.js?v=2.3.0';
import * as auth from './auth.js?v=2.3.0';
import * as router from './router.js?v=2.3.0';

/**
 * Secciones del menú.
 *   grupo   → bloque del sidebar donde aparece
 *   permiso → qué hace falta para verla (ver = todos, editar = solo admin)
 */
export const SECCIONES = [
  { ruta: 'carga',       etiqueta: 'Carga de clientes',  grupo: 'principal', permiso: 'cargar' },
  { ruta: 'cumpleanos',  etiqueta: 'Cumpleaños',         grupo: 'principal', permiso: 'contactar' },
  { ruta: 'base',        etiqueta: 'Base de datos',      grupo: 'principal', permiso: 'editar' },
  { ruta: 'historial',   etiqueta: 'Historial',          grupo: 'principal', permiso: 'contactar' },
  { ruta: 'dashboard',   etiqueta: 'Dashboard',          grupo: 'principal', permiso: 'editar' },
  { ruta: 'logs',        etiqueta: 'Registro',           grupo: 'sistema',   permiso: 'editar' },
  { ruta: 'ajustes',     etiqueta: 'Ajustes',            grupo: 'sistema',   permiso: 'cargar' }
];

/** Secciones que el usuario de esta sesión tiene permitidas. */
export function seccionesVisibles() {
  return SECCIONES.filter(sec => auth.puede(sec.permiso));
}

/** Dibuja el menú lateral con lo que corresponda al rol. */
export function construirNav() {
  const contenedores = {
    principal: document.getElementById('nav-principal'),
    sistema:   document.getElementById('nav-sistema')
  };

  contenedores.principal.innerHTML = '';
  contenedores.sistema.innerHTML = '';

  const visibles = seccionesVisibles();

  visibles.forEach(sec => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav__item';
    btn.dataset.ruta = sec.ruta;
    btn.innerHTML = `<span>${sec.etiqueta}</span><span class="nav__badge" data-badge="${sec.ruta}"></span>`;
    btn.addEventListener('click', () => router.ir(sec.ruta));
    contenedores[sec.grupo].appendChild(btn);
  });

  // Si el rol no llega a ninguna sección del bloque, se oculta el rótulo.
  const titulo = document.querySelector('.nav__grupo-titulo');
  if (titulo) titulo.hidden = !visibles.some(s => s.grupo === 'sistema');
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
 * Escribe un número al lado de una sección del menú.
 * @param {string} ruta
 * @param {number|null} valor  null o 0 lo oculta.
 */
export function badge(ruta, valor) {
  const el = document.querySelector(`[data-badge="${ruta}"]`);
  if (el) el.textContent = valor ? String(valor) : '';
}

/* ── Indicador de conexión ──────────────────────────────────────────────── */

let _estado = 'conectando';
let _pendientes = 0;

/**
 * @param {'conectando'|'ok'|'offline'|'error'} estado
 * @param {string} [texto]
 */
export function estadoConexion(estado, texto) {
  _estado = estado;
  pintarEstado(texto);
}

/** Cantidad de operaciones esperando ser enviadas. */
export function pendientesSync(n) {
  _pendientes = n || 0;
  pintarEstado();
}

function pintarEstado(textoForzado) {
  const el = document.getElementById('estado-conexion');
  if (!el) return;

  const etiquetas = {
    conectando: 'Conectando…',
    ok:         'Conectado',
    offline:    'Sin conexión',
    error:      'Error de conexión'
  };

  const base = textoForzado || etiquetas[_estado];
  const sufijo = _pendientes
    ? ` · ${_pendientes} ${_pendientes === 1 ? 'pendiente' : 'pendientes'}`
    : '';

  el.dataset.estado = _estado;
  el.querySelector('.estado__texto').textContent = base + sufijo;
}

/* ── Encabezado ─────────────────────────────────────────────────────────── */

/** Fecha de hoy en el encabezado, escrita en criollo. */
export function pintarFecha() {
  const hoy = new Date().toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: ZONA_HORARIA
  });
  document.getElementById('fecha-hoy').textContent = hoy;
}

/** Muestra quién está usando la app y desde qué local. */
export function pintarSesion() {
  const u = auth.usuario();
  const caja = document.getElementById('sesion');
  if (!caja) return;

  if (!u) {
    caja.hidden = true;
    return;
  }

  caja.hidden = false;
  caja.querySelector('.sesion__local').textContent = u.etiqueta;
  caja.querySelector('.sesion__mail').textContent = u.email;

  const avatar = caja.querySelector('.sesion__avatar');
  if (u.foto) {
    avatar.style.backgroundImage = `url(${u.foto})`;
    avatar.textContent = '';
  } else {
    avatar.style.backgroundImage = '';
    avatar.textContent = (u.nombre || u.email).charAt(0).toUpperCase();
  }

  caja.dataset.rol = u.rol;
}

/** Conecta el botón de salir y muestra la versión. */
export function montarEncabezado(alSalir) {
  document.getElementById('version-app').textContent = 'v' + VERSION;
  document.getElementById('btn-salir').addEventListener('click', alSalir);
  pintarFecha();
  pintarSesion();
}
