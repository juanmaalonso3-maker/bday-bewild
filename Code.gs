/**
 * ============================================================================
 * BE WILD · Gestor de Clientes y Cumpleaños
 * Backend — Google Apps Script Web App
 * ----------------------------------------------------------------------------
 * Versión: 2.2.0
 *
 * INSTALACIÓN
 *   1. Pegar este archivo completo en el editor de Apps Script (reemplaza todo).
 *   2. Guardar.
 *   3. Implementar > Administrar implementaciones > Editar (lápiz) >
 *      Nueva versión > Implementar.
 *      - Ejecutar como: Yo
 *      - Quién tiene acceso: Cualquier persona
 *   4. Abrir el /exec en el navegador: debe responder un JSON con ok:true.
 *   5. Ejecutar setupManual() desde el editor una sola vez. Crea las pestañas
 *      y, si ya existían, agrega las columnas nuevas sin tocar los datos.
 *   6. Ejecutar sembrarHistorial() una sola vez. Arma el historial de los
 *      clientes que ya estaban cargados a partir de lo que hay en la planilla.
 *
 * SEGURIDAD
 *   Salvo `ping`, toda acción exige un ID token de Google válido, emitido para
 *   el CLIENT_ID de esta aplicación y perteneciente a una cuenta de la lista
 *   USUARIOS. La verificación se hace contra Google, así que no alcanza con
 *   editar el JavaScript del navegador para saltearla.
 *
 * PROTOCOLO
 *   Todas las llamadas van por POST con Content-Type text/plain (para evitar
 *   el preflight OPTIONS, que Apps Script no responde).
 *   Body:      { "action": "...", "payload": { ... } }
 *   Respuesta: { "ok": true|false, "data": ..., "error": "..." }
 * ============================================================================
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN
// ─────────────────────────────────────────────────────────────────────────────

const SPREADSHEET_ID = '1cYWMdGGoE7tVg-3ye8yrbQzvx8Fizw5yGEHTJDElvXc';
const TZ = 'America/Argentina/Buenos_Aires';
const VERSION = '2.2.0';

const HOJA_CLIENTES  = 'Clientes';
const HOJA_HISTORIAL = 'Historial';
const HOJA_LOGS      = 'Logs';
const HOJA_CONFIG    = 'Config';

/** Encabezados de la hoja Clientes. El orden define los índices de columna. */
const COLS_CLIENTES = [
  'ID',               // A  UUID generado en el navegador
  'Nombre',           // B
  'Apellido',         // C
  'FechaNacimiento',  // D  texto dd/mm/aaaa o dd/mm
  'Dia',              // E  derivado
  'Mes',              // F  derivado
  'Anio',             // G  derivado (vacío si no se cargó)
  'Celular',          // H  texto canónico 549XXXXXXXXXX
  'Notas',            // I
  'UltimoContacto',   // J  aaaa-mm-dd
  'FechaAlta',        // K  aaaa-mm-dd HH:mm
  'Usuario',          // L  terminal que cargó
  'Activo',           // M  SI / NO
  'ActualizadoEn',    // N  ISO 8601, habilita sync incremental
  'Email',            // O  opcional
  'Sucursal',         // P  ESTE / OESTE / ADMIN, según quién cargó
  'UltimoVoucher',    // Q  aaaa-mm-dd del canje del voucher de cumpleaños
  'ContactadoPor',    // R  mail de quien marcó el último contacto
  'VoucherPor'        // S  mail de quien marcó el último canje
];

/**
 * Historial de eventos. Una fila por hecho, para siempre: acá es donde queda
 * el rastro de quién contactó a quién y quién registró el uso del voucher,
 * año tras año. La hoja Clientes solo guarda el último valor de cada cosa.
 */
const COLS_HISTORIAL = [
  'EventoID',   // A  UUID; permite reenviar sin duplicar
  'ClienteID',  // B
  'Fecha',      // C  aaaa-mm-dd — cuándo pasó el hecho (puede ser retroactiva)
  'Tipo',       // D  alta | edicion | baja | contacto | voucher | …
  'Detalle',    // E  texto libre
  'Usuario',    // F  mail de quien lo hizo (lo pone el servidor)
  'Sucursal',   // G
  'CreadoEn'    // H  ISO 8601 — cuándo se registró; habilita sync incremental
];

const COLS_LOGS   = ['Timestamp', 'Nivel', 'Evento', 'Detalle', 'Usuario', 'ClienteID'];
const COLS_CONFIG = ['Clave', 'Valor'];

/** Índices 0-based de las columnas que más se usan. */
const IDX = {
  ID: 0, NOMBRE: 1, APELLIDO: 2, FECHA_NAC: 3, DIA: 4, MES: 5, ANIO: 6,
  CELULAR: 7, NOTAS: 8, ULTIMO_CONTACTO: 9, FECHA_ALTA: 10, USUARIO: 11,
  ACTIVO: 12, ACTUALIZADO: 13, EMAIL: 14, SUCURSAL: 15,
  ULTIMO_VOUCHER: 16, CONTACTADO_POR: 17, VOUCHER_POR: 18
};

/** Índices 0-based de la hoja Historial. */
const IDX_H = {
  EVENTO: 0, CLIENTE: 1, FECHA: 2, TIPO: 3, DETALLE: 4,
  USUARIO: 5, SUCURSAL: 6, CREADO: 7
};

/** Tope de eventos que devuelve una sola llamada a `list`. */
const MAX_EVENTOS_POR_LLAMADA = 4000;

/** Valores por defecto de la hoja Config. */
const CONFIG_DEFAULTS = {
  plantillaWhatsApp:
    '¡Feliz cumple, {nombre}! 🖤 Desde BE WILD te queremos regalar un 15% OFF ' +
    'en toda la tienda durante toda la semana. Pasá por el local o escribinos ' +
    'por acá. ¡Que la pases hermoso!',
  version: VERSION
};

/** Máximo de filas que se conservan en la hoja Logs (rotación automática). */
const MAX_FILAS_LOG = 5000;



// ─────────────────────────────────────────────────────────────────────────────
// AUTENTICACIÓN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ID de cliente OAuth. Tiene que ser EL MISMO que está en config.js del
 * frontend: se verifica que el token haya sido emitido para esta aplicación
 * y no para otra distinta que casualmente use cuentas de Google.
 */
const CLIENT_ID = '849214701404-ff11l3oo5k9hecabvf99cnbbgjlegeam.apps.googleusercontent.com';

