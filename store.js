/**
 * BE WILD · Estado central
 * ----------------------------------------------------------------------------
 * Es la única fuente de verdad para las vistas. Ninguna vista habla con la API
 * ni con IndexedDB: todo pasa por acá.
 *
 * Flujo de una escritura (siempre optimista):
 *   1. Se actualiza la memoria     → la interfaz reacciona al instante
 *   2. Se persiste en IndexedDB    → sobrevive a cerrar el navegador
 *   3. Se encola para el servidor  → viaja cuando se pueda
 *
 * Además del estado actual de cada cliente, el store mantiene el HISTORIAL:
 * un registro por hecho (alta, edición, contacto, canje de voucher, baja) que
 * no se pisa nunca. La fila del cliente dice cómo está hoy; el historial dice
 * cómo se llegó hasta acá, año por año.
 */

import { clientes as almacen, historial as almacenHistorial, nuevoId } from './db.js?v=2.2.0';
import * as sync from './sync.js?v=2.2.0';
import { log } from './logger.js?v=2.2.0';
import { ahoraISO, hoyISO, parseFechaNac, proximoCumple, marcadoParaCiclo,
         cicloVigente, normalizarFechaHora, normalizarFecha } from './utils-fecha.js?v=2.2.0';
import { normalizar } from './utils-telefono.js?v=2.2.0';
import * as auth from './auth.js?v=2.2.0';

/** @type {Map<string, Object>} */
const memoria = new Map();
/** @type {Map<string, Object>} eventos de historial, por eventoId */
const eventos = new Map();
let suscriptores = [];
let listo = false;

/* ── Suscripción ────────────────────────────────────────────────────────── */

/**
 * Registra una función que se ejecuta ante cualquier cambio.
 * @returns {Function} función para darse de baja
 */
export function suscribir(fn) {
  suscriptores.push(fn);
  if (listo) fn();
  return () => { suscriptores = suscriptores.filter(f => f !== fn); };
}

function notificar() {
  suscriptores.forEach(fn => {
    try { fn(); } catch (e) { console.error('[store] suscriptor', e); }
  });
}

/* ── Arranque ───────────────────────────────────────────────────────────── */

/**
 * Levanta la cache local (instantáneo) y después pide al servidor lo que
 * falte (en segundo plano). La interfaz ya es usable después del primer paso.
 */
export async function iniciar() {
  const guardados = await almacen.todos();
  guardados.forEach(c => memoria.set(c.id, c));

  const historicos = await almacenHistorial.todos();
  historicos.forEach(e => eventos.set(e.eventoId, e));

  listo = true;
  notificar();

  // El estado de sincronización de cada cliente cambia por su cuenta.
  sync.alCambiar(async evento => {
    if (evento.clienteId && memoria.has(evento.clienteId)) {
      const cliente = memoria.get(evento.clienteId);
      cliente._sync = evento.estado;

      // Se conserva el motivo para poder mostrarlo en la fila. Al sincronizar
      // bien, se limpia: si no, quedaría un error viejo confundiendo.
      if (evento.error) cliente._error = evento.error;
      else if (evento.estado === sync.ESTADOS.SINCRONIZADO) delete cliente._error;
    }
    if (evento.tipo === 'descarga') await recargarDesdeCache();
    notificar();
  });

  sync.iniciar();
}

/**
 * Primera llamada al servidor de toda la sesión.
 *
 * Va separada de `iniciar()` a propósito. Antes el arranque disparaba tres
 * peticiones a la vez —la lista de clientes, el ping y la plantilla— y como
 * Apps Script ejecuta todo bajo la misma cuenta, hacían cola entre ellas. Con
 * los dos locales abriendo la app cerca en el tiempo eran seis ejecuciones
 * compitiendo, y las últimas se pasaban del timeout y ensuciaban la hoja de
 * Logs sin que hubiera nada roto.
 *
 * Ahora el arranque es UNA sola petición: clientes e historial juntos.
 *
 * @returns {Promise<{ok:boolean, error?:string, sesionRechazada?:boolean}>}
 */
export async function arrancar() {
  try {
    const resultado = await sync.traerCambios();
    await recargarDesdeCache();
    notificar();

    // Si quedó historial viejo por bajar, se sigue en segundo plano: la app ya
    // es usable con lo que llegó en esta primera tanda.
    if (resultado.masEventos) refrescar();

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
      sesionRechazada: err.name === 'ErrorSesion'
    };
  }
}

/** Vuelve a leer IndexedDB hacia la memoria. */
async function recargarDesdeCache() {
  const guardados = await almacen.todos();
  memoria.clear();
  guardados.forEach(c => memoria.set(c.id, c));

  const historicos = await almacenHistorial.todos();
  eventos.clear();
  historicos.forEach(e => eventos.set(e.eventoId, e));
}

