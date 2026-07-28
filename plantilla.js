/**
 * BE WILD · Plantilla del mensaje de WhatsApp
 * ----------------------------------------------------------------------------
 * El texto vive en la hoja Config, así que se puede cambiar la promo sin tocar
 * el código y el cambio llega a las dos sucursales. Se cachea en el navegador
 * para que la sección de cumpleaños funcione aunque el servidor esté lento o
 * no haya internet.
 *
 * Variables disponibles en el texto: {nombre}, {dia}, {mes}
 */

import { api } from './api.js';
import { log } from './logger.js';
import { MESES } from './utils-fecha.js';

const CLAVE_CACHE = 'bw_plantilla';

const POR_DEFECTO =
  '¡Feliz cumple, {nombre}! 🖤 Desde BE WILD te queremos regalar un 15% OFF ' +
  'en toda la tienda durante toda la semana. Pasá por el local o escribinos ' +
  'por acá. ¡Que la pases hermoso!';

let actual = localStorage.getItem(CLAVE_CACHE) || POR_DEFECTO;
let escuchas = [];

/** Texto vigente, disponible al instante. */
export function obtener() {
  return actual;
}

export function porDefecto() {
  return POR_DEFECTO;
}

/** Avisa cuando el texto cambia (por edición o por llegar del servidor). */
export function alCambiar(fn) {
  escuchas.push(fn);
  return () => { escuchas = escuchas.filter(f => f !== fn); };
}

function aplicarCambio(texto) {
  actual = texto;
  localStorage.setItem(CLAVE_CACHE, texto);
  escuchas.forEach(fn => { try { fn(texto); } catch (e) { /* ignorar */ } });
}

/** Trae el texto del servidor. Si falla, se sigue usando el cacheado. */
export async function cargar() {
  try {
    const config = await api.leerConfig();
    if (config && config.plantillaWhatsApp) aplicarCambio(String(config.plantillaWhatsApp));
    return actual;
  } catch (err) {
    log.warn('plantilla:cargar', err.message);
    return actual;
  }
}

/** Guarda el texto nuevo. Se aplica local primero y después viaja. */
export async function guardar(texto) {
  const limpio = String(texto || '').trim();
  if (!limpio) throw new Error('El mensaje no puede quedar vacío');

  aplicarCambio(limpio);
  await api.guardarConfig({ plantillaWhatsApp: limpio });
  log.info('plantilla:guardada', { largo: limpio.length });
  return limpio;
}

/**
 * Reemplaza las variables por los datos del cliente.
 * @param {Object} cliente
 * @param {string} [texto] Por defecto, la plantilla vigente.
 */
export function aplicar(cliente, texto = actual) {
  const primerNombre = String(cliente.nombreCompleto || '').trim().split(/\s+/)[0] || '';
  const nac = cliente.nacimiento || {};

  return String(texto)
    .replace(/\{nombre\}/g, primerNombre)
    .replace(/\{dia\}/g, nac.dia != null ? String(nac.dia) : '')
    .replace(/\{mes\}/g, nac.mes != null ? MESES[nac.mes - 1] : '');
}

/** Vista previa con un cliente inventado, para la pantalla de ajustes. */
export function vistaPrevia(texto) {
  return aplicar(
    { nombreCompleto: 'Juana Pérez', nacimiento: { dia: 12, mes: 8 } },
    texto
  );
}
