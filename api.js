/**
 * BE WILD · Capa de acceso al backend
 * ----------------------------------------------------------------------------
 * Es el ÚNICO módulo que conoce la existencia de la red. Ninguna vista debe
 * importar este archivo directamente: todo pasa por store.js / sync.js.
 *
 * Nota importante sobre CORS: Apps Script no responde peticiones OPTIONS, así
 * que los POST van con Content-Type text/plain para no disparar el preflight.
 * El body sigue siendo JSON, solo cambia el encabezado declarado.
 */

import { API_URL, TIEMPOS } from './config.js?v=2.3.0';
import * as auth from './auth.js?v=2.3.0';

/** Error de red o de aplicación, con la acción que lo originó. */
export class ErrorApi extends Error {
  constructor(mensaje, accion, causa) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.accion = accion;
    this.causa = causa;
  }
}

/** El backend rechazó la sesión: hay que volver a entrar. */
export class ErrorSesion extends ErrorApi {
  constructor(mensaje, accion) {
    super(mensaje, accion);
    this.name = 'ErrorSesion';
  }
}

const esperar = ms => new Promise(r => setTimeout(r, ms));

/** Una sola ida y vuelta, sin reintentos. */
async function intentar(accion, payload, timeout) {
  const controlador = new AbortController();
  const corte = setTimeout(() => controlador.abort(), timeout);

  try {
    const respuesta = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      // El token viaja en el cuerpo, no en un encabezado: agregar encabezados
      // propios dispararía el preflight OPTIONS que Apps Script no responde.
      body: JSON.stringify({ action: accion, payload, token: auth.token() }),
      redirect: 'follow',
      signal: controlador.signal
    });

    if (!respuesta.ok) {
      throw new ErrorApi(`El servidor respondió ${respuesta.status}`, accion);
    }

    const cuerpo = await respuesta.json();
    if (!cuerpo.ok) {
      if (cuerpo.codigo === 'SESION' || cuerpo.codigo === 'PERMISO') {
        throw new ErrorSesion(cuerpo.error || 'Sesión no válida', accion);
      }
      throw new ErrorApi(cuerpo.error || 'Error desconocido del servidor', accion);
    }

    return cuerpo.data;

  } catch (err) {
    if (err instanceof ErrorApi) throw err;
    if (err.name === 'AbortError') {
      const e = new ErrorApi('El servidor tardó demasiado en responder', accion, err);
      e.temporal = true;
      throw e;
    }
    const e = new ErrorApi('No se pudo conectar con el servidor', accion, err);
    e.temporal = true;
    throw e;
  } finally {
    clearTimeout(corte);
  }
}

/**
 * Ejecuta una acción contra el backend.
 *
 * @param {string} accion   Nombre de la acción (ping, list, upsert, batch…).
 * @param {Object} [payload]
 * @param {{timeout?:number, reintentos?:number}} [opciones]
 * @returns {Promise<*>} El contenido de `data` si la respuesta fue ok.
 * @throws {ErrorApi}
 */
export async function llamar(accion, payload = {}, opciones = {}) {
  const timeout = opciones.timeout || TIEMPOS.timeoutPeticion;
  let quedan = opciones.reintentos || 0;

  while (true) {
    try {
      return await intentar(accion, payload, timeout);
    } catch (err) {
      // Solo se reintenta lo que puede arreglarse solo: un timeout o un corte
      // de red. Una sesión rechazada o un error del servidor no mejoran por
      // insistir, y reintentarlos solo duplicaría el ruido.
      if (!err.temporal || quedan <= 0) throw err;
      quedan--;
      await esperar(TIEMPOS.reintentoRed);
    }
  }
}

/* ── Atajos por acción ──────────────────────────────────────────────────── */

export const api = {
  ping:      ()        => llamar('ping'),
  setup:     ()        => llamar('setup'),

  /**
   * Trae clientes y eventos de historial en una sola llamada.
   *
   * Cada uno lleva su propio marcador incremental porque avanzan a ritmos
   * distintos: un cliente se edita poco, pero acumula un evento por contacto.
   *
   * Es la única llamada que hace el arranque de la app.
   */
  listar: (since, sinceHist) => llamar(
    'list',
    { since: since || undefined, sinceHist: sinceHist || undefined },
    // Es la llamada más pesada y la primera del día encuentra el proyecto frío:
    // se le da aire y un reintento silencioso antes de dar la cara por perdida.
    { timeout: TIEMPOS.timeoutLectura, reintentos: 1 }
  ),

  guardar:   (cliente) => llamar('upsert', cliente),
  darDeBaja: (id)      => llamar('baja', { id }),
  contacto:  (id, fecha) => llamar('contacto', { id, fecha }),
  voucher:   (id, fecha) => llamar('voucher', { id, fecha }),

  // El lote lo reintenta la cola de sincronización con sus propias esperas
  // crecientes, así que acá no se agrega un reintento extra.
  lote:      (ops)     => llamar('batch', { ops }, { timeout: TIEMPOS.timeoutLectura }),

  log:       (entradas)=> llamar('log', { entradas }),
  leerConfig:  ()      => llamar('getConfig', {}, { reintentos: 1 }),
  guardarConfig: (valores) => llamar('setConfig', { valores })
};
