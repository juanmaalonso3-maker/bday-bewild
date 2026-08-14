/**
 * BE WILD · Vista "Historial del cliente"
 * ----------------------------------------------------------------------------
 * La ficha completa de una clienta: todo lo que Base de datos ya no muestra.
 *
 *   - de dónde salió: alta, fecha, quién la cargó y desde qué local
 *   - los vouchers, año por año: cuándo los usó y quién lo registró
 *   - los contactos: cuándo se le escribió y quién lo hizo
 *   - la línea de tiempo completa, sin recortar
 *
 * También es el lugar donde se registra un canje con fecha retroactiva, que es
 * el caso de la clienta que cumplió en septiembre y pasó a buscar el voucher
 * en octubre: lo que importa para medir la campaña es el día real del canje.
 *
 * El historial no se pisa nunca. La fila del cliente dice cómo está hoy; esto
 * dice cómo se llegó hasta acá.
 */

import * as store from './store.js?v=2.3.0';
import * as router from './router.js?v=2.3.0';
import { avisar } from './ui-avisos.js?v=2.3.0';
import { mostrar, normalizar } from './utils-telefono.js?v=2.3.0';
import { MESES, hoyISO, textoFechaCorta, textoDiaMes, edad } from './utils-fecha.js?v=2.3.0';

let desuscribir = null;
let busqueda = '';

/** Cliente que se está mirando. Se conserva al ir y volver. */
let elegido = null;

/**
 * Abre la ficha de una clienta puntual.
 * La usa Base de datos para saltar directo desde una fila.
 */
export function verCliente(id) {
  elegido = id;
  busqueda = '';
  router.ir('historial');
  pintar();
}

export default {
  titulo: 'Historial del cliente',

  render(contenedor) {
    contenedor.innerHTML = estructura();
    conectar();
    desuscribir = store.suscribir(pintar);
  },

  destruir() {
    if (desuscribir) desuscribir();
    desuscribir = null;
  }
};

const $ = id => document.getElementById(id);

/* ── Estructura ─────────────────────────────────────────────────────────── */

function estructura() {
  return `
  <div class="historial">
    <section class="tarjeta historial__buscador">
      <h2 class="seccion-titulo">
        Buscar clienta
        <span class="seccion-titulo__cuenta" id="cuenta-hist"></span>
      </h2>
      <input id="buscador-hist" class="entrada entrada--busqueda" type="search"
             placeholder="Nombre, celular o email…" autocomplete="off">
      <div id="resultados-hist" class="resultados"></div>
    </section>

    <section class="historial__ficha" id="ficha"></section>
  </div>`;
}

function conectar() {
  $('buscador-hist').addEventListener('input', e => {
    busqueda = e.target.value.trim().toLowerCase();
    pintar();
  });
}

/* ── Búsqueda ───────────────────────────────────────────────────────────── */

/** Mismo criterio que Base de datos: por palabras, y por teléfono con dígitos. */
function coincidencias() {
  const lista = store.listar();
  if (!busqueda) {
    // Sin búsqueda se muestran las últimas cargadas: es lo que uno suele venir a mirar.
    return [...lista]
      .sort((a, b) => String(b.fechaAlta || '').localeCompare(String(a.fechaAlta || '')))
      .slice(0, 30);
  }

  const digitos = busqueda.replace(/\D/g, '');
  const porTelefono = digitos.length >= 3;
  const palabras = busqueda.split(/\s+/).filter(Boolean);

  return lista.filter(c => {
    const nombre = c.nombreCompleto.toLowerCase();
    if (palabras.every(p => nombre.includes(p))) return true;
    if (porTelefono && String(c.celular || '').includes(digitos)) return true;
    if (String(c.email || '').toLowerCase().includes(busqueda)) return true;
    return false;
  }).sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, 'es'));
}

/* ── Pintado ────────────────────────────────────────────────────────────── */

function pintar() {
  const caja = $('resultados-hist');
  if (!caja) return;

  const lista = coincidencias();
  const total = store.listar().length;

  $('cuenta-hist').textContent = busqueda
    ? `${lista.length} de ${total}`
    : `últimas cargadas`;

  caja.innerHTML = lista.length
    ? lista.map(c => `
        <button type="button" class="resultado${c.id === elegido ? ' resultado--activo' : ''}"
                data-cliente="${c.id}">
          <span class="resultado__nombre">${escapar(c.nombreCompleto)}</span>
          <span class="resultado__dato">${escapar(c.fechaNacimiento || 'sin fecha')}</span>
        </button>`).join('')
    : '<p class="vacio__texto">Ninguna clienta coincide.</p>';

  caja.querySelectorAll('[data-cliente]').forEach(btn => {
    btn.addEventListener('click', () => { elegido = btn.dataset.cliente; pintar(); });
  });

  pintarFicha();
}