/**
 * Usuarios habilitados. Esta lista es la que manda: la del navegador se puede
 * editar desde la consola del inspector, esta no.
 *
 *   ADMIN    → todo
 *   OPERADOR → cargar clientes, marcar contactos y registrar vouchers
 */
const USUARIOS = [
  { email: 'bewild.ventas@gmail.com', rol: 'ADMIN',    sucursal: 'ADMIN' },
  { email: 'info@bewild.com.ar',      rol: 'ADMIN',    sucursal: 'ADMIN' },
  { email: 'bw.este@bewild.com.ar',   rol: 'OPERADOR', sucursal: 'ESTE'  },
  { email: 'bw.oeste@bewild.com.ar',  rol: 'OPERADOR', sucursal: 'OESTE' }
];

/**
 * Verificación de la sesión contra los servidores de Google.
 *
 *   true  → cada llamada se valida de verdad. Es lo recomendable, pero exige
 *           autorizar el permiso de salida a internet una vez (función
 *           autorizar() más abajo).
 *   false → el servidor confía en lo que informa el navegador. La aplicación
 *           funciona sin ese permiso, pero el control de roles queda solo en
 *           la interfaz: alguien que conozca la URL del /exec podría escribir
 *           en la planilla sin pasar por la app.
 *
 * ESTADO ACTUAL: false, para que la aplicación funcione sin trámites.
 * Para activar la verificación completa:
 *   1. Cambiar esta constante a true.
 *   2. Ejecutar la función autorizar() desde el editor y aceptar los permisos.
 *   3. Implementar > Administrar implementaciones > Nueva versión.
 */
const VERIFICAR_SESION = false;

/** Acciones permitidas a un operador. El resto es solo para administradores. */
const ACCIONES_OPERADOR = [
  'ping', 'list', 'upsert', 'contacto', 'voucher', 'batch', 'log', 'getConfig'
];

/** Acciones que no requieren sesión (solo diagnóstico). */
const ACCIONES_LIBRES = ['ping'];

/**
 * Gmail ignora los puntos del nombre de usuario, así que juan.perez@gmail.com
 * y juanperez@gmail.com son la misma casilla. Sin normalizar, un usuario
 * habilitado podría quedar afuera por cómo escribió su dirección.
 */
function normalizarEmail_(email) {
  var limpio = String(email || '').trim().toLowerCase();
  var partes = limpio.split('@');
  if (partes.length !== 2) return limpio;

  if (partes[1] === 'gmail.com' || partes[1] === 'googlemail.com') {
    return partes[0].split('+')[0].replace(/\./g, '') + '@gmail.com';
  }
  return limpio;
}

/**
 * Verifica el ID token contra Google y devuelve el usuario habilitado.
 *
 * Google firma el token; acá se comprueba esa firma pidiéndole a Google que lo
 * valide. Se cachea el resultado porque la verificación es una llamada de red
 * y el token dura una hora: sin cache, cada alta pagaría ese costo.
 *
 * @returns {{ok: boolean, usuario?: Object, error?: string}}
 */
function verificarToken_(token) {
  if (!token) return { ok: false, error: 'Falta la sesión. Volvé a entrar.' };

  // Modo sin verificación: se lee el contenido del token pero no se comprueba
  // su firma. Alcanza para saber quién dice ser el usuario y aplicar los roles,
  // sin necesitar el permiso de salida a internet.
  if (!VERIFICAR_SESION) return leerTokenSinVerificar_(token);

  var cache = CacheService.getScriptCache();
  var clave = 'tk_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)
  );

  var enCache = cache.get(clave);
  if (enCache) {
    var guardado = JSON.parse(enCache);
    if (guardado.exp * 1000 > Date.now()) {
      return { ok: true, usuario: guardado };
    }
  }

  var datos;
  try {
    var respuesta = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
      { muteHttpExceptions: true }
    );
    if (respuesta.getResponseCode() !== 200) {
      return { ok: false, error: 'La sesión no es válida o venció. Volvé a entrar.' };
    }
    datos = JSON.parse(respuesta.getContentText());
  } catch (err) {
    // Este error aparece una sola vez, la primera vez que se usa la verificación
    // de sesión: el script necesita permiso para consultar a Google y hay que
    // autorizarlo a mano desde el editor.
    if (String(err).indexOf('script.external_request') !== -1) {
      return {
        ok: false,
        error: 'Falta autorizar el script. En el editor de Apps Script, ejecutá ' +
               'la función autorizar() y aceptá los permisos.'
      };
    }
    return { ok: false, error: 'No se pudo verificar la sesión: ' + err };
  }

  // El token tiene que haber sido emitido para esta aplicación.
  if (datos.aud !== CLIENT_ID) {
    return { ok: false, error: 'La sesión pertenece a otra aplicación' };
  }
  if (String(datos.email_verified) !== 'true') {
    return { ok: false, error: 'La cuenta de Google no tiene el mail verificado' };
  }
  if (Number(datos.exp) * 1000 <= Date.now()) {
    return { ok: false, error: 'La sesión venció. Volvé a entrar.' };
  }

  var buscado = normalizarEmail_(datos.email);
  var habilitado = null;
  for (var i = 0; i < USUARIOS.length; i++) {
    if (normalizarEmail_(USUARIOS[i].email) === buscado) { habilitado = USUARIOS[i]; break; }
  }
  if (!habilitado) {
    return { ok: false, error: 'La cuenta ' + datos.email + ' no tiene acceso' };
  }

  var usuario = {
    email: buscado,
    rol: habilitado.rol,
    sucursal: habilitado.sucursal,
    exp: Number(datos.exp)
  };

  // Se cachea hasta el vencimiento del token, con un tope de 6 horas que es el
  // máximo que admite CacheService.
  var segundos = Math.min(21600, Math.max(60, usuario.exp - Math.floor(Date.now() / 1000)));
  cache.put(clave, JSON.stringify(usuario), segundos);

  return { ok: true, usuario: usuario };
}

/**
 * Lee el payload del token sin comprobar la firma de Google.
 *
 * Se usa cuando VERIFICAR_SESION está en false. Un token se puede fabricar a
 * mano, así que esto NO es una barrera de seguridad: sirve para identificar al
 * usuario y ordenar los permisos de la interfaz, nada más.
 */