let refrescoEnCurso = null;

/**
 * Pide al servidor los cambios y actualiza la memoria.
 *
 * La primera sincronización de una base con años de historial puede venir
 * cortada en tandas; en ese caso se sigue pidiendo hasta terminar, con un
 * tope por las dudas para no quedar en un bucle si el servidor se confunde.
 */
export async function refrescar() {
  // Candado: si el servidor está lento, el poll de cada minuto llegaría a
  // apilar peticiones encima de la anterior y a empeorar justo lo que quería
  // resolver. Mientras haya una en vuelo, las demás se cuelgan de esa misma.
  if (refrescoEnCurso) return refrescoEnCurso;

  refrescoEnCurso = (async () => {
    try {
      let total = 0;
      let vueltas = 0;
      let resultado;

      do {
        resultado = await sync.traerCambios();
        total += resultado.recibidos;
        vueltas++;
      } while (resultado.masEventos && vueltas < 20);

      if (total || resultado.eventos) {
        await recargarDesdeCache();
        notificar();
      }
      return total;
    } catch (err) {
      // Un corte puntual no se anota en la planilla: la app sigue funcionando
      // con la cache local y el próximo intento entra en un minuto. Solo se
      // registra lo que no es un problema pasajero de red.
      if (!err.temporal) log.warn('store:refrescar', err.message);
      return 0;
    } finally {
      refrescoEnCurso = null;
    }
  })();

  return refrescoEnCurso;
}

/* ── Lectura ────────────────────────────────────────────────────────────── */

/** Todos los clientes activos, con los campos derivados ya calculados. */
export function listar() {
  return [...memoria.values()]
    .filter(c => c.activo !== false)
    .map(decorar);
}

/** Incluye los dados de baja. Solo para diagnóstico. */
export function listarTodos() {
  return [...memoria.values()].map(decorar);
}

export function obtener(id) {
  const c = memoria.get(id);
  return c ? decorar(c) : null;
}

/** Cantidad de clientes cargados hoy. */
export function altasDeHoy() {
  const hoy = hoyISO();
  return listar()
    .filter(c => String(c.fechaAlta || '').slice(0, 10) === hoy)
    .sort((a, b) => String(b.fechaAlta).localeCompare(String(a.fechaAlta)));
}

/** Busca por celular ya normalizado. Sirve para detectar duplicados. */
export function buscarPorCelular(canonico) {
  if (!canonico) return null;
  return listar().find(c => c.celular === canonico) || null;
}

/** Busca por mail. Segunda vía para detectar un cliente repetido. */
export function buscarPorEmail(email) {
  const buscado = String(email || '').trim().toLowerCase();
  if (!buscado) return null;
  return listar().find(c => String(c.email || '').toLowerCase() === buscado) || null;
}

/**
 * Agrega los campos calculados que necesitan las vistas.
 * No se guardan: se derivan en cada lectura para que nunca queden viejos.
 */
function decorar(c) {
  const nacimiento = parseFechaNac(c.fechaNacimiento);
  const cumple = nacimiento.valida ? proximoCumple(nacimiento) : null;

  // Las fechas se unifican en la lectura: pueden venir de la planilla en
  // formatos distintos según cómo las haya guardado Sheets.
  const fechaAlta = normalizarFechaHora(c.fechaAlta);
  const ultimoContacto = normalizarFecha(c.ultimoContacto);
  const ultimoVoucher = normalizarFecha(c.ultimoVoucher);

  // El ciclo es el año de cumpleaños que está en juego hoy. Tanto el contacto
  // como el voucher son "uno por año" y se reinician solos.
  const mes = nacimiento.valida ? nacimiento.mes : null;
  const ciclo = cicloVigente(mes || 1);

  return {
    ...c,
    fechaAlta,
    ultimoContacto,
    ultimoVoucher,
    contactadoPor: c.contactadoPor || '',
    voucherPor: c.voucherPor || '',
    nombreCompleto: `${c.nombre || ''} ${c.apellido || ''}`.trim(),
    nacimiento,
    cumple,
    cicloVigente: ciclo,
    contactado: marcadoParaCiclo(ultimoContacto, mes, ciclo),
    voucherUsado: marcadoParaCiclo(ultimoVoucher, mes, ciclo),
    estadoSync: c._sync || sync.ESTADOS.SINCRONIZADO,
    errorSync: c._error || ''
  };
}

/* ── Historial ──────────────────────────────────────────────────────────── */

