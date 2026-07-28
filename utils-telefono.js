/**
 * BE WILD · Normalización de celulares
 * ----------------------------------------------------------------------------
 * El operador escribe como le sale. Este módulo se encarga de convertir eso a
 * un único formato canónico, que es a la vez el que necesita WhatsApp y la
 * clave con la que se detectan duplicados.
 *
 * Canónico: 549 + código de área + número, sin el 0 ni el 15. Ej.: 5491155551234
 *
 * Heurística: el local está en Lanús, así que cuando falta el código de área se
 * asume 11. Cuando el número no encaja en ningún patrón conocido se guarda
 * igual, pero marcado para revisar: nunca se pierde un dato por no entenderlo.
 */

const AREA_POR_DEFECTO = '11';

/**
 * @param {string} entrada
 * @returns {{valido:boolean, canonico:string, nacional:string, motivo:string, asumido:boolean}}
 */
export function normalizar(entrada) {
  const crudo = String(entrada || '');
  let d = crudo.replace(/\D/g, '');
  let asumido = false;

  if (!d) return fallo(crudo, 'Falta el número');

  // Prefijo internacional en cualquiera de sus formas.
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) d = d.slice(2);
  // El 9 de móvil solo se saca si lo que queda sigue siendo largo.
  if (d.startsWith('9') && d.length > 10) d = d.slice(1);

  // Cero inicial del código de área (011, 0221…).
  if (d.startsWith('0')) d = d.replace(/^0+/, '');

  // "15" al principio: en la zona significa área 11 con el prefijo viejo.
  if (d.startsWith('15') && d.length === 10) {
    d = AREA_POR_DEFECTO + d.slice(2);
    asumido = true;
  }

  // Solo el abonado, sin área.
  if (d.length === 8) {
    d = AREA_POR_DEFECTO + d;
    asumido = true;
  }

  // "11 15 5555 5555": el 15 quedó en el medio.
  if (d.length === 12 && d.slice(2, 4) === '15') {
    d = d.slice(0, 2) + d.slice(4);
  }
  if (d.length === 13 && d.slice(3, 5) === '15') {
    d = d.slice(0, 3) + d.slice(5);
  }

  if (d.length !== 10) {
    return fallo(crudo, d.length < 10 ? 'Faltan dígitos' : 'Sobran dígitos');
  }

  return {
    valido: true,
    canonico: '549' + d,
    nacional: d,
    motivo: '',
    asumido
  };
}

function fallo(crudo, motivo) {
  return {
    valido: false,
    canonico: crudo.replace(/\D/g, ''),
    nacional: '',
    motivo,
    asumido: false
  };
}

/**
 * Formato legible a partir del canónico: "11 5555-1234" o "221 555-1234".
 * El código de área solo tiene largo fijo conocido en el caso del 11; para el
 * resto se asumen 3 dígitos, que cubre a casi todo el país.
 * Si el número no es válido, se devuelve tal cual vino.
 */
export function mostrar(canonico) {
  const d = String(canonico || '').replace(/\D/g, '');
  if (d.length !== 13 || !d.startsWith('549')) return canonico || '';

  const n = d.slice(3);
  const largoArea = n.startsWith('11') ? 2 : 3;
  const area = n.slice(0, largoArea);
  const resto = n.slice(largoArea);

  return `${area} ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`;
}

/**
 * Link directo al chat de WhatsApp, con el mensaje ya cargado.
 * @param {string} canonico
 * @param {string} [mensaje]
 */
export function linkWhatsApp(canonico, mensaje = '') {
  const base = 'https://wa.me/' + String(canonico).replace(/\D/g, '');
  return mensaje ? `${base}?text=${encodeURIComponent(mensaje)}` : base;
}
