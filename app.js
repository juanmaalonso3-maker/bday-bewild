/**
 * BE WILD · Punto de entrada
 * ----------------------------------------------------------------------------
 * Orquesta el arranque: shell, router, estado, sincronización y verificación
 * del backend. Todo lo que pueda fallar acá falla hacia la interfaz con un
 * mensaje, nunca con una pantalla en blanco.
 */

import { TIEMPOS } from './config.js';
import * as router from './router.js';
import * as shell from './ui-shell.js';
import * as terminal from './ui-terminal.js';
import { avisar } from './ui-avisos.js';
import { api, ErrorApi } from './api.js';
import * as store from './store.js';
import * as sync from './sync.js';
import { log } from './logger.js';
import { contactadoEsteAnio } from './utils-fecha.js';

import carga      from './view-carga.js';
import cumpleanos from './view-cumpleanos.js';
import base       from './view-base.js';
import dashboard  from './view-dashboard.js';
import logs       from './view-logs.js';
import ajustes    from './view-ajustes.js';

const VISTAS = { carga, cumpleanos, base, dashboard, logs, ajustes };

/* ── Arranque ───────────────────────────────────────────────────────────── */

async function iniciar() {
  shell.construirNav();
  shell.montarEncabezado();

  // Si config.TERMINAL_POR_DEFECTO tiene valor, se entra directo con esa
  // terminal. Si vale null, se exige elegir una antes de operar.
  if (!terminal.obtener()) {
    await terminal.pedirTerminal({ obligatorio: true });
    shell.montarEncabezado();
  }

  shell.SECCIONES.forEach(sec => router.registrar(sec.ruta, VISTAS[sec.ruta]));
  router.alNavegar(montarVista);
  router.iniciar();

  // La cache local levanta primero: la app es usable antes de tocar la red.
  try {
    await store.iniciar();
  } catch (err) {
    log.error('app:inicio', err.message);
    avisar('No se pudo abrir la base local. Los datos no se van a guardar sin conexión.', 'error', 8000);
  }

  store.suscribir(actualizarContadores);
  sync.alCambiar(evento => shell.pendientesSync(evento.pendientes));
  sync.pendientes().then(n => shell.pendientesSync(n));

  verificarBackend();
  vigilarConexion();
  refrescoPeriodico();
}

/** Dibuja la vista correspondiente a la ruta activa. */
function montarVista(ruta, vista) {
  const contenedor = document.getElementById('contenido');
  contenedor.innerHTML = '';
  shell.marcarActiva(ruta, vista.titulo);

  try {
    vista.render(contenedor);
  } catch (err) {
    log.error('vista:' + ruta, err.message);
    contenedor.innerHTML =
      '<div class="vacio"><div class="vacio__titulo">No se pudo abrir la sección</div>' +
      '<p class="vacio__texto">Probá recargar la página. Si sigue igual, revisá el registro.</p></div>';
  }
  contenedor.focus();
}

/** Número al lado de "Cumpleaños del mes": lo que falta contactar. */
function actualizarContadores() {
  const pendientes = store.listar().filter(c => {
    if (!c.cumple || !c.cumple.esteMes) return false;
    return !contactadoEsteAnio(c.ultimoContacto);
  }).length;

  shell.badge('cumpleanos', pendientes);
}

/* ── Backend ────────────────────────────────────────────────────────────── */

async function verificarBackend() {
  if (!navigator.onLine) {
    shell.estadoConexion('offline');
    return;
  }

  shell.estadoConexion('conectando');
  try {
    await api.ping();
    shell.estadoConexion('ok');
  } catch (err) {
    shell.estadoConexion('error');
    const detalle = err instanceof ErrorApi ? err.message : 'Error inesperado';
    avisar('Sin conexión con el servidor. Se sigue guardando local. ' + detalle, 'alerta', 6000);
    log.warn('backend:ping', detalle);
  }
}

function vigilarConexion() {
  window.addEventListener('offline', () => shell.estadoConexion('offline'));
  window.addEventListener('online', () => {
    avisar('Conexión restablecida', 'ok');
    verificarBackend();
    store.refrescar();
  });
}

/** Trae los cambios del servidor solo con la pestaña a la vista. */
function refrescoPeriodico() {
  setInterval(() => {
    if (document.visibilityState !== 'visible' || !navigator.onLine) return;
    store.refrescar();
  }, TIEMPOS.pollRefresco);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') store.refrescar();
  });
}

/* ── Go ─────────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', iniciar);
