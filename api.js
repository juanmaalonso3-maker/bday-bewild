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

import { API_URL, TIEMPOS } from './config.js';
import * as auth from './auth.js';

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

/**
 * Ejecuta una acción contra el backend.
 * @param {string} accion   Nombre de la acción (ping, list, upsert, batch…).
 * @param {Object} [payload]
 * @returns {Promise<*>} El contenido de `data` si la respuesta fue ok.
 * @throws {ErrorApi}
 */
export async function llamar(accion, payload = {}) {
  const controlador = new AbortController();
  const corte = setTimeout(() => controlador.abort(), TIEMPOS.timeoutPeticion);

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
      throw new ErrorApi('El servidor tardó demasiado en responder', accion, err);
    }
    throw new ErrorApi('No se pudo conectar con el servidor', accion, err);
  } finally {
    clearTimeout(corte);
  }
}

/* ── Atajos por acción ──────────────────────────────────────────────────── */

export const api = {
  ping:      ()        => llamar('ping'),
  setup:     ()        => llamar('setup'),
  listar:    (since)   => llamar('list', since ? { since } : {}),
  guardar:   (cliente) => llamar('upsert', cliente),
  darDeBaja: (id)      => llamar('baja', { id }),
  contacto:  (id, fecha) => llamar('contacto', { id, fecha }),
  lote:      (ops)     => llamar('batch', { ops }),
  log:       (entradas)=> llamar('log', { entradas }),
  leerConfig:  ()      => llamar('getConfig'),
  guardarConfig: (valores) => llamar('setConfig', { valores })
};
