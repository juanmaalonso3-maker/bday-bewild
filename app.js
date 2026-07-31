/**
 * BE WILD · Punto de entrada
 * ----------------------------------------------------------------------------
 * El arranque tiene dos caminos:
 *
 *   sin sesión → pantalla de ingreso con el botón de Google
 *   con sesión → se monta la aplicación completa
 *
 * La aplicación se monta una sola vez por sesión. Si el usuario sale y vuelve a
 * entrar con otra cuenta, se recarga la página: es más simple y más seguro que
 * intentar desarmar el estado a mano, y evita que queden datos de la sesión
 * anterior dando vueltas en memoria.
 */

import { TIEMPOS } from './config.js?v=2.1.0';
import * as router from './router.js?v=2.1.0';
import * as shell from './ui-shell.js?v=2.1.0';
import * as auth from './auth.js?v=2.1.0';
import { avisar } from './ui-avisos.js?v=2.1.0';
import { api, ErrorApi, ErrorSesion } from './api.js?v=2.1.0';
import * as store from './store.js?v=2.1.0';
import * as sync from './sync.js?v=2.1.0';
import { log } from './logger.js?v=2.1.0';
import { contactadoEsteAnio } from './utils-fecha.js?v=2.1.0';
import * as plantilla from './plantilla.js?v=2.1.0';

import carga      from './view-carga.js?v=2.1.0';
import cumpleanos from './view-cumpleanos.js?v=2.1.0';
import base       from './view-base.js?v=2.1.0';
import dashboard  from './view-dashboard.js?v=2.1.0';
import logs       from './view-logs.js?v=2.1.0';
import ajustes    from './view-ajustes.js?v=2.1.0';

const VISTAS = { carga, cumpleanos, base, dashboard, logs, ajustes };

let montada = false;

/* ── Arranque ───────────────────────────────────────────────────────────── */

async function iniciar() {
  if (auth.recuperarSesion()) {
    return montarApp();
  }
  mostrarLogin();
}

/* ── Ingreso ────────────────────────────────────────────────────────────── */

async function mostrarLogin() {
  const pantalla = document.getElementById('pantalla-login');
  const error = document.getElementById('login-error');

  document.getElementById('app').hidden = true;
  pantalla.hidden = false;

  auth.alCambiar(sesion => { if (sesion) montarApp(); });

  try {
    await auth.montarBoton(document.getElementById('boton-google'), mensaje => {
      error.textContent = mensaje;
      error.hidden = false;
    });
  } catch (err) {
    error.textContent =
      'No se pudo cargar el ingreso de Google. Revisá la conexión y recargá la página.';
    error.hidden = false;
    console.error('[auth]', err);
  }
}

/* ── Aplicación ─────────────────────────────────────────────────────────── */

async function montarApp() {
  if (montada) return;
  montada = true;

  document.getElementById('pantalla-login').hidden = true;
  document.getElementById('app').hidden = false;

  shell.construirNav();
  shell.montarEncabezado(salir);

  // Solo se registran las vistas que el rol tiene permitidas: si alguien
  // escribe #/base a mano sin ser admin, el router lo manda a la primera
  // sección disponible en vez de abrirla.
  shell.seccionesVisibles().forEach(sec => router.registrar(sec.ruta, VISTAS[sec.ruta]));
  router.alNavegar(montarVista);
  router.iniciar();

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
  auth.vigilarVencimiento(sesionVencida);

  plantilla.cargar();

  log.info('app:ingreso', { usuario: auth.nombre(), rol: auth.rol() });
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

/* ── Sesión ─────────────────────────────────────────────────────────────── */

async function salir() {
  const pendientes = await sync.pendientes();
  if (pendientes) {
    const seguir = confirm(
      `Quedan ${pendientes} ${pendientes === 1 ? 'operación' : 'operaciones'} sin sincronizar.\n\n` +
      'Si salís ahora, se van a enviar la próxima vez que alguien entre desde esta computadora. ¿Salir igual?'
    );
    if (!seguir) return;
  }

  log.info('app:salida', { usuario: auth.nombre() });
  auth.salir();
  location.reload();
}

function sesionVencida() {
  avisar('La sesión venció. Volvé a entrar para seguir.', 'alerta', 8000);
  setTimeout(() => location.reload(), 2000);
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
    if (err instanceof ErrorSesion) {
      shell.estadoConexion('error', 'Sesión rechazada');
      avisar('El servidor no reconoció la sesión. Volvé a entrar.', 'error', 8000);
      log.error('backend:sesion', err.message);
      return;
    }
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
