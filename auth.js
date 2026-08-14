/**
 * BE WILD · Autenticación con Google
 * ----------------------------------------------------------------------------
 * Usa Google Identity Services. El flujo es:
 *
 *   1. Google devuelve un ID token (JWT firmado por Google).
 *   2. El navegador lee el payload solo para mostrar nombre y foto.
 *   3. Ese mismo token viaja en cada llamada al backend.
 *   4. El Apps Script lo verifica contra Google y decide si deja pasar.
 *
 * El paso 4 es el que importa: la lista de mails del navegador es comodidad,
 * no seguridad. Cualquiera puede editar el JavaScript de una página. La única
 * validación que cuenta es la del servidor.
 *
 * El token dura una hora. Se guarda para que al refrescar no haya que volver a
 * entrar, y cuando vence se pide uno nuevo sin intervención del usuario.
 */

import { CLIENT_ID, USUARIOS, CLAVES } from './config.js?v=2.3.0';

const GIS_URL = 'https://accounts.google.com/gsi/client';

let sesion = null;          // { token, email, nombre, foto, expira, rol, sucursal }
let escuchas = [];
let gisListo = null;

/* ── Estado ─────────────────────────────────────────────────────────────── */

/** @returns {boolean} */
export function autenticado() {
  return !!sesion && sesion.expira > Date.now();
}

/** @returns {Object|null} */
export function usuario() {
  return autenticado() ? sesion : null;
}

/** Token para mandar al backend. Vacío si no hay sesión válida. */
export function token() {
  return autenticado() ? sesion.token : '';
}

/** Nombre que se registra en la columna Usuario de la planilla. */
export function nombre() {
  return autenticado() ? sesion.email : 'sin sesión';
}

/** Sucursal derivada del usuario: ESTE, OESTE o ADMIN. */
export function sucursal() {
  return autenticado() ? sesion.sucursal : '';
}

export function rol() {
  return autenticado() ? sesion.rol : null;
}

export function esAdmin() {
  return rol() === 'ADMIN';
}

/**
 * Permisos por acción. Las vistas preguntan acá antes de mostrar un botón.
 * @param {'ver'|'cargar'|'contactar'|'editar'|'eliminar'|'exportar'|'configurar'} accion
 */
export function puede(accion) {
  if (!autenticado()) return false;
  const deTodos = ['ver', 'cargar', 'contactar'];
  return deTodos.includes(accion) || esAdmin();
}

/** Se notifica cada vez que la sesión cambia (entrar, salir, renovar). */
export function alCambiar(fn) {
  escuchas.push(fn);
  return () => { escuchas = escuchas.filter(f => f !== fn); };
}

function notificar() {
  escuchas.forEach(fn => { try { fn(sesion); } catch (e) { /* ignorar */ } });
}

/* ── Normalización de mails ─────────────────────────────────────────────── */

/**
 * Gmail ignora los puntos del nombre de usuario: juan.perez@gmail.com y
 * juanperez@gmail.com son la misma casilla. Sin esta normalización, un usuario
 * habilitado puede quedar afuera por escribir su mail distinto.
 */
export function normalizarEmail(email) {
  const limpio = String(email || '').trim().toLowerCase();
  const [usuario, dominio] = limpio.split('@');
  if (!dominio) return limpio;

  if (dominio === 'gmail.com' || dominio === 'googlemail.com') {
    return usuario.split('+')[0].replace(/\./g, '') + '@gmail.com';
  }
  return limpio;
}

/** Busca al usuario en la lista blanca. Devuelve null si no está. */
function buscarUsuario(email) {
  const buscado = normalizarEmail(email);
  return USUARIOS.find(u => normalizarEmail(u.email) === buscado) || null;
}

/* ── Carga de la librería de Google ─────────────────────────────────────── */

function cargarGIS() {
  if (gisListo) return gisListo;

  gisListo = new Promise((resolver, rechazar) => {
    if (window.google && window.google.accounts) return resolver();

    const script = document.createElement('script');
    script.src = GIS_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolver();
    script.onerror = () => rechazar(new Error('No se pudo cargar el ingreso de Google'));
    document.head.appendChild(script);
  });

  return gisListo;
}