/** Cómo se lee cada tipo de evento en la línea de tiempo. */
export const ETIQUETAS_EVENTO = {
  'alta':               'Alta del cliente',
  'edicion':            'Datos editados',
  'baja':               'Dado de baja',
  'contacto':           'Contactada por el cumpleaños',
  'contacto-deshecho':  'Se deshizo la marca de contacto',
  'voucher':            'Usó el voucher',
  'voucher-deshecho':   'Se deshizo el uso del voucher'
};

/**
 * Historial completo de un cliente, del hecho más nuevo al más viejo.
 * Incluye los años anteriores: nada se borra ni se pisa.
 *
 * @param {string} clienteId
 * @returns {Array<Object>}
 */
export function historialDe(clienteId) {
  return [...eventos.values()]
    .filter(e => e.clienteId === clienteId)
    .sort((a, b) => {
      // Se ordena por la fecha del hecho; si dos caen el mismo día, manda el
      // momento en que se registró.
      const porFecha = String(b.fecha || '').localeCompare(String(a.fecha || ''));
      return porFecha !== 0 ? porFecha : String(b.creadoEn || '').localeCompare(String(a.creadoEn || ''));
    });
}

/** Cuántos eventos tiene un cliente. Sirve para el contador del botón. */
export function cantidadHistorial(clienteId) {
  let n = 0;
  eventos.forEach(e => { if (e.clienteId === clienteId) n++; });
  return n;
}

/** Todos los eventos, para métricas del dashboard. */
export function todosLosEventos() {
  return [...eventos.values()];
}

/**
 * Arma un evento, lo guarda local y lo devuelve para que viaje pegado a la
 * operación. El servidor le reescribe el usuario con el del token; acá se
 * anota el de la sesión para que el historial se vea bien al instante y
 * también sin internet.
 */
async function registrarEvento(clienteId, tipo, detalle = '', fecha = null) {
  const evento = {
    eventoId: nuevoId(),
    clienteId,
    fecha: fecha || hoyISO(),
    tipo,
    detalle: typeof detalle === 'object' ? JSON.stringify(detalle) : String(detalle || ''),
    usuario: auth.nombre(),
    sucursal: auth.sucursal(),
    creadoEn: new Date().toISOString()
  };

  eventos.set(evento.eventoId, evento);
  await almacenHistorial.guardar(evento);
  return evento;
}

/* ── Escritura ──────────────────────────────────────────────────────────── */

/**
 * Alta de un cliente. Devuelve enseguida, sin esperar al servidor.
 *
 * @param {{nombre, apellido, fechaNacimiento, celular, notas}} datos
 * @returns {Promise<Object>} el cliente creado
 */
export async function agregar(datos) {
  const tel = normalizar(datos.celular);

  const cliente = {
    id: nuevoId(),
    nombre: (datos.nombre || '').trim(),
    apellido: (datos.apellido || '').trim(),
    fechaNacimiento: (datos.fechaNacimiento || '').trim(),
    celular: tel.valido ? tel.canonico : String(datos.celular || '').replace(/\D/g, ''),
    email: (datos.email || '').trim().toLowerCase(),
    notas: (datos.notas || '').trim(),
    ultimoContacto: '',
    ultimoVoucher: '',
    contactadoPor: '',
    voucherPor: '',
    fechaAlta: ahoraISO(),
    // Quién y desde dónde. El servidor los reescribe con los datos del token,
    // así que no se puede falsear editando el JavaScript.
    usuario: auth.nombre(),
    sucursal: auth.sucursal(),
    activo: true,
    _sync: sync.ESTADOS.PENDIENTE
  };

  memoria.set(cliente.id, cliente);
  notificar();

  await almacen.guardar(cliente);
  const evento = await registrarEvento(cliente.id, 'alta');
  await sync.encolar('alta', { ...paraServidor(cliente), evento }, cliente.id);
  log.info('cliente:alta', { nombre: cliente.nombre, apellido: cliente.apellido }, cliente.id);

  return decorar(cliente);
}

/** Edición. Solo los campos que vengan en `cambios`. */
export async function editar(id, cambios) {
  const actual = memoria.get(id);
  if (!actual) throw new Error('Cliente no encontrado');

  if (cambios.celular !== undefined) {
    const tel = normalizar(cambios.celular);
    cambios.celular = tel.valido ? tel.canonico : String(cambios.celular).replace(/\D/g, '');
  }

  const actualizado = { ...actual, ...cambios, _sync: sync.ESTADOS.PENDIENTE };
  memoria.set(id, actualizado);
  notificar();

  await almacen.guardar(actualizado);
  const evento = await registrarEvento(id, 'edicion', camposCambiados(actual, cambios));
  await sync.encolar('edicion', { ...paraServidor(actualizado), evento }, id);
  log.info('cliente:edicion', Object.keys(cambios), id);

  return decorar(actualizado);
}