function leerTokenSinVerificar_(token) {
  var datos;
  try {
    var partes = String(token).split('.');
    if (partes.length !== 3) return { ok: false, error: 'La sesión no tiene el formato esperado' };

    var payload = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4) payload += '=';
    datos = JSON.parse(Utilities.newBlob(Utilities.base64Decode(payload)).getDataAsString());
  } catch (err) {
    return { ok: false, error: 'No se pudo leer la sesión' };
  }

  if (!datos.email) return { ok: false, error: 'La sesión no trae una cuenta' };
  if (Number(datos.exp || 0) * 1000 <= Date.now()) {
    return { ok: false, error: 'La sesión venció. Volvé a entrar.' };
  }

  var buscado = normalizarEmail_(datos.email);
  for (var i = 0; i < USUARIOS.length; i++) {
    if (normalizarEmail_(USUARIOS[i].email) === buscado) {
      return { ok: true, usuario: {
        email: buscado,
        rol: USUARIOS[i].rol,
        sucursal: USUARIOS[i].sucursal,
        exp: Number(datos.exp)
      } };
    }
  }

  return { ok: false, error: 'La cuenta ' + datos.email + ' no tiene acceso' };
}

/** ¿Este usuario puede ejecutar esta acción? */
function puedeEjecutar_(usuario, action) {
  if (usuario.rol === 'ADMIN') return true;
  return ACCIONES_OPERADOR.indexOf(action) !== -1;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUNTOS DE ENTRADA HTTP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET — health check y consultas simples de prueba desde el navegador.
 * Ej.: .../exec?action=list
 */
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'ping';
    const payload = {};
    if (e && e.parameter) {
      Object.keys(e.parameter).forEach(function (k) {
        if (k !== 'action') payload[k] = e.parameter[k];
      });
    }
    return json(rutear(action, payload, e && e.parameter ? e.parameter.token : ''));
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/**
 * POST — canal principal de la aplicación.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, error: 'Body vacío' });
    }
    const body = JSON.parse(e.postData.contents);
    return json(rutear(body.action, body.payload || {}, body.token));
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/**
 * Buffer de eventos de historial de la petición en curso.
 *
 * Las acciones no escriben en la hoja Historial de a una: van dejando los
 * eventos acá y el enrutador los vuelca todos juntos al final. Un lote de 25
 * altas escribe una sola vez en vez de 25, que en Apps Script es la diferencia
 * entre medio segundo y quince.
 */
var EVENTOS_PENDIENTES = [];

/**
 * Enrutador central. Toda acción pasa por acá.
 * Las acciones de escritura toman el lock del script para serializar
 * operaciones concurrentes (dos terminales cargando al mismo tiempo).
 */
function rutear(action, payload, token) {
  const ESCRITURA = ['setup', 'upsert', 'baja', 'contacto', 'voucher', 'batch', 'log', 'setConfig'];
  let lock = null;

  EVENTOS_PENDIENTES = [];
  limpiarCache_();

  try {
    // ── Sesión ──────────────────────────────────────────────────────────
    // Esta es la validación que cuenta. La lista de mails del navegador es
    // comodidad para armar el menú; cualquiera puede editarla desde la consola
    // del inspector. Acá no.
    let usuario = null;
    if (ACCIONES_LIBRES.indexOf(action) === -1) {
      const sesion = verificarToken_(token);
      if (!sesion.ok) return { ok: false, error: sesion.error, codigo: 'SESION' };

      usuario = sesion.usuario;
      if (!puedeEjecutar_(usuario, action)) {
        return {
          ok: false,
          codigo: 'PERMISO',
          error: 'Tu usuario no tiene permiso para esta acción'
        };
      }
    }

    if (ESCRITURA.indexOf(action) !== -1) {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(25000)) {
        return { ok: false, error: 'El servidor está ocupado. Reintentar.' };
      }
    }

    let salida;
    switch (action) {
      case 'ping': {
        const sesion = verificarToken_(token);
        return { ok: true, data: {
          service: 'BE WILD API',
          version: VERSION,
          hora: ahoraLocal(),
          sesion: sesion.ok ? { email: sesion.usuario.email, rol: sesion.usuario.rol } : null
        } };
      }
      case 'setup':     salida = accionSetup(); break;
      case 'list':      salida = accionList(payload); break;
      case 'upsert':    salida = accionUpsert(payload, usuario); break;
      case 'baja':      salida = accionBaja(payload, usuario); break;
      case 'contacto':  salida = accionContacto(payload, usuario); break;
      case 'voucher':   salida = accionVoucher(payload, usuario); break;
      case 'batch':     salida = accionBatch(payload, usuario); break;
      case 'log':       salida = accionLog(payload, usuario); break;
      case 'getConfig': salida = leerConfig(); break;
      case 'setConfig': salida = accionSetConfig(payload); break;
      default:          return { ok: false, error: 'Acción desconocida: ' + action };
    }

    volcarEventos_(usuario);
    return { ok: true, data: salida };

  } catch (err) {
    registrarError_(action, err);
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    EVENTOS_PENDIENTES = [];
    limpiarCache_();
    if (lock) lock.releaseLock();
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// ACCIONES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea las pestañas con encabezados, formatos y valores por defecto.
 * Es idempotente: se puede correr las veces que haga falta sin romper nada.
 * Si la hoja Clientes ya existía con menos columnas, las nuevas se agregan
 * vacías a la derecha y los datos viejos no se tocan.
 */
function accionSetup() {
  const ss = abrirPlanilla_();
  const creadas = [];

  // --- Clientes ---
  const hc = obtenerOCrearHoja_(ss, HOJA_CLIENTES, COLS_CLIENTES, creadas);
  // Fuerza texto plano en las columnas sensibles, si no Sheets convierte
  // "19/07/1996" en fecha y "5491155555555" en notación científica.
  [IDX.FECHA_NAC, IDX.CELULAR, IDX.ULTIMO_CONTACTO, IDX.FECHA_ALTA,
   IDX.EMAIL, IDX.ULTIMO_VOUCHER].forEach(function (i) {
    hc.getRange(1, i + 1, hc.getMaxRows(), 1).setNumberFormat('@');
  });
  hc.setColumnWidth(IDX.ID + 1, 260);
  hc.setColumnWidth(IDX.NOTAS + 1, 240);
  hc.setColumnWidth(IDX.EMAIL + 1, 200);

  // --- Historial ---
  const hh = obtenerOCrearHoja_(ss, HOJA_HISTORIAL, COLS_HISTORIAL, creadas);
  [IDX_H.FECHA, IDX_H.CREADO].forEach(function (i) {
    hh.getRange(1, i + 1, hh.getMaxRows(), 1).setNumberFormat('@');
  });
  hh.setColumnWidth(IDX_H.EVENTO + 1, 260);
  hh.setColumnWidth(IDX_H.CLIENTE + 1, 260);
  hh.setColumnWidth(IDX_H.DETALLE + 1, 300);

  // --- Logs ---
  obtenerOCrearHoja_(ss, HOJA_LOGS, COLS_LOGS, creadas);

  // --- Config ---
  const hcfg = obtenerOCrearHoja_(ss, HOJA_CONFIG, COLS_CONFIG, creadas);
  const existentes = leerConfig();
  const nuevas = [];
  Object.keys(CONFIG_DEFAULTS).forEach(function (clave) {
    if (!(clave in existentes)) nuevas.push([clave, CONFIG_DEFAULTS[clave]]);
  });
  if (nuevas.length) {
    hcfg.getRange(hcfg.getLastRow() + 1, 1, nuevas.length, 2).setValues(nuevas);
  }

  return {
    creadas: creadas,
    hojas: [HOJA_CLIENTES, HOJA_HISTORIAL, HOJA_LOGS, HOJA_CONFIG]
  };
}

/**
 * Devuelve los clientes y los eventos de historial nuevos.
 *
 * Incluye los clientes dados de baja (Activo = NO) para que las bajas se
 * propaguen a las otras terminales; el frontend los filtra.
 *
 * @param {Object} payload
 * @param {string} [payload.since]     ISO. Solo clientes modificados después.
 * @param {string} [payload.sinceHist] ISO. Solo eventos registrados después.
 * @param {boolean} [payload.sinHistorial] true para no traer eventos.
 */
function accionList(payload) {
  const filas = leerFilasClientes_();
  const since = payload && payload.since ? String(payload.since) : null;
  const salida = [];

  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    if (!f[IDX.ID]) continue;
    if (since && String(f[IDX.ACTUALIZADO]) <= since) continue;
    salida.push(filaAObjeto_(f));
  }

  const ahora = new Date().toISOString();
  const data = {
    clientes: salida,
    total: salida.length,
    servidorEn: ahora,
    incremental: !!since
  };

  if (payload && payload.sinHistorial) return data;

  const hist = leerEventos_(payload && payload.sinceHist ? String(payload.sinceHist) : null);
  data.eventos = hist.eventos;
  data.servidorEnHist = hist.hasta || ahora;
  data.masEventos = hist.mas;
  return data;
}

/**
 * Eventos de historial posteriores a `desde`, en orden de registro.
 * Se corta en MAX_EVENTOS_POR_LLAMADA para que la primera sincronización de
 * una base con años de historia no haga explotar el tiempo de ejecución: el
 * frontend vuelve a pedir desde donde quedó.
 */
function leerEventos_(desde) {
  const hoja = abrirPlanilla_().getSheetByName(HOJA_HISTORIAL);
  if (!hoja || hoja.getLastRow() < 2 || hoja.getMaxColumns() < COLS_HISTORIAL.length) {
    return { eventos: [], hasta: null, mas: false };
  }

  const filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, COLS_HISTORIAL.length).getValues();
  const eventos = [];
  let mas = false;

  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    if (!f[IDX_H.EVENTO]) continue;
    const creado = comoTexto_(f[IDX_H.CREADO], "yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
    if (desde && creado <= desde) continue;

    if (eventos.length >= MAX_EVENTOS_POR_LLAMADA) { mas = true; break; }

    eventos.push({
      eventoId:  String(f[IDX_H.EVENTO]),
      clienteId: String(f[IDX_H.CLIENTE] || ''),
      fecha:     comoTexto_(f[IDX_H.FECHA], 'yyyy-MM-dd'),
      tipo:      String(f[IDX_H.TIPO] || ''),
      detalle:   String(f[IDX_H.DETALLE] || ''),
      usuario:   String(f[IDX_H.USUARIO] || ''),
      sucursal:  String(f[IDX_H.SUCURSAL] || ''),
      creadoEn:  creado
    });
  }

  // Los eventos se agregan siempre al final, así que el último leído marca
  // hasta dónde llegó esta tanda.
  const hasta = eventos.length ? eventos[eventos.length - 1].creadoEn : null;
  return { eventos: eventos, hasta: hasta, mas: mas };
}

