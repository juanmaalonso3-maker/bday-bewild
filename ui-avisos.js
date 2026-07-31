/**
 * BE WILD · Avisos flotantes (toasts)
 * ----------------------------------------------------------------------------
 * Feedback no bloqueante. Nunca interrumpe la carga de clientes.
 */

import { TIEMPOS } from './config.js?v=2.1.0';

const contenedor = () => document.getElementById('avisos');

/**
 * @param {string} mensaje
 * @param {'info'|'ok'|'alerta'|'error'} [tipo]
 * @param {number} [duracion]
 */
export function avisar(mensaje, tipo = 'info', duracion = TIEMPOS.duracionAviso) {
  const caja = contenedor();
  if (!caja) return;

  const el = document.createElement('div');
  el.className = 'aviso';
  el.dataset.tipo = tipo;
  el.textContent = mensaje;
  caja.appendChild(el);

  setTimeout(() => el.remove(), duracion);
}