function pintarFicha() {
  const caja = $('ficha');
  if (!caja) return;

  const c = elegido ? store.obtener(elegido) : null;

  if (!c) {
    caja.innerHTML = `
      <div class="vacio">
        <div class="vacio__titulo">Elegí una clienta</div>
        <p class="vacio__texto">
          Buscala a la izquierda para ver de dónde salió, todos los vouchers que
          usó año por año y cada vez que se la contactó.
        </p>
      </div>`;
    return;
  }

  const eventos = store.historialDe(c.id);
  const anios = agruparPorAnio(eventos);
  const tel = normalizar(c.celular);
  const anios_ = c.nacimiento.valida ? edad(c.nacimiento) : null;

  caja.innerHTML = `
    <div class="tarjeta ficha">
      <div class="ficha__cabecera">
        <div>
          <p class="modal__eyebrow">Historial del cliente</p>
          <h2 class="ficha__nombre">${escapar(c.nombreCompleto)}</h2>
          <p class="ficha__sub">
            ${c.cumple ? `Cumple el ${textoDiaMes(c.cumple.dia, c.cumple.mes)}` : 'Fecha de nacimiento a revisar'}
            ${anios_ !== null ? ` · ${anios_} años` : ''}
            ${tel.valido ? ` · ${escapar(mostrar(tel.canonico))}` : ''}
            ${c.email ? ` · ${escapar(c.email)}` : ''}
          </p>
        </div>
        <span class="chip" data-local="${escapar(c.sucursal || '')}">${escapar(c.sucursal || '—')}</span>
      </div>

      <div class="ficha__datos">
        ${dato('Alta', c.fechaAlta ? textoFechaCorta(c.fechaAlta) + ' ' + String(c.fechaAlta).slice(11, 16) : '—')}
        ${dato('Cargado por', c.usuario || '—')}
        ${dato('Local', c.sucursal || '—')}
        ${dato('Último contacto', c.ultimoContacto ? textoFechaCorta(c.ultimoContacto) : 'nunca')}
        ${dato('Contactado por', c.contactadoPor || '—')}
        ${dato('Último voucher', c.ultimoVoucher ? textoFechaCorta(c.ultimoVoucher) : 'nunca')}
        ${dato('Voucher marcado por', c.voucherPor || '—')}
        ${dato('Notas', c.notas || '—')}
      </div>
    </div>

    <div class="tarjeta">
      <h2 class="seccion-titulo">
        Vouchers por año
        <span class="seccion-titulo__cuenta">${resumenVouchers(anios)}</span>
      </h2>
      ${tablaVouchers(anios)}
    </div>

    <div class="tarjeta">
      <h2 class="seccion-titulo">Registrar un canje</h2>
      <p class="canje__ayuda">
        Si vino a usarlo otro día —por ejemplo un cumpleaños de septiembre que
        pasó a buscarlo en octubre— poné la fecha real del canje.
      </p>
      <div class="canje__fila">
        <input id="canje-fecha" type="date" class="entrada" value="${c.ultimoVoucher || hoyISO()}" max="${hoyISO()}">
        <button class="boton boton--principal boton--chico" id="btn-canje" type="button">Registrar canje</button>
        ${c.ultimoVoucher ? '<button class="boton boton--chico" id="btn-canje-borrar" type="button">Borrar el último</button>' : ''}
      </div>
    </div>

    <div class="tarjeta">
      <h2 class="seccion-titulo">
        Línea de tiempo
        <span class="seccion-titulo__cuenta">${eventos.length} ${eventos.length === 1 ? 'registro' : 'registros'}</span>
      </h2>
      ${lineaTiempo(eventos)}
    </div>`;

  $('btn-canje').addEventListener('click', registrarCanje);
  const borrar = $('btn-canje-borrar');
  if (borrar) borrar.addEventListener('click', borrarCanje);
}

function dato(rotulo, valor) {
  return `
    <div class="ficha__dato">
      <span class="ficha__rotulo">${rotulo}</span>
      <span class="ficha__valor">${escapar(valor)}</span>
    </div>`;
}

/* ── Vouchers año por año ───────────────────────────────────────────────── */