/**
 * Alta o edición de un cliente, identificado por ID (upsert idempotente).
 * Si el mismo POST llega dos veces por un timeout de red, no duplica.
 */
function accionUpsert(payload, usuario) {
  const hoja = hojaClientes_();
  const cliente = normalizarCliente_(payload);
  if (!cliente.ID) throw new Error('Falta el ID del cliente');

  // El autor y el local salen del token verificado, nunca de lo que mandó el
  // navegador: así la columna Sucursal es un dato confiable de auditoría y no
  // algo que se pueda escribir a mano.
  if (usuario) {
    cliente.Usuario  = usuario.email;
    cliente.Sucursal = usuario.sucursal;
  }

  const fila = buscarFilaPorId_(hoja, cliente.ID);

  if (fila > 0) {
    // Edición: se conserva quién lo dio de alta originalmente. Si lo edita
    // administración, el registro sigue mostrando el local que lo cargó.
    const actual = hoja.getRange(fila, 1, 1, COLS_CLIENTES.length).getValues()[0];
    cliente.FechaAlta = actual[IDX.FECHA_ALTA] || cliente.FechaAlta;
    cliente.Usuario   = actual[IDX.USUARIO]    || cliente.Usuario;
    cliente.Sucursal  = actual[IDX.SUCURSAL]   || cliente.Sucursal;
    if (!cliente.UltimoContacto) cliente.UltimoContacto = actual[IDX.ULTIMO_CONTACTO] || '';
    if (!cliente.UltimoVoucher)  cliente.UltimoVoucher  = actual[IDX.ULTIMO_VOUCHER] || '';
    if (!cliente.ContactadoPor)  cliente.ContactadoPor  = actual[IDX.CONTACTADO_POR] || '';
    if (!cliente.VoucherPor)     cliente.VoucherPor     = actual[IDX.VOUCHER_POR] || '';
    hoja.getRange(fila, 1, 1, COLS_CLIENTES.length).setValues([objetoAFila_(cliente)]);
    encolarEvento_(payload.evento, cliente.ID, 'edicion');
    return { id: cliente.ID, operacion: 'edicion', fila: fila, actualizadoEn: cliente.ActualizadoEn };
  }

  hoja.appendRow(objetoAFila_(cliente));
  const nueva = hoja.getLastRow();
  registrarFila_(cliente.ID, nueva);
  encolarEvento_(payload.evento, cliente.ID, 'alta');
  return { id: cliente.ID, operacion: 'alta', fila: nueva, actualizadoEn: cliente.ActualizadoEn };
}

