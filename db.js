/**
 * BE WILD · Persistencia local (IndexedDB)
 * ----------------------------------------------------------------------------
 * Todo lo que el operador hace se escribe primero acá y recién después viaja al
 * servidor. Es lo que permite que la carga sea instantánea y que un corte de
 * internet no haga perder un solo cliente.
 *
 * Almacenes:
 *   clientes → la base completa, cacheada
 *   cola     → operaciones pendientes de enviar
 *   logs     → historial local de eventos
 *   meta     → marcadores internos (ej. fecha del último sync)
 */

const NOMBRE_BD = 'bewild';
const VERSION_BD = 1;

let bd = null;

/** Abre (y crea, si hace falta) la base local. */
export function abrir() {
  if (bd) return Promise.resolve(bd);

  return new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(NOMBRE_BD, VERSION_BD);

    peticion.onupgradeneeded = evento => {
      const db = evento.target.result;
      if (!db.objectStoreNames.contains('clientes')) {
        db.createObjectStore('clientes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('cola')) {
        db.createObjectStore('cola', { keyPath: 'opId' });
      }
      if (!db.objectStoreNames.contains('logs')) {
        db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'clave' });
      }
    };

    peticion.onsuccess = () => { bd = peticion.result; resolver(bd); };
    peticion.onerror = () => rechazar(peticion.error);
  });
}

/** Ejecuta una operación sobre un almacén y devuelve una promesa. */
async function conAlmacen(nombre, modo, fn) {
  const db = await abrir();
  return new Promise((resolver, rechazar) => {
    const tx = db.transaction(nombre, modo);
    const almacen = tx.objectStore(nombre);
    let resultado;
    try {
      resultado = fn(almacen);
    } catch (err) {
      rechazar(err);
      return;
    }
    tx.oncomplete = () => resolver(resultado && resultado.result !== undefined ? resultado.result : resultado);
    tx.onerror = () => rechazar(tx.error);
  });
}

/** Devuelve todo el contenido de un almacén como array. */
function todos(nombre) {
  return conAlmacen(nombre, 'readonly', almacen => almacen.getAll());
}

/* ── Clientes ───────────────────────────────────────────────────────────── */

export const clientes = {
  todos:    ()      => todos('clientes'),
  guardar:  (c)     => conAlmacen('clientes', 'readwrite', a => a.put(c)),
  guardarVarios: (lista) => conAlmacen('clientes', 'readwrite', a => { lista.forEach(c => a.put(c)); }),
  obtener:  (id)    => conAlmacen('clientes', 'readonly',  a => a.get(id)),
  borrar:   (id)    => conAlmacen('clientes', 'readwrite', a => a.delete(id)),
  vaciar:   ()      => conAlmacen('clientes', 'readwrite', a => a.clear())
};

/* ── Cola de sincronización ─────────────────────────────────────────────── */

export const cola = {
  todas:   ()     => todos('cola'),
  agregar: (op)   => conAlmacen('cola', 'readwrite', a => a.put(op)),
  guardar: (op)   => conAlmacen('cola', 'readwrite', a => a.put(op)),
  quitar:  (opId) => conAlmacen('cola', 'readwrite', a => a.delete(opId)),
  vaciar:  ()     => conAlmacen('cola', 'readwrite', a => a.clear())
};

/* ── Logs ───────────────────────────────────────────────────────────────── */

export const logs = {
  todos:   ()      => todos('logs'),
  agregar: (linea) => conAlmacen('logs', 'readwrite', a => a.add(linea)),
  vaciar:  ()      => conAlmacen('logs', 'readwrite', a => a.clear()),

  /** Recorta el historial local para que no crezca indefinidamente. */
  async recortar(maximo) {
    const lista = await todos('logs');
    if (lista.length <= maximo) return;
    const aBorrar = lista.slice(0, lista.length - maximo).map(l => l.id);
    return conAlmacen('logs', 'readwrite', a => { aBorrar.forEach(id => a.delete(id)); });
  }
};

/* ── Meta ───────────────────────────────────────────────────────────────── */

export const meta = {
  async leer(clave, porDefecto = null) {
    const fila = await conAlmacen('meta', 'readonly', a => a.get(clave));
    return fila && fila.valor !== undefined ? fila.valor : porDefecto;
  },
  escribir: (clave, valor) => conAlmacen('meta', 'readwrite', a => a.put({ clave, valor }))
};

/** Identificador único para clientes y operaciones. */
export function nuevoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