/* ── Lectura del token ──────────────────────────────────────────────────── */

/**
 * Decodifica el payload del JWT. Sirve solo para mostrar datos en pantalla:
 * no valida la firma, y por eso el backend vuelve a verificarlo por su cuenta.
 */
function leerPayload(jwt) {
  try {
    const base64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const texto = decodeURIComponent(
      atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    return JSON.parse(texto);
  } catch (e) {
    return null;
  }
}

/**
 * Arma la sesión a partir de un token. Devuelve el motivo del rechazo si el
 * usuario no está habilitado.
 * @returns {{ok: boolean, error?: string}}
 */
function establecerSesion(jwt) {
  const datos = leerPayload(jwt);
  if (!datos || !datos.email) return { ok: false, error: 'No se pudo leer la cuenta de Google' };

  if (!datos.email_verified) {
    return { ok: false, error: 'La cuenta de Google no tiene el mail verificado' };
  }

  const habilitado = buscarUsuario(datos.email);
  if (!habilitado) {
    return { ok: false, error: `La cuenta ${datos.email} no tiene acceso a esta aplicación` };
  }

  sesion = {
    token: jwt,
    email: normalizarEmail(datos.email),
    emailOriginal: datos.email,
    nombre: datos.name || datos.email,
    foto: datos.picture || '',
    expira: (datos.exp || 0) * 1000,
    rol: habilitado.rol,
    sucursal: habilitado.sucursal,
    etiqueta: habilitado.etiqueta
  };

  localStorage.setItem(CLAVES.sesion, jwt);
  notificar();
  return { ok: true };
}

/* ── Entrada y salida ───────────────────────────────────────────────────── */

/**
 * Intenta recuperar la sesión guardada. No muestra nada en pantalla.
 * @returns {boolean} true si quedó una sesión válida
 */
export function recuperarSesion() {
  const guardado = localStorage.getItem(CLAVES.sesion);
  if (!guardado) return false;

  const datos = leerPayload(guardado);
  if (!datos || (datos.exp || 0) * 1000 <= Date.now() + 60000) {
    localStorage.removeItem(CLAVES.sesion);
    return false;
  }

  return establecerSesion(guardado).ok;
}

/**
 * Dibuja el botón de Google y espera a que la persona entre.
 *
 * @param {HTMLElement} contenedor Dónde va el botón
 * @param {(error: string) => void} alRechazar Se llama si la cuenta no tiene acceso
 */
export async function montarBoton(contenedor, alRechazar) {
  await cargarGIS();

  google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: respuesta => {
      const r = establecerSesion(respuesta.credential);
      if (!r.ok) {
        google.accounts.id.disableAutoSelect();
        alRechazar(r.error);
      }
    },
    auto_select: true,
    cancel_on_tap_outside: false
  });

  google.accounts.id.renderButton(contenedor, {
    theme: 'filled_black',
    size: 'large',
    text: 'signin_with',
    shape: 'rectangular',
    locale: 'es-419',
    width: 280
  });

  // One Tap: si la persona ya entró antes, vuelve a entrar sola.
  google.accounts.id.prompt();
}

/** Cierra la sesión y limpia lo guardado. */
export function salir() {
  sesion = null;
  localStorage.removeItem(CLAVES.sesion);
  if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
  notificar();
}

/**
 * Programa el aviso de vencimiento. El token dura una hora; unos minutos antes
 * se pide uno nuevo para que la sesión no se corte en medio de una carga.
 */
export function vigilarVencimiento(alVencer) {
  setInterval(() => {
    if (!sesion) return;
    const faltan = sesion.expira - Date.now();
    if (faltan <= 0) {
      salir();
      alVencer();
    } else if (faltan < 5 * 60000 && window.google) {
      // Renovación silenciosa: si Google puede, devuelve un token nuevo sin
      // molestar a nadie.
      google.accounts.id.prompt();
    }
  }, 60000);
}