/** Resumen legible de qué se tocó, para que el historial sirva de algo. */
function camposCambiados(actual, cambios) {
  const nombres = {
    nombre: 'nombre', apellido: 'apellido', fechaNacimiento: 'fecha de nacimiento',
    celular: 'celular', email: 'email', notas: 'notas'
  };
  const tocados = Object.keys(cambios)
    .filter(k => String(actual[k] ?? '') !== String(cambios[k] ?? ''))
    .map(k => nombres[k] || k);
  return tocados.length ? 'Cambió ' + tocados.join(', ') : 'Sin cambios efectivos';
}

/** Baja lógica: el registro queda en la planilla, marcado como inactivo. */
export async function darDeBaja(id) {
  const actual = memoria.get(id);
  if (!actual) throw new Error('Cliente no encontrado');

  const actualizado = { ...actual, activo: false, _sync: sync.ESTADOS.PENDIENTE };
  memoria.set(id, actualizado);
  notificar();

  await almacen.guardar(actualizado);
  const evento = await registrarEvento(id, 'baja');
  await sync.encolar('baja', { id, evento }, id);
  log.warn('cliente:baja', { nombre: actual.nombre, apellido: actual.apellido }, id);
}

/**
 * Marca o desmarca el contacto de cumpleaños.
 *
 * @param {string} id
 * @param {boolean} contactado
 * @param {string} [fecha] aaaa-mm-dd. Por defecto hoy; se puede pasar una
 *                         fecha anterior desde el panel de historial.
 */
export async function marcarContacto(id, contactado, fecha = null) {
  const actual = memoria.get(id);
  if (!actual) throw new Error('Cliente no encontrado');

  const cuando = contactado ? (fecha || hoyISO()) : '';
  const actualizado = {
    ...actual,
    ultimoContacto: cuando,
    contactadoPor: contactado ? auth.nombre() : '',
    _sync: sync.ESTADOS.PENDIENTE
  };
  memoria.set(id, actualizado);
  notificar();

  await almacen.guardar(actualizado);
  const evento = await registrarEvento(
    id,
    contactado ? 'contacto' : 'contacto-deshecho',
    '',
    contactado ? cuando : hoyISO()
  );
  await sync.encolar('contacto', { id, fecha: cuando, evento }, id);
  log.info('cliente:contacto', { contactado, fecha: cuando }, id);
}

/**
 * Registra (o borra) el uso del voucher de cumpleaños.
 *
 * La fecha puede ser anterior a hoy: alguien que cumplió en septiembre puede
 * venir a canjearlo en octubre, y para medir la campaña importa el día real
 * del canje, no el día en que se acordaron de tildarlo.
 *
 * @param {string} id
 * @param {boolean} usado
 * @param {string} [fecha] aaaa-mm-dd. Por defecto hoy.
 */
export async function marcarVoucher(id, usado, fecha = null) {
  const actual = memoria.get(id);
  if (!actual) throw new Error('Cliente no encontrado');

  const cuando = usado ? (fecha || hoyISO()) : '';
  const actualizado = {
    ...actual,
    ultimoVoucher: cuando,
    voucherPor: usado ? auth.nombre() : '',
    _sync: sync.ESTADOS.PENDIENTE
  };
  memoria.set(id, actualizado);
  notificar();

  await almacen.guardar(actualizado);
  const evento = await registrarEvento(
    id,
    usado ? 'voucher' : 'voucher-deshecho',
    '',
    usado ? cuando : hoyISO()
  );
  await sync.encolar('voucher', { id, fecha: cuando, evento }, id);
  log.info('cliente:voucher', { usado, fecha: cuando }, id);
}

/**
 * Vuelve a intentar el envío de un cliente que quedó con error.
 * @returns {Promise<number>} operaciones reencoladas
 */
export async function reintentar(id) {
  const cliente = memoria.get(id);
  if (cliente) {
    cliente._sync = sync.ESTADOS.SINCRONIZANDO;
    delete cliente._error;
    notificar();
  }
  return sync.reintentarCliente(id);
}

/** Reintenta todo lo que haya quedado pendiente. */
export async function reintentarTodo() {
  return sync.reintentarAhora();
}

/** Clientes que no se pudieron enviar. */
export function conError() {
  return listar().filter(c => c.estadoSync === sync.ESTADOS.ERROR);
}

/** Quita los campos internos antes de mandar al servidor. */
function paraServidor(c) {
  const {
    _sync, _error, nombreCompleto, nacimiento, cumple, cicloVigente,
    contactado, voucherUsado, estadoSync, errorSync, ...limpio
  } = c;
  return limpio;
}