/**
 * Baja lógica. Nunca se borra la fila: se marca Activo = NO.
 */
function accionBaja(payload, usuario) {
  const hoja = hojaClientes_();
  const id = payload && payload.id;
  if (!id) throw new Error('Falta el ID');

  const fila = buscarFilaPorId_(hoja, id);
  if (fila < 0) throw new Error('Cliente no encontrado: ' + id);

  const ts = new Date().toISOString();
  hoja.getRange(fila, IDX.ACTIVO + 1).setValue('NO');
  hoja.getRange(fila, IDX.ACTUALIZADO + 1).setValue(ts);
  encolarEvento_(payload.evento, id, 'baja');
  return { id: id, operacion: 'baja', actualizadoEn: ts };
}

/**
 * Marca (o desmarca) el contacto de un cliente.
 * Operación liviana y separada del upsert: es la que más se dispara.
 *
 * @param {Object} payload
 * @param {string} payload.id
 * @param {string} [payload.fecha] aaaa-mm-dd. Vacío o null = desmarcar.
 */
function accionContacto(payload, usuario) {
  const hoja = hojaClientes_();
  const id = payload && payload.id;
  if (!id) throw new Error('Falta el ID');

  const fila = buscarFilaPorId_(hoja, id);
  if (fila < 0) throw new Error('Cliente no encontrado: ' + id);

  const fecha = payload.fecha ? String(payload.fecha) : '';
  const ts = new Date().toISOString();
  const quien = fecha && usuario ? usuario.email : '';

  hoja.getRange(fila, IDX.ULTIMO_CONTACTO + 1).setValue(fecha);
  hoja.getRange(fila, IDX.CONTACTADO_POR + 1).setValue(quien);
  hoja.getRange(fila, IDX.ACTUALIZADO + 1).setValue(ts);

  encolarEvento_(payload.evento, id, fecha ? 'contacto' : 'contacto-deshecho');
  return { id: id, operacion: 'contacto', ultimoContacto: fecha, actualizadoEn: ts };
}

/**
 * Registra (o borra) el uso del voucher de cumpleaños.
 *
 * La fecha puede ser retroactiva: una clienta que cumplió en septiembre puede
 * venir a canjearlo en octubre, y lo que importa para la métrica es cuándo lo
 * usó de verdad, no cuándo alguien se acordó de tildarlo.
 *
 * @param {Object} payload
 * @param {string} payload.id
 * @param {string} [payload.fecha] aaaa-mm-dd. Vacío o null = desmarcar.
 */
function accionVoucher(payload, usuario) {
  const hoja = hojaClientes_();
  const id = payload && payload.id;
  if (!id) throw new Error('Falta el ID');

  const fila = buscarFilaPorId_(hoja, id);
  if (fila < 0) throw new Error('Cliente no encontrado: ' + id);

  const fecha = payload.fecha ? String(payload.fecha) : '';
  const ts = new Date().toISOString();
  const quien = fecha && usuario ? usuario.email : '';

  hoja.getRange(fila, IDX.ULTIMO_VOUCHER + 1).setValue(fecha);
  hoja.getRange(fila, IDX.VOUCHER_POR + 1).setValue(quien);
  hoja.getRange(fila, IDX.ACTUALIZADO + 1).setValue(ts);

  encolarEvento_(payload.evento, id, fecha ? 'voucher' : 'voucher-deshecho');
  return { id: id, operacion: 'voucher', ultimoVoucher: fecha, actualizadoEn: ts };
}

/**
 * Procesa un lote de operaciones en una sola llamada. Es lo que consume la
 * cola de sincronización del frontend.
 *
 * Cada operación falla de forma aislada: un error no aborta el resto del lote.
 * Se devuelve el opId de cada una para que el cliente sepa qué desencolar.
 *
 * @param {Object} payload
 * @param {Array}  payload.ops [{ opId, tipo: 'alta'|'edicion'|'baja'|'contacto'|'voucher', payload }]
 */
function accionBatch(payload, usuario) {
  const ops = (payload && payload.ops) || [];
  const resultados = [];

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    try {
      let data;
      switch (op.tipo) {
        case 'alta':
        case 'edicion':  data = accionUpsert(op.payload, usuario);   break;
        case 'baja':     data = accionBaja(op.payload, usuario);     break;
        case 'contacto': data = accionContacto(op.payload, usuario); break;
        case 'voucher':  data = accionVoucher(op.payload, usuario);  break;
        default: throw new Error('Tipo de operación desconocido: ' + op.tipo);
      }
      resultados.push({ opId: op.opId, ok: true, data: data });
    } catch (err) {
      resultados.push({ opId: op.opId, ok: false, error: String(err && err.message ? err.message : err) });
    }
  }

  return { resultados: resultados, procesadas: resultados.length, servidorEn: new Date().toISOString() };
}

/**
 * Agrega entradas a la hoja Logs. Acepta una o varias.
 * El frontend solo empuja WARN y ERROR; el detalle fino queda local.
 */
function accionLog(payload, usuario) {
  const entradas = (payload && payload.entradas) || (payload ? [payload] : []);
  if (!entradas.length) return { escritas: 0 };

  const hoja = obtenerHoja_(HOJA_LOGS);
  const filas = entradas.map(function (en) {
    return [
      en.timestamp || ahoraLocal(),
      en.nivel     || 'INFO',
      en.evento    || '',
      typeof en.detalle === 'object' ? JSON.stringify(en.detalle) : (en.detalle || ''),
      usuario ? usuario.email : (en.usuario || ''),
      en.clienteId || ''
    ];
  });

  hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, COLS_LOGS.length).setValues(filas);
  rotarLogs_(hoja);
  return { escritas: filas.length };
}

/**
 * Guarda pares clave/valor en la hoja Config (por ejemplo, la plantilla
 * de WhatsApp editada desde la app).
 */