/**
 * Agrupa los canjes por año, con el mes en que cayó cada uno.
 * Un año puede tener más de un registro si se corrigió la fecha.
 */
function agruparPorAnio(eventos) {
  const porAnio = new Map();

  eventos
    .filter(e => e.tipo === 'voucher' && e.fecha)
    .forEach(e => {
      const anio = Number(String(e.fecha).slice(0, 4));
      const mes = Number(String(e.fecha).slice(5, 7));
      if (!porAnio.has(anio)) porAnio.set(anio, []);
      porAnio.get(anio).push({ ...e, anio, mes });
    });

  return [...porAnio.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([anio, canjes]) => ({ anio, canjes }));
}

function resumenVouchers(anios) {
  const total = anios.reduce((n, a) => n + a.canjes.length, 0);
  if (!total) return 'todavía ninguno';
  return `${total} ${total === 1 ? 'canje' : 'canjes'} en ${anios.length} ${anios.length === 1 ? 'año' : 'años'}`;
}

function tablaVouchers(anios) {
  if (!anios.length) {
    return `
      <div class="vacio vacio--chico">
        <p class="vacio__texto">Todavía no usó ningún voucher.</p>
      </div>`;
  }

  return `
    <table class="tabla">
      <thead>
        <tr><th>Año</th><th>Mes</th><th>Fecha del canje</th><th>Lo registró</th><th>Local</th></tr>
      </thead>
      <tbody>
        ${anios.flatMap(({ anio, canjes }) => canjes.map(v => `
          <tr>
            <td><strong>${anio}</strong></td>
            <td>${MESES[v.mes - 1] || '—'}</td>
            <td>${escapar(textoFechaCorta(v.fecha))}</td>
            <td class="tabla__tenue">${escapar(v.usuario || '—')}</td>
            <td>${v.sucursal ? `<span class="chip" data-local="${escapar(v.sucursal)}">${escapar(v.sucursal)}</span>` : '<span class="tabla__tenue">—</span>'}</td>
          </tr>`)).join('')}
      </tbody>
    </table>`;
}

/* ── Línea de tiempo ────────────────────────────────────────────────────── */

function lineaTiempo(eventos) {
  if (!eventos.length) {
    return `
      <div class="vacio vacio--chico">
        <p class="vacio__texto">
          Sin movimientos registrados. El historial arranca a partir de la
          versión 2.2.0: lo que pasó antes no quedó guardado.
        </p>
      </div>`;
  }

  return `<div class="linea-tiempo">${eventos.map(hito).join('')}</div>`;
}

function hito(e) {
  const etiqueta = store.ETIQUETAS_EVENTO[e.tipo] || e.tipo;
  const anio = String(e.fecha || '').slice(0, 4);

  return `
    <div class="hito" data-tipo="${escapar(e.tipo)}">
      <div class="hito__fecha">
        <span class="hito__dia">${escapar(textoFechaCorta(e.fecha) || '—')}</span>
        <span class="hito__anio">${escapar(anio)}</span>
      </div>
      <div class="hito__cuerpo">
        <p class="hito__que">${escapar(etiqueta)}</p>
        ${e.detalle ? `<p class="hito__detalle">${escapar(e.detalle)}</p>` : ''}
        <p class="hito__quien">${escapar(e.usuario || 'sin registrar')}${
          e.sucursal ? ` · ${escapar(e.sucursal)}` : ''
        }</p>
      </div>
    </div>`;
}

/* ── Acciones ───────────────────────────────────────────────────────────── */

async function registrarCanje() {
  if (!elegido) return;

  const fecha = $('canje-fecha').value;
  if (!fecha) return avisar('Elegí la fecha del canje', 'alerta');
  if (fecha > hoyISO()) return avisar('La fecha del canje no puede ser futura', 'alerta');

  const boton = $('btn-canje');
  boton.disabled = true;
  try {
    await store.marcarVoucher(elegido, true, fecha);
    avisar(`Canje registrado el ${textoFechaCorta(fecha)}`, 'ok');
  } catch (err) {
    avisar('No se pudo registrar: ' + err.message, 'error', 6000);
  } finally {
    boton.disabled = false;
  }
}

async function borrarCanje() {
  if (!elegido) return;
  try {
    await store.marcarVoucher(elegido, false);
    avisar('Canje borrado', 'ok');
  } catch (err) {
    avisar('No se pudo borrar: ' + err.message, 'error', 6000);
  }
}

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}
