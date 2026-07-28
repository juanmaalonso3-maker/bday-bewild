/**
 * BE WILD · Utilidades de fecha
 * ----------------------------------------------------------------------------
 * Todo lo que tenga que ver con fechas pasa por acá. El objetivo es que ningún
 * otro archivo use `new Date()` a mano: la zona horaria de Buenos Aires se
 * aplica en un solo lugar y así se evita el clásico corrimiento de un día.
 *
 * Convenciones:
 *   - Fecha de nacimiento: texto "dd/mm/aaaa", o "dd/mm" si no se sabe el año.
 *   - Fechas de sistema:   texto ISO "aaaa-mm-dd".
 */

import { ZONA_HORARIA } from './config.js';

export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

/** Partes de la fecha de hoy en Buenos Aires. @returns {{dia,mes,anio}} */
export function hoyPartes() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());

  const buscar = tipo => Number(partes.find(p => p.type === tipo).value);
  return { dia: buscar('day'), mes: buscar('month'), anio: buscar('year') };
}

/** Fecha de hoy en Buenos Aires, formato "aaaa-mm-dd". */
export function hoyISO() {
  const { dia, mes, anio } = hoyPartes();
  return `${anio}-${dos(mes)}-${dos(dia)}`;
}

/** Fecha y hora de hoy, formato "aaaa-mm-dd HH:mm". */
export function ahoraISO() {
  const hora = new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date());
  return `${hoyISO()} ${hora}`;
}

/** Rellena a dos dígitos. */
export function dos(n) {
  return String(n).padStart(2, '0');
}

/**
 * Convierte el valor de un <input type="date"> (aaaa-mm-dd) a "dd/mm/aaaa".
 * @returns {string} vacío si la entrada no es válida
 */
export function deInputADdMmAaaa(valor) {
  const m = String(valor || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Convierte "dd/mm/aaaa" al formato que espera un <input type="date">. */
export function aInputDate(fechaNac) {
  const p = parseFechaNac(fechaNac);
  return p.anio ? `${p.anio}-${dos(p.mes)}-${dos(p.dia)}` : '';
}

/**
 * Descompone "dd/mm/aaaa" o "dd/mm".
 * @returns {{dia:number|null, mes:number|null, anio:number|null, valida:boolean}}
 */
export function parseFechaNac(texto) {
  const vacio = { dia: null, mes: null, anio: null, valida: false };
  const m = String(texto || '').trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!m) return vacio;

  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const anio = m[3] ? Number(m[3]) : null;

  if (mes < 1 || mes > 12) return vacio;
  if (dia < 1 || dia > diasDelMes(mes, anio || 2024)) return vacio;
  if (anio && (anio < 1900 || anio > hoyPartes().anio)) return vacio;

  return { dia, mes, anio, valida: true };
}

/** Días que tiene un mes. Usa 2024 (bisiesto) como referencia si no hay año. */
export function diasDelMes(mes, anio) {
  return new Date(anio, mes, 0).getDate();
}

export function esBisiesto(anio) {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

/**
 * Próximo cumpleaños a partir de hoy.
 * Si el del año en curso ya pasó, devuelve el del año que viene.
 * El 29/02 en año no bisiesto se considera 28/02.
 *
 * @param {{dia:number, mes:number}} nacimiento
 * @returns {{dia:number, mes:number, anio:number, iso:string, esteMes:boolean,
 *            yaPaso:boolean, faltan:number, esHoy:boolean}}
 */
export function proximoCumple(nacimiento) {
  const hoy = hoyPartes();
  const { dia, mes } = nacimiento;

  const ajustar = anio =>
    (mes === 2 && dia === 29 && !esBisiesto(anio)) ? 28 : dia;

  // ¿Ya pasó en el año en curso?
  const yaPasoEsteAnio =
    mes < hoy.mes || (mes === hoy.mes && ajustar(hoy.anio) < hoy.dia);

  const anio = yaPasoEsteAnio ? hoy.anio + 1 : hoy.anio;
  const diaFinal = ajustar(anio);

  const fecha = new Date(anio, mes - 1, diaFinal);
  const hoyFecha = new Date(hoy.anio, hoy.mes - 1, hoy.dia);
  const faltan = Math.round((fecha - hoyFecha) / 86400000);

  return {
    dia: diaFinal,
    mes,
    anio,
    iso: `${anio}-${dos(mes)}-${dos(diaFinal)}`,
    // "Este mes" es el mes calendario en curso, sin importar si ya pasó el día.
    esteMes: mes === hoy.mes,
    yaPaso: yaPasoEsteAnio,
    faltan,
    esHoy: faltan === 0
  };
}

/**
 * Considera contactado a quien tenga un contacto registrado en el año en curso.
 * Con esta regla el estado se reinicia solo cada 1° de enero.
 */
export function contactadoEsteAnio(ultimoContacto) {
  if (!ultimoContacto) return false;
  return String(ultimoContacto).slice(0, 4) === String(hoyPartes().anio);
}

/** Edad cumplida, o null si no se cargó el año. */
export function edad(nacimiento) {
  if (!nacimiento.anio) return null;
  const hoy = hoyPartes();
  let años = hoy.anio - nacimiento.anio;
  if (nacimiento.mes > hoy.mes || (nacimiento.mes === hoy.mes && nacimiento.dia > hoy.dia)) años--;
  return años;
}

/** "28 de julio" */
export function textoDiaMes(dia, mes) {
  return `${dia} de ${MESES[mes - 1]}`;
}

/** Nombre del mes en curso. */
export function mesActual() {
  return MESES[hoyPartes().mes - 1];
}
