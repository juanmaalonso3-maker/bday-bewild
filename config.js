/**
 * BE WILD · Configuración global
 * ----------------------------------------------------------------------------
 * Único archivo que hay que tocar para cambiar el backend, dar de alta un
 * usuario o ajustar los tiempos.
 */

/** URL del Web App de Apps Script (termina en /exec). */
export const API_URL =
  'https://script.google.com/macros/s/AKfycbyl_vTVc7UpkRYWr5fi3KUV4VuPIZ0ne-X9NBceadU0snmjManufwlv5epp1eE_wJEV/exec';

export const VERSION = '2.0.0';

/**
 * ID de cliente OAuth de Google.
 *
 * IMPORTANTE: en la consola de Google Cloud, este ID tiene que tener declarado
 * el origen de GitHub Pages en "Orígenes autorizados de JavaScript":
 *
 *     https://juanmaalonso3-maker.github.io
 *
 * Sin eso, el botón de Google no aparece y la consola tira un error de origen.
 * El mismo ID va copiado en el Code.gs, porque el backend verifica que el token
 * haya sido emitido para esta aplicación y no para otra.
 */
export const CLIENT_ID =
  '849214701404-ff11l3oo5k9hecabvf99cnbbgjlegeam.apps.googleusercontent.com';

/**
 * Usuarios habilitados y qué puede hacer cada uno.
 *
 *   ADMIN    → acceso completo: editar, dar de baja, exportar, configurar
 *   OPERADOR → solo carga de clientes y cumpleaños del mes
 *
 * `sucursal` es lo que queda registrado en cada cliente cargado.
 * Esta lista también está en el Code.gs: el navegador la usa para armar el
 * menú, el servidor para decidir de verdad.
 */
export const USUARIOS = [
  { email: 'bewild.ventas@gmail.com', rol: 'ADMIN',    sucursal: 'ADMIN', etiqueta: 'Administración' },
  { email: 'info@bewild.com.ar',      rol: 'ADMIN',    sucursal: 'ADMIN', etiqueta: 'Administración' },
  { email: 'bw.este@bewild.com.ar',   rol: 'OPERADOR', sucursal: 'ESTE',  etiqueta: 'Lanús Este' },
  { email: 'bw.oeste@bewild.com.ar',  rol: 'OPERADOR', sucursal: 'OESTE', etiqueta: 'Lanús Oeste' }
];

/** Tiempos, en milisegundos. */
export const TIEMPOS = {
  timeoutPeticion: 20000,   // corta una petición colgada
  pollRefresco:    60000,   // pull incremental con la pestaña visible
  reintentos:      [2000, 5000, 15000, 60000, 300000],
  duracionAviso:   3500
};

/** Claves de almacenamiento local. */
export const CLAVES = {
  sesion: 'bw_sesion'
};

export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';