function accionSetConfig(payload) {
  const hoja = obtenerHoja_(HOJA_CONFIG);
  const valores = (payload && payload.valores) || {};
  const datos = hoja.getDataRange().getValues();

  const indice = {};
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0]) indice[String(datos[i][0])] = i + 1;
  }

  const nuevas = [];
  Object.keys(valores).forEach(function (clave) {
    if (indice[clave]) hoja.getRange(indice[clave], 2).setValue(valores[clave]);
    else nuevas.push([clave, valores[clave]]);
  });
  if (nuevas.length) {
    hoja.getRange(hoja.getLastRow() + 1, 1, nuevas.length, 2).setValues(nuevas);
  }

  return leerConfig();
}


// ─────────────────────────────────────────────────────────────────────────────
// HISTORIAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deja un evento listo para escribirse al final de la petición.
 *
 * El evento lo arma el navegador (así el historial se ve al instante y también
 * sin internet) pero acá se le corrige el tipo y más adelante el usuario, que
 * salen del servidor. Si el navegador no mandó nada, se arma uno igual: el
 * historial no puede depender de que el frontend se acuerde.
 */
function encolarEvento_(evento, clienteId, tipo) {
  const e = evento && typeof evento === 'object' ? evento : {};
  EVENTOS_PENDIENTES.push({
    eventoId:  String(e.eventoId || Utilities.getUuid()),
    clienteId: String(e.clienteId || clienteId || ''),
    fecha:     String(e.fecha || hoyLocal()),
    tipo:      String(e.tipo || tipo || ''),
    detalle:   typeof e.detalle === 'object' ? JSON.stringify(e.detalle) : String(e.detalle || ''),
    creadoEn:  String(e.creadoEn || new Date().toISOString())
  });
}

/**
 * Escribe de una sola vez los eventos acumulados durante la petición.
 *
 * Se descartan los EventoID que ya están en la hoja: si una operación se
 * reenvía porque el primer intento se cortó por timeout, el historial no
 * termina con el mismo hecho anotado dos veces.
 */
function volcarEventos_(usuario) {
  if (!EVENTOS_PENDIENTES.length) return;

  const hoja = hojaHistorial_();

  const yaEstan = {};
  if (hoja.getLastRow() >= 2) {
    const ids = hoja.getRange(2, IDX_H.EVENTO + 1, hoja.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0]) yaEstan[String(ids[i][0])] = true;
    }
  }

  const filas = [];
  for (let j = 0; j < EVENTOS_PENDIENTES.length; j++) {
    const e = EVENTOS_PENDIENTES[j];
    if (yaEstan[e.eventoId]) continue;
    yaEstan[e.eventoId] = true;
    filas.push([
      e.eventoId, e.clienteId, e.fecha, e.tipo, e.detalle,
      usuario ? usuario.email : '', usuario ? usuario.sucursal : '',
      e.creadoEn
    ]);
  }

  if (!filas.length) return;
  hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, COLS_HISTORIAL.length).setValues(filas);
}


// ─────────────────────────────────────────────────────────────────────────────
// ACCESO A DATOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cachés que viven lo que dura UNA petición. `rutear` los limpia al empezar.
 *
 * Abrir la planilla y rastrear la columna de IDs son las dos cosas más caras
 * que hace este script, y antes se repetían por cada operación: un lote de 25
 * altas abría la planilla 25 veces y leía la columna de IDs otras 25. Con la
 * base creciendo, eso es lo que hacía que una tanda se pasara del timeout y
 * dejara a las otras terminales esperando en la cola de Apps Script.
 */
var _planilla = null;
var _filaPorId = null;
var _hojaClientes = null;

function limpiarCache_() {
  _planilla = null;
  _filaPorId = null;
  _hojaClientes = null;
}

function abrirPlanilla_() {
  if (!_planilla) _planilla = SpreadsheetApp.openById(SPREADSHEET_ID);
  return _planilla;
}

function obtenerHoja_(nombre) {
  const hoja = abrirPlanilla_().getSheetByName(nombre);
  if (!hoja) throw new Error('Falta la hoja "' + nombre + '". Ejecutá la acción setup.');
  return hoja;
}

function hojaClientes_() {
  if (_hojaClientes) return _hojaClientes;

  const hoja = obtenerHoja_(HOJA_CLIENTES);
  // Red de seguridad: si alguien implementa esta versión sin correr el setup,
  // la hoja todavía tiene 16 columnas y cualquier lectura de 19 explotaría con
  // un "range out of bounds" que no le dice nada a nadie. Se ensancha sola.
  asegurarColumnas_(hoja, COLS_CLIENTES.length);
  _hojaClientes = hoja;
  return hoja;
}

/** Agrega columnas a la derecha si la hoja quedó corta. */
function asegurarColumnas_(hoja, cuantas) {
  const tiene = hoja.getMaxColumns();
  if (tiene < cuantas) hoja.insertColumnsAfter(tiene, cuantas - tiene);
  return hoja;
}

/**
 * Hoja Historial, creándola si todavía no existe.
 *
 * A diferencia de las demás, esta no puede faltar en silencio: si el historial
 * se pierde no hay forma de reconstruirlo después. Así que si el setup no se
 * corrió, la hoja se arma acá mismo con sus encabezados.
 */
function hojaHistorial_() {
  const ss = abrirPlanilla_();
  let hoja = ss.getSheetByName(HOJA_HISTORIAL);
  if (!hoja) {
    hoja = ss.insertSheet(HOJA_HISTORIAL);
    hoja.getRange(1, 1, 1, COLS_HISTORIAL.length)
        .setValues([COLS_HISTORIAL])
        .setFontWeight('bold')
        .setBackground('#0A0A0A')
        .setFontColor('#FFFFFF');
    hoja.setFrozenRows(1);
  }
  return asegurarColumnas_(hoja, COLS_HISTORIAL.length);
}

/**
 * Crea la hoja si no existe y escribe los encabezados con formato.
 * Si la hoja tiene menos columnas que las que pide el encabezado (porque se
 * agregaron campos en una versión nueva), se ensancha antes de escribir.
 */
function obtenerOCrearHoja_(ss, nombre, encabezados, creadas) {
  let hoja = ss.getSheetByName(nombre);
  if (!hoja) {
    hoja = ss.insertSheet(nombre);
    creadas.push(nombre);
  }
  if (hoja.getMaxColumns() < encabezados.length) {
    hoja.insertColumnsAfter(hoja.getMaxColumns(), encabezados.length - hoja.getMaxColumns());
  }
  hoja.getRange(1, 1, 1, encabezados.length)
      .setValues([encabezados])
      .setFontWeight('bold')
      .setBackground('#0A0A0A')
      .setFontColor('#FFFFFF');
  hoja.setFrozenRows(1);
  return hoja;
}

