/**
 * BE WILD · Registro de eventos
 * ----------------------------------------------------------------------------
 * Doble destino:
 *   - Local (IndexedDB): todo, para poder exportarlo y revisarlo desde la app.
 *   - Remoto (hoja Logs): solo advertencias y errores, en tandas, para que se
 *     puedan ver desde la planilla sin depender de que el operador avise.
 *
 * El logger nunca hace fallar una operación: si no puede escribir, se calla.
 */

import { logs as almacenLogs } from './db.js?v=2.3.0';
import { api } from './api.js?v=2.3.0';
import { ahoraISO } from './utils-fecha.js?v=2.3.0';
import * as auth from './auth.js?v=2.3.0';

const MAXIMO_LOCAL = 1000;
const TAMANO_TANDA = 10;
const INTERVALO_ENVIO = 20000;

let buffer = [];
let temporizador = null;

/**
 * @param {'INFO'|'WARN'|'ERROR'} nivel
 * @param {string} evento    Identificador corto, ej. 'cliente:alta'
 * @param {*}      [detalle]
 * @param {string} [clienteId]
 */
export async function registrar(nivel, evento, detalle = '', clienteId = '') {
  const linea = {
    timestamp: ahoraISO(),
    nivel,
    evento,
    detalle: typeof detalle === 'object' ? recortar(detalle) : String(detalle || ''),
    usuario: auth.nombre(),
    clienteId
  };

  // Consola, para depurar en vivo.
  const salida = nivel === 'ERROR' ? console.error : nivel === 'WARN' ? console.warn : console.info;
  salida(`[${evento}]`, detalle);

  try {
    await almacenLogs.agregar(linea);
    await almacenLogs.recortar(MAXIMO_LOCAL);
  } catch (e) {
    // Si ni el log local funciona, no vale la pena escalar el problema.
  }

  if (nivel !== 'INFO') encolarRemoto(linea);
}

export const log = {
  info:  (evento, detalle, id) => registrar('INFO', evento, detalle, id),
  warn:  (evento, detalle, id) => registrar('WARN', evento, detalle, id),
  error: (evento, detalle, id) => registrar('ERROR', evento, detalle, id)
};

/* ── Envío remoto en tandas ─────────────────────────────────────────────── */

function encolarRemoto(linea) {
  buffer.push(linea);
  if (buffer.length >= TAMANO_TANDA) return enviar();
  if (!temporizador) temporizador = setTimeout(enviar, INTERVALO_ENVIO);
}

async function enviar() {
  clearTimeout(temporizador);
  temporizador = null;
  if (!buffer.length || !navigator.onLine) return;

  const tanda = buffer.splice(0, buffer.length);
  try {
    await api.log(tanda);
  } catch (e) {
    // Si no se pudo enviar, queda solo el registro local. No se reintenta:
    // la cola de sincronización de clientes tiene prioridad sobre los logs.
    console.warn('[logger] no se pudieron enviar los logs remotos');
  }
}

/** Recorta objetos grandes para no llenar la planilla. */
function recortar(obj) {
  try {
    const texto = JSON.stringify(obj);
    return texto.length > 500 ? texto.slice(0, 500) + '…' : texto;
  } catch (e) {
    return String(obj);
  }
}

/** Historial local completo, del más viejo al más nuevo. */
export function historial() {
  return almacenLogs.todos();
}

export function limpiarHistorial() {
  return almacenLogs.vaciar();
}
