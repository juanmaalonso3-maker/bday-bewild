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
 */

import { clientes as almacen, nuevoId } from './db.js';
import * as sync from './sync.js';
import { log } from './logger.js';
import { ahoraISO, hoyISO, parseFechaNac, proximoCumple, contactadoEsteAnio,
         normalizarFechaHora, normalizarFecha } from './utils-fecha.js';
import { normalizar } from './utils-telefono.js';
import * as auth from './auth.js';

/** @type {Map<string, Object>} */
const memoria = new Map();
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
  listo = true;
  notificar();

  // El estado de sincronización de cada cliente cambia por su cuenta.
  sync.alCambiar(async evento => {
    if (evento.clienteId && memoria.has(evento.clienteId)) {
      memoria.get(evento.clienteId)._sync = evento.estado;
    }
    if (evento.tipo === 'descarga') await recargarDesdeCache();
    notificar();
  });

  sync.iniciar();
  refrescar();
}

/** Vuelve a leer IndexedDB hacia la memoria. */
async function recargarDesdeCache() {
  const guardados = await almacen.todos();
  memoria.clear();
  guardados.forEach(c => memoria.set(c.id, c));
}

/** Pide al servidor los cambios y actualiza la memoria. */
export async function refrescar() {
  try {
    const { recibidos } = await sync.traerCambios();
    if (recibidos) {
      await recargarDesdeCache();
      notificar();
    }
    return recibidos;
  } catch (err) {
    log.warn('store:refrescar', err.message);
    return 0;
  }
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

  return {
    ...c,
    fechaAlta,
    ultimoContacto,
    nombreCompleto: `${c.nombre || ''} ${c.apellido || ''}`.trim(),
    nacimiento,
    cumple,
    contactado: contactadoEsteAnio(ultimoContacto),
    estadoSync: c._sync || sync.ESTADOS.SINCRONIZADO
  };
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
  await sync.encolar('alta', paraServidor(cliente), cliente.id);
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
  await sync.encolar('edicion', paraServidor(actualizado), id);
  log.info('cliente:edicion', Object.keys(cambios), id);

  return decorar(actualizado);
}

/** Baja lógica: el registro queda en la planilla, marcado como inactivo. */
export async function darDeBaja(id) {
  const actual = memoria.get(id);
  if (!actual) throw new Error('Cliente no encontrado');

  const actualizado = { ...actual, activo: false, _sync: sync.ESTADOS.PENDIENTE };
  memoria.set(id, actualizado);
  notificar();

  await almacen.guardar(actualizado);
  await sync.encolar('baja', { id }, id);
  log.warn('cliente:baja', { nombre: actual.nombre, apellido: actual.apellido }, id);
}

/**
 * Marca o desmarca el contacto de cumpleaños.
 * @param {string} id
 * @param {boolean} contactado
 */
export async function marcarContacto(id, contactado) {
  const actual = memoria.get(id);
  if (!actual) throw new Error('Cliente no encontrado');

  const fecha = contactado ? hoyISO() : '';
  const actualizado = { ...actual, ultimoContacto: fecha, _sync: sync.ESTADOS.PENDIENTE };
  memoria.set(id, actualizado);
  notificar();

  await almacen.guardar(actualizado);
  await sync.encolar('contacto', { id, fecha }, id);
  log.info('cliente:contacto', { contactado }, id);
}

/** Quita los campos internos antes de mandar al servidor. */
function paraServidor(c) {
  const { _sync, nombreCompleto, nacimiento, cumple, contactado, estadoSync, ...limpio } = c;
  return limpio;
}
