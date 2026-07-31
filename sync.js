/**
 * BE WILD · Motor de sincronización
 * ----------------------------------------------------------------------------
 * Toma las operaciones que dejó la interfaz en la cola y las envía al servidor
 * en tandas, sin bloquear nada. Si algo falla, reintenta con esperas cada vez
 * más largas. La interfaz no espera a este módulo: se entera de los cambios de
 * estado por el callback de `alCambiar`.
 *
 * Este archivo no conoce las vistas ni el estado en memoria: solo la cola,
 * la base local y la API.
 */

import { cola, clientes as almacenClientes, meta, nuevoId } from './db.js?v=2.1.0';
import { api } from './api.js?v=2.1.0';
import { TIEMPOS } from './config.js?v=2.1.0';
import { log } from './logger.js?v=2.1.0';

const TAMANO_TANDA = 25;
const LATIDO = 3000;

let escuchas = [];
let corriendo = false;
let latido = null;

/** Estados posibles de un cliente respecto del servidor. */
export const ESTADOS = {
  PENDIENTE:     'pendiente',
  SINCRONIZANDO: 'sincronizando',
  SINCRONIZADO:  'sincronizado',
  ERROR:         'error'
};

/**
 * Se avisa cada vez que cambia el estado de sincronización de algo.
 * @param {(evento:{tipo:string, clienteId?:string, estado?:string, pendientes:number}) => void} fn
 */
export function alCambiar(fn) {
  escuchas.push(fn);
  return () => { escuchas = escuchas.filter(f => f !== fn); };
}

async function emitir(evento) {
  const pendientes = (await cola.todas()).length;
  escuchas.forEach(fn => {
    try { fn({ ...evento, pendientes }); } catch (e) { /* una escucha rota no frena al resto */ }
  });
}

/* ── Encolado ───────────────────────────────────────────────────────────── */

/**
 * Deja una operación lista para enviar. Devuelve enseguida: el envío ocurre
 * después, en segundo plano.
 *
 * @param {'alta'|'edicion'|'baja'|'contacto'} tipo
 * @param {Object} payload
 * @param {string} [clienteId]
 */
export async function encolar(tipo, payload, clienteId = payload.id) {
  const op = {
    opId: nuevoId(),
    tipo,
    payload,
    clienteId,
    intentos: 0,
    proximoIntento: 0,
    ultimoError: '',
    creadoEn: Date.now()
  };

  await cola.agregar(op);
  await emitir({ tipo: 'encolada', clienteId, estado: ESTADOS.PENDIENTE });
  procesar();
  return op.opId;
}

/* ── Procesamiento ──────────────────────────────────────────────────────── */

/**
 * Envía las operaciones vencidas. Es reentrante: si ya está corriendo, sale.
 */
export async function procesar() {
  if (corriendo || !navigator.onLine) return;

  const pendientes = (await cola.todas())
    .filter(op => op.proximoIntento <= Date.now())
    .sort((a, b) => a.creadoEn - b.creadoEn)
    .slice(0, TAMANO_TANDA);

  if (!pendientes.length) return;

  corriendo = true;
  try {
    for (const op of pendientes) {
      await emitir({ tipo: 'enviando', clienteId: op.clienteId, estado: ESTADOS.SINCRONIZANDO });
    }

    const respuesta = await api.lote(
      pendientes.map(op => ({ opId: op.opId, tipo: op.tipo, payload: op.payload }))
    );

    for (const resultado of respuesta.resultados) {
      const op = pendientes.find(o => o.opId === resultado.opId);
      if (!op) continue;

      if (resultado.ok) {
        await cola.quitar(op.opId);
        await marcarCliente(op.clienteId, ESTADOS.SINCRONIZADO);
        await emitir({ tipo: 'ok', clienteId: op.clienteId, estado: ESTADOS.SINCRONIZADO });
      } else {
        await posponer(op, resultado.error);
      }
    }

    await meta.escribir('ultimoEnvio', new Date().toISOString());

  } catch (err) {
    // Falló la llamada entera: se pospone toda la tanda.
    for (const op of pendientes) await posponer(op, err.message);
    log.warn('sync:tanda', { error: err.message, operaciones: pendientes.length });
  } finally {
    corriendo = false;
  }
}