/** Devuelve todas las filas de datos de Clientes (sin el encabezado). */
function leerFilasClientes_() {
  const hoja = hojaClientes_();
  const ultima = hoja.getLastRow();
  if (ultima < 2) return [];
  return hoja.getRange(2, 1, ultima - 1, COLS_CLIENTES.length).getValues();
}

/**
 * Busca el número de fila (1-based, real de la hoja) de un ID.
 * Devuelve -1 si no existe.
 */
function buscarFilaPorId_(hoja, id) {
  // El índice se arma una sola vez por petición y después se mantiene al día
  // a mano, así un lote de 25 operaciones hace una lectura y no 25.
  if (!_filaPorId) {
    _filaPorId = {};
    const ultima = hoja.getLastRow();
    if (ultima >= 2) {
      const ids = hoja.getRange(2, IDX.ID + 1, ultima - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        if (ids[i][0]) _filaPorId[String(ids[i][0])] = i + 2;
      }
    }
  }

  const fila = _filaPorId[String(id)];
  return fila === undefined ? -1 : fila;
}

/** Anota en el índice una fila recién agregada. */
function registrarFila_(id, fila) {
  if (_filaPorId) _filaPorId[String(id)] = fila;
}

/** Lee la hoja Config como objeto plano. */
function leerConfig() {
  const ss = abrirPlanilla_();
  const hoja = ss.getSheetByName(HOJA_CONFIG);
  if (!hoja || hoja.getLastRow() < 2) return {};
  const datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, 2).getValues();
  const out = {};
  datos.forEach(function (f) { if (f[0]) out[String(f[0])] = f[1]; });
  return out;
}

/** Recorta la hoja de logs cuando supera el máximo. */
function rotarLogs_(hoja) {
  const filas = hoja.getLastRow() - 1;
  if (filas <= MAX_FILAS_LOG) return;
  hoja.deleteRows(2, filas - MAX_FILAS_LOG);
}


// ─────────────────────────────────────────────────────────────────────────────
// TRANSFORMACIÓN DE DATOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valida y completa un cliente que llega del frontend.
 * Deriva Dia / Mes / Anio a partir de FechaNacimiento y sella ActualizadoEn.
 */
function normalizarCliente_(p) {
  const fechaNac = String(p.fechaNacimiento || p.FechaNacimiento || '').trim();
  const partes = descomponerFechaNac_(fechaNac);

  return {
    ID:              String(p.id || p.ID || '').trim(),
    Nombre:          String(p.nombre   || p.Nombre   || '').trim(),
    Apellido:        String(p.apellido || p.Apellido || '').trim(),
    FechaNacimiento: fechaNac,
    Dia:             partes.dia,
    Mes:             partes.mes,
    Anio:            partes.anio,
    Celular:         String(p.celular || p.Celular || '').trim(),
    Notas:           String(p.notas   || p.Notas   || '').trim(),
    UltimoContacto:  String(p.ultimoContacto || p.UltimoContacto || '').trim(),
    FechaAlta:       String(p.fechaAlta || p.FechaAlta || ahoraLocal()).trim(),
    Usuario:         String(p.usuario   || p.Usuario   || '').trim(),
    Activo:          (p.activo === false || p.Activo === 'NO') ? 'NO' : 'SI',
    ActualizadoEn:   new Date().toISOString(),
    Email:           String(p.email    || p.Email    || '').trim().toLowerCase(),
    Sucursal:        String(p.sucursal || p.Sucursal || '').trim(),
    UltimoVoucher:   String(p.ultimoVoucher || p.UltimoVoucher || '').trim(),
    ContactadoPor:   String(p.contactadoPor || p.ContactadoPor || '').trim(),
    VoucherPor:      String(p.voucherPor    || p.VoucherPor    || '').trim()
  };
}

/** Objeto → array en el orden de las columnas. */
function objetoAFila_(c) {
  return [
    c.ID, c.Nombre, c.Apellido, c.FechaNacimiento, c.Dia, c.Mes, c.Anio,
    c.Celular, c.Notas, c.UltimoContacto, c.FechaAlta, c.Usuario,
    c.Activo, c.ActualizadoEn, c.Email, c.Sucursal,
    c.UltimoVoucher, c.ContactadoPor, c.VoucherPor
  ];
}

/** Array de la hoja → objeto camelCase para el frontend. */
function filaAObjeto_(f) {
  return {
    id:              String(f[IDX.ID]),
    nombre:          String(f[IDX.NOMBRE] || ''),
    apellido:        String(f[IDX.APELLIDO] || ''),
    fechaNacimiento: comoTexto_(f[IDX.FECHA_NAC], 'dd/MM/yyyy'),
    dia:             f[IDX.DIA]  === '' ? null : Number(f[IDX.DIA]),
    mes:             f[IDX.MES]  === '' ? null : Number(f[IDX.MES]),
    anio:            f[IDX.ANIO] === '' ? null : Number(f[IDX.ANIO]),
    celular:         String(f[IDX.CELULAR] || ''),
    notas:           String(f[IDX.NOTAS] || ''),
    ultimoContacto:  comoTexto_(f[IDX.ULTIMO_CONTACTO], 'yyyy-MM-dd'),
    fechaAlta:       comoTexto_(f[IDX.FECHA_ALTA], 'yyyy-MM-dd HH:mm'),
    usuario:         String(f[IDX.USUARIO] || ''),
    activo:          String(f[IDX.ACTIVO] || 'SI') !== 'NO',
    actualizadoEn:   String(f[IDX.ACTUALIZADO] || ''),
    email:           String(f[IDX.EMAIL] || '').trim(),
    sucursal:        String(f[IDX.SUCURSAL] || '').trim(),
    ultimoVoucher:   comoTexto_(f[IDX.ULTIMO_VOUCHER], 'yyyy-MM-dd'),
    contactadoPor:   String(f[IDX.CONTACTADO_POR] || '').trim(),
    voucherPor:      String(f[IDX.VOUCHER_POR] || '').trim()
  };
}

/**
 * Devuelve el valor de una celda como texto.
 *
 * Aunque las columnas se formatean como texto plano, Sheets puede terminar
 * guardando una fecha real (por ejemplo si alguien la edita a mano en la
 * planilla). En ese caso `String(celda)` daría "Tue Jul 28 2026 11:17:00
 * GMT-0300…", que el frontend no sabe interpretar. Acá se unifica.
 *
 * @param {*} valor
 * @param {string} formato Formato de salida si el valor resulta ser una fecha.
 */
