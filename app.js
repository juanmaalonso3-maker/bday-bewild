/**
 * BE WILD · Punto de entrada
 * ----------------------------------------------------------------------------
 * Orquesta el arranque: shell, router, terminal y verificación del backend.
 * Todo lo que pueda fallar acá falla en silencio hacia la interfaz, nunca con
 * una pantalla en blanco.
 */

import { TIEMPOS } from './config.js';
import * as router from './router.js';
import * as shell from './ui-shell.js';
import * as terminal from './ui-terminal.js';
import { avisar } from './ui-avisos.js';
import { api, ErrorApi } from './api.js';

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

  // Si config.TERMINAL_POR_DEFECTO tiene valor, se entra directo con esa terminal.
  // Si vale null, se exige elegir una antes de operar (los registros no pueden
  // quedar sin autor).
  if (!terminal.obtener()) {
    await terminal.pedirTerminal({ obligatorio: true });
    shell.montarEncabezado();
  }

  // Registro de vistas en el orden del menú.
  shell.SECCIONES.forEach(sec => router.registrar(sec.ruta, VISTAS[sec.ruta]));

  router.alNavegar((ruta, vista) => {
    const contenedor = document.getElementById('contenido');
    contenedor.innerHTML = '';
    shell.marcarActiva(ruta, vista.titulo);
    try {
      vista.render(contenedor);
    } catch (err) {
      contenedor.innerHTML =
        '<div class="vacio"><div class="vacio__titulo">No se pudo abrir la sección</div>' +
        '<p class="vacio__texto">Probá recargar la página. Si sigue igual, revisá el registro.</p></div>';
      console.error('[vista:' + ruta + ']', err);
    }
    contenedor.focus();
  });

  router.iniciar();

  verificarBackend();
  vigilarConexion();
}

/* ── Backend ────────────────────────────────────────────────────────────── */

/** Confirma que el Web App responde y que la planilla tiene estructura. */
async function verificarBackend() {
  if (!navigator.onLine) {
    shell.estadoConexion('offline');
    return;
  }

  shell.estadoConexion('conectando');
  try {
    const data = await api.ping();
    shell.estadoConexion('ok', 'Conectado');
    console.info('[backend]', data);
  } catch (err) {
    shell.estadoConexion('error');
    const detalle = err instanceof ErrorApi ? err.message : 'Error inesperado';
    avisar('No se pudo conectar con el servidor. ' + detalle, 'error', 6000);
    console.error('[backend]', err);
  }
}

/** Reacciona a los cortes de red del navegador. */
function vigilarConexion() {
  window.addEventListener('offline', () => shell.estadoConexion('offline'));
  window.addEventListener('online', () => {
    avisar('Conexión restablecida', 'ok');
    verificarBackend();
  });

  // Reverificación periódica solo con la pestaña a la vista.
  setInterval(() => {
    if (document.visibilityState === 'visible') verificarBackend();
  }, TIEMPOS.pollRefresco * 5);
}

/* ── Go ─────────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', iniciar);