/** Programa el siguiente intento de una operación fallida. */
async function posponer(op, error) {
  op.intentos += 1;
  op.ultimoError = String(error || '');
  const espera = TIEMPOS.reintentos[Math.min(op.intentos - 1, TIEMPOS.reintentos.length - 1)];
  op.proximoIntento = Date.now() + espera;

  await cola.guardar(op);
  await marcarCliente(op.clienteId, ESTADOS.ERROR);
  await emitir({ tipo: 'error', clienteId: op.clienteId, estado: ESTADOS.ERROR, error: op.ultimoError });

  if (op.intentos === 1 || op.intentos % 5 === 0) {
    log.error('sync:operacion', { tipo: op.tipo, intentos: op.intentos, error: op.ultimoError }, op.clienteId);
  }
}

/** Guarda el estado de sincronización dentro del cliente cacheado. */
async function marcarCliente(id, estado) {
  if (!id) return;
  const cliente = await almacenClientes.obtener(id);
  if (!cliente) return;
  cliente._sync = estado;
  await almacenClientes.guardar(cliente);
}

/* ── Descarga incremental ───────────────────────────────────────────────── */

/**
 * Trae del servidor lo que cambió desde la última vez. No pisa clientes que
 * tengan operaciones sin enviar: lo local siempre gana hasta que se sincroniza.
 *
 * @returns {Promise<{recibidos:number}>}
 */
export async function traerCambios() {
  if (!navigator.onLine) return { recibidos: 0 };

  const desde = await meta.leer('ultimaSync', null);
  const data = await api.listar(desde);

  const enCola = new Set((await cola.todas()).map(op => op.clienteId));
  const aGuardar = data.clientes
    .filter(c => !enCola.has(c.id))
    .map(c => ({ ...c, _sync: ESTADOS.SINCRONIZADO }));

  if (aGuardar.length) await almacenClientes.guardarVarios(aGuardar);
  await meta.escribir('ultimaSync', data.servidorEn);

  if (aGuardar.length) await emitir({ tipo: 'descarga', recibidos: aGuardar.length });
  return { recibidos: aGuardar.length, clientes: aGuardar };
}

/** Fuerza una descarga completa, ignorando el marcador incremental. */
export async function recargarTodo() {
  await meta.escribir('ultimaSync', null);
  return traerCambios();
}

/* ── Arranque ───────────────────────────────────────────────────────────── */

/** Pone en marcha el latido y los disparadores de reintento. */
export function iniciar() {
  if (latido) return;

  latido = setInterval(procesar, LATIDO);

  window.addEventListener('online', () => {
    log.info('sync:online', 'Conexión restablecida');
    procesar();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') procesar();
  });

  procesar();
}

/** Cantidad de operaciones esperando. */
export async function pendientes() {
  return (await cola.todas()).length;
}

/** Reintento manual: adelanta todas las esperas. */
export async function reintentarAhora() {
  const lista = await cola.todas();
  for (const op of lista) {
    op.proximoIntento = 0;
    await cola.guardar(op);
  }
  return procesar();
}

/**
 * Reintenta solo lo que quedó pendiente de un cliente.
 * Sirve para el botón que aparece en la fila cuando algo falló.
 */
export async function reintentarCliente(clienteId) {
  const lista = await cola.todas();
  let encontradas = 0;

  for (const op of lista) {
    if (op.clienteId !== clienteId) continue;
    op.proximoIntento = 0;
    op.intentos = 0;   // vuelve a arrancar con la espera más corta
    await cola.guardar(op);
    encontradas++;
  }

  await procesar();
  return encontradas;
}

/** Cuántas operaciones quedaron en estado de error. */
export async function conError() {
  return (await cola.todas()).filter(op => op.intentos > 0).length;
}