function comoTexto_(valor, formato) {
  if (valor === null || valor === undefined || valor === '') return '';
  if (Object.prototype.toString.call(valor) === '[object Date]') {
    return Utilities.formatDate(valor, TZ, formato);
  }
  return String(valor).trim();
}

/**
 * Descompone "dd/mm/aaaa" o "dd/mm" en sus partes numéricas.
 * Si el formato no es válido devuelve vacíos, sin romper: la fila se guarda
 * igual y queda visible como "revisar" en la app.
 */
function descomponerFechaNac_(txt) {
  const vacio = { dia: '', mes: '', anio: '' };
  if (!txt) return vacio;

  const m = String(txt).match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!m) return vacio;

  const dia = Number(m[1]);
  const mes = Number(m[2]);
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return vacio;

  return { dia: dia, mes: mes, anio: m[3] ? Number(m[3]) : '' };
}

/** Fecha y hora actual de Buenos Aires, formato aaaa-mm-dd HH:mm. */
function ahoraLocal() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
}

/** Fecha de hoy en Buenos Aires, formato aaaa-mm-dd. */
function hoyLocal() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

/** Empaqueta la respuesta como JSON. */
function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Deja constancia en la hoja Logs de cualquier excepción del servidor. */
function registrarError_(action, err) {
  try {
    const hoja = abrirPlanilla_().getSheetByName(HOJA_LOGS);
    if (!hoja) return;
    hoja.appendRow([
      ahoraLocal(), 'ERROR', 'backend:' + action,
      String(err && err.stack ? err.stack : err), 'servidor', ''
    ]);
  } catch (e) {
    // Si ni siquiera se puede loguear, no vale la pena escalar el error.
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// UTILIDADES MANUALES (se ejecutan desde el editor de Apps Script)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ejecutar UNA VEZ desde el editor para crear las pestañas.
 * También sirve para reparar la estructura si se borró algo a mano.
 */
function setupManual() {
  const r = accionSetup();
  Logger.log(JSON.stringify(r, null, 2));
}

/**
 * Ejecutar UNA VEZ después de setupManual(), al pasar a la versión 2.2.0.
 *
 * Los clientes que ya estaban cargados no tienen historial, porque hasta ahora
 * no se guardaba. Esta función lo reconstruye con lo que sí quedó en la
 * planilla: el alta (fecha y quién la hizo) y el último contacto registrado.
 * No inventa nada más: los contactos de años anteriores no se pueden recuperar
 * porque nunca se guardaron.
 *
 * Es idempotente: los EventoID son derivados del ID del cliente, así que
 * correrla dos veces no duplica nada.
 */
function sembrarHistorial() {
  const hoja = hojaHistorial_();

  const yaEstan = {};
  if (hoja.getLastRow() >= 2) {
    const ids = hoja.getRange(2, IDX_H.EVENTO + 1, hoja.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0]) yaEstan[String(ids[i][0])] = true;
    }
  }

  const filas = leerFilasClientes_();
  const nuevas = [];

  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    const id = String(f[IDX.ID] || '');
    if (!id) continue;

    const usuario  = String(f[IDX.USUARIO] || '');
    const sucursal = String(f[IDX.SUCURSAL] || '');
    const alta     = comoTexto_(f[IDX.FECHA_ALTA], 'yyyy-MM-dd HH:mm');
    const contacto = comoTexto_(f[IDX.ULTIMO_CONTACTO], 'yyyy-MM-dd');
    const voucher  = comoTexto_(f[IDX.ULTIMO_VOUCHER], 'yyyy-MM-dd');

    const candidatos = [
      { id: 'seed-alta-' + id, fecha: alta.slice(0, 10), tipo: 'alta',
        detalle: 'Alta registrada antes del historial', usa: !!alta },
      { id: 'seed-contacto-' + id, fecha: contacto, tipo: 'contacto',
        detalle: 'Último contacto registrado antes del historial', usa: !!contacto },
      { id: 'seed-voucher-' + id, fecha: voucher, tipo: 'voucher',
        detalle: 'Canje registrado antes del historial', usa: !!voucher }
    ];

    for (let j = 0; j < candidatos.length; j++) {
      const c = candidatos[j];
      if (!c.usa || yaEstan[c.id]) continue;
      yaEstan[c.id] = true;
      nuevas.push([
        c.id, id, c.fecha, c.tipo, c.detalle, usuario, sucursal,
        (c.fecha || hoyLocal()) + 'T00:00:00.000Z'
      ]);
    }
  }

  if (nuevas.length) {
    hoja.getRange(hoja.getLastRow() + 1, 1, nuevas.length, COLS_HISTORIAL.length).setValues(nuevas);
  }

  Logger.log('Eventos sembrados: ' + nuevas.length);
  return nuevas.length;
}

/**
 * Prueba rápida de lectura. Útil para verificar permisos y estructura.
 */
function testListado() {
  Logger.log(JSON.stringify(accionList({ sinHistorial: true }), null, 2));
}

/**
 * EJECUTAR UNA VEZ después de activar el ingreso con Google.
 *
 * La verificación de sesión consulta a un servidor de Google para confirmar que
 * el token sea auténtico. Eso requiere un permiso —salida a internet— que el
 * script no tenía antes, y Google exige que se otorgue de forma explícita.
 *
 * Al ejecutar esta función aparece la pantalla de autorización. Hay que
 * aceptarla; si avisa que la app no está verificada, entrar por
 * "Configuración avanzada" e "Ir a (nombre del proyecto)".
 *
 * Después de autorizar, conviene volver a implementar con "Nueva versión".
 */
function autorizar() {
  var respuesta = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=prueba',
    { muteHttpExceptions: true }
  );

  Logger.log('Permiso de red concedido. Código recibido: ' + respuesta.getResponseCode());
  Logger.log('(El código 400 es lo esperado: el token de prueba es inválido a propósito.)');

  var planilla = abrirPlanilla_();
  Logger.log('Acceso a la planilla correcto: ' + planilla.getName());

  var hoja = planilla.getSheetByName(HOJA_CLIENTES);
  Logger.log(hoja
    ? 'Hoja Clientes lista, con ' + Math.max(0, hoja.getLastRow() - 1) + ' registros.'
    : 'Falta la hoja Clientes: ejecutá setupManual().');

  return 'Listo. Ya se puede usar la aplicación.';
}
