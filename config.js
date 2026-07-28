/**
 * BE WILD · Configuración global
 * ----------------------------------------------------------------------------
 * Único archivo que hay que tocar si cambia el backend o se agrega una terminal.
 */

/** URL del Web App de Apps Script (termina en /exec). */
export const API_URL =
  'https://script.google.com/macros/s/AKfycbyl_vTVc7UpkRYWr5fi3KUV4VuPIZ0ne-X9NBceadU0snmjManufwlv5epp1eE_wJEV/exec';

export const VERSION = '1.0.0';

/** Terminales disponibles. El valor se guarda en cada cliente cargado. */
export const TERMINALES = [
  { id: 'ESTE',  nombre: 'Este',  nota: 'Local Lanús Este' },
  { id: 'OESTE', nombre: 'Oeste', nota: 'Local Lanús Oeste' },
  { id: 'ADMIN', nombre: 'Admin', nota: 'Administración' }
];

/**
 * Terminal que se asume si nadie eligió una.
 * Con un valor acá, la app entra directo y no muestra el selector de arranque.
 * Se puede seguir cambiando a mano desde el botón del encabezado.
 * Para volver a pedirlo obligatoriamente al abrir, poner null.
 */
export const TERMINAL_POR_DEFECTO = 'ESTE';

/** Tiempos, en milisegundos. */
export const TIEMPOS = {
  timeoutPeticion: 20000,   // corta una petición colgada
  pollRefresco:    60000,   // pull incremental con la pestaña visible
  reintentos:      [2000, 5000, 15000, 60000, 300000],
  duracionAviso:   3500
};

/** Claves de almacenamiento local. */
export const CLAVES = {
  terminal: 'bw_terminal'
};

export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';
