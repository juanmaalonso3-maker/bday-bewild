/**
 * BE WILD · Vista "Base de datos"
 * ----------------------------------------------------------------------------
 * La base completa, con buscador, orden por columna, edición, baja,
 * exportación a CSV e historial por cliente.
 *
 * La baja es lógica: la fila se conserva en la planilla marcada como inactiva.
 * Nada se borra de verdad, así que un clic equivocado siempre se puede revertir
 * desde el Sheet.
 *
 * El botón del ojito abre la línea de tiempo de la clienta: cuándo se la dio de
 * alta, cada vez que se la contactó, cada vez que usó el voucher y quién marcó
 * cada cosa, año por año. Desde ese mismo panel se puede registrar un canje con
 * fecha retroactiva, que es lo que pasa cuando alguien viene a usar el voucher
 * un mes después de su cumpleaños.
 */

import * as store from './store.js?v=2.2.0';
import * as auth from './auth.js?v=2.2.0';
import { avisar } from './ui-avisos.js?v=2.2.0';
import { mostrar, normalizar } from './utils-telefono.js?v=2.2.0';
import { aCSV, descargar, nombreConFecha } from './utils-csv.js?v=2.2.0';
import { deInputADdMmAaaa, aInputDate, parseFechaNac, textoDiaMes,
         textoFechaCorta, hoyISO } from './utils-fecha.js?v=2.2.0';

let desuscribir = null;
let busqueda = '';
let orden = { columna: 'nombreCompleto', asc: true };

export default {
  titulo: 'Base de datos',

  render(contenedor) {
    contenedor.innerHTML = estructura();
    conectar();
    desuscribir = store.suscribir(pintar);
  },

  destruir() {
    if (desuscribir) desuscribir();
    desuscribir = null;
    cerrarEdicion();
    cerrarHistorial();
  }
};

const $ = id => document.getElementById(id);

/* ── Estructura ─────────────────────────────────────────────────────────── */

function estructura() {
  return `
  <section class="tarjeta">
    <h2 class="seccion-titulo">
      Clientes
      <span class="seccion-titulo__cuenta" id="cuenta-base"></span>
    </h2>

    <div class="barra-herramientas">
      <input id="buscador" class="entrada entrada--busqueda" type="search"
             placeholder="Buscar por nombre, celular o nota…" autocomplete="off">
      <button class="boton boton--chico" id="btn-exportar" type="button" hidden>Exportar CSV</button>
    </div>

    <div class="tabla-scroll" id="tabla-base"></div>
  </section>

  <div class="modal" id="modal-edicion" hidden>
    <div class="modal__caja">
      <p class="modal__eyebrow">Editar cliente</p>
      <h2 class="modal__titulo" id="edicion-titulo">—</h2>

      <div class="formulario formulario--modal">
        <div class="campo">
          <label for="e-nombre">Nombre y apellido</label>
          <input id="e-nombre" type="text" maxlength="80">
        </div>
        <div class="campo">
          <label for="e-fecha">Fecha de nacimiento</label>
          <input id="e-fecha" type="date">
          <p class="campo__ayuda" id="e-fecha-ayuda"></p>
        </div>
        <div class="campo">
          <label for="e-celular">Celular</label>
          <input id="e-celular" type="tel" inputmode="numeric">
        </div>
        <div class="campo">
          <label for="e-email">Email</label>
          <input id="e-email" type="email" maxlength="80">
        </div>
        <div class="campo">
          <label for="e-notas">Notas</label>
          <input id="e-notas" type="text" maxlength="120">
        </div>
      </div>

      <div class="acciones">
        <button class="boton boton--principal" id="btn-guardar-edicion" type="button">Guardar cambios</button>
        <button class="boton" id="btn-cancelar-edicion" type="button">Cancelar</button>
      </div>
    </div>
  </div>

  <div class="modal" id="modal-historial" hidden>
    <div class="modal__caja modal__caja--ancha">
      <p class="modal__eyebrow">Historial</p>
      <h2 class="modal__titulo" id="historial-titulo">—</h2>
      <p class="modal__sub" id="historial-sub"></p>

      <div class="canje">
        <p class="canje__titulo">Registrar uso del voucher</p>
        <p class="canje__ayuda">
          Si vino a canjearlo otro día —por ejemplo un cumpleaños de septiembre
          que pasó a buscarlo en octubre— poné la fecha real del canje.
        </p>
        <div class="canje__fila">
          <input id="canje-fecha" type="date" class="entrada">
          <button class="boton boton--principal boton--chico" id="btn-canje" type="button">
            Registrar canje
          </button>
          <button class="boton boton--chico" id="btn-canje-borrar" type="button" hidden>
            Borrar el canje
          </button>
        </div>
      </div>

      <div id="historial-lista" class="linea-tiempo"></div>

      <div class="acciones">
        <button class="boton" id="btn-cerrar-historial" type="button">Cerrar</button>
      </div>
    </div>
  </div>`;
}

/* ── Controles ──────────────────────────────────────────────────────────── */

function conectar() {
  $('buscador').addEventListener('input', e => {
    busqueda = e.target.value.trim().toLowerCase();
    pintar();
  });

  const botonExportar = $('btn-exportar');
  botonExportar.hidden = !auth.puede('exportar');
  botonExportar.addEventListener('click', exportar);
  $('btn-cancelar-edicion').addEventListener('click', cerrarEdicion);
  $('btn-guardar-edicion').addEventListener('click', guardarEdicion);
  $('btn-cerrar-historial').addEventListener('click', cerrarHistorial);
  $('btn-canje').addEventListener('click', registrarCanje);
  $('btn-canje-borrar').addEventListener('click', borrarCanje);

  document.addEventListener('keydown', escaparModal);
}

function escaparModal(e) {
  if (e.key !== 'Escape') return;
  cerrarEdicion();
  cerrarHistorial();
}

/* ── Datos ──────────────────────────────────────────────────────────────── */

const COLUMNAS = [
  { clave: 'nombreCompleto',  titulo: 'Nombre',      ordenable: true },
  { clave: 'fechaNacimiento', titulo: 'Nacimiento',  ordenable: true },
  { clave: 'proximo',         titulo: 'Próximo',     ordenable: true },
  { clave: 'celular',         titulo: 'Celular',     ordenable: true },
  { clave: 'email',           titulo: 'Email',       ordenable: true },
  { clave: 'notas',           titulo: 'Notas',       ordenable: false },
  { clave: 'voucherUsado',    titulo: 'Voucher',     ordenable: true, centro: true },
  { clave: 'fechaAlta',       titulo: 'Alta',        ordenable: true },
  { clave: 'sucursal',        titulo: 'Local',       ordenable: true },
  { clave: 'usuario',         titulo: 'Cargado por', ordenable: true }
];

function filtrados() {
  let lista = store.listar();

  if (busqueda) {
    lista = lista.filter(c =>
      c.nombreCompleto.toLowerCase().includes(busqueda) ||
      String(c.celular).includes(busqueda.replace(/\D/g, '')) ||
      String(c.email || '').toLowerCase().includes(busqueda) ||
      String(c.notas || '').toLowerCase().includes(busqueda)
    );
  }

  const { columna, asc } = orden;
  return lista.sort((a, b) => {
    const va = valorOrden(a, columna);
    const vb = valorOrden(b, columna);
    const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es');
    return asc ? cmp : -cmp;
  });
}

/** El orden usa el dato crudo, no el texto que se muestra. */
function valorOrden(c, columna) {
  if (columna === 'proximo') return c.cumple ? c.cumple.faltan : 99999;
  if (columna === 'voucherUsado') return c.voucherUsado ? 0 : 1;
  if (columna === 'fechaNacimiento') {
    const n = c.nacimiento;
    return n.valida ? n.mes * 100 + n.dia : 9999;
  }
  return c[columna] ?? '';
}

/* ── Pintado ────────────────────────────────────────────────────────────── */

function pintar() {
  const contenedor = $('tabla-base');
  if (!contenedor) return;

  // Si hay un historial abierto, se repinta con los datos frescos: al marcar
  // un canje desde el propio panel, el evento nuevo tiene que aparecer solo.
  if (historiando) pintarHistorial();

  const lista = filtrados();
  const total = store.listar().length;

  $('cuenta-base').textContent = busqueda
    ? `${lista.length} de ${total}`
    : `${total} ${total === 1 ? 'cliente' : 'clientes'}`;

  if (!lista.length) {
    contenedor.innerHTML = `
      <div class="vacio vacio--chico">
        <p class="vacio__texto">${
          busqueda ? 'Ningún cliente coincide con la búsqueda.' : 'La base todavía está vacía.'
        }</p>
      </div>`;
    return;
  }

  contenedor.innerHTML = `
    <table class="tabla tabla--base">
      <thead>
        <tr>
          ${COLUMNAS.map(cabecera).join('')}
          <th class="tabla__acciones">Acciones</th>
        </tr>
      </thead>
      <tbody>${lista.map(fila).join('')}</tbody>
    </table>`;

  conectarTabla();
}

function cabecera(col) {
  const clase = col.centro ? ' tabla__centro' : '';
  if (!col.ordenable) return `<th class="${clase.trim()}">${col.titulo}</th>`;
  const activa = orden.columna === col.clave;
  const flecha = activa ? (orden.asc ? ' ↑' : ' ↓') : '';
  return `<th class="th-ordenable${activa ? ' th--activa' : ''}${clase}" data-orden="${col.clave}">${col.titulo}${flecha}</th>`;
}

function fila(c) {
  const tel = normalizar(c.celular);
  const celular = tel.valido
    ? escapar(mostrar(tel.canonico))
    : `<span class="revisar">${escapar(c.celular || '—')}</span>`;

  const proximo = c.cumple
    ? `${textoDiaMes(c.cumple.dia, c.cumple.mes)}${c.contactado ? ' <span class="ok-mini">✓</span>' : ''}`
    : '<span class="revisar">fecha inválida</span>';

  const tituloVoucher = c.voucherUsado
    ? `Usó el voucher el ${textoFechaCorta(c.ultimoVoucher)}${c.voucherPor ? ' · lo marcó ' + c.voucherPor : ''}`
    : 'Marcar que usó el voucher';

  return `
    <tr>
      <td><strong>${escapar(c.nombreCompleto)}</strong></td>
      <td>${escapar(c.fechaNacimiento || '—')}</td>
      <td class="tabla__tenue">${proximo}</td>
      <td>${celular}</td>
      <td class="tabla__tenue">${escapar(c.email || '')}</td>
      <td class="tabla__tenue">${escapar(c.notas || '')}</td>
      <td class="tabla__centro">
        <input type="checkbox" class="check-voucher" data-voucher="${c.id}"
               ${c.voucherUsado ? 'checked' : ''}
               title="${escapar(tituloVoucher)}"
               aria-label="Marcar que usó el voucher">
      </td>
      <td class="tabla__tenue">${escapar(String(c.fechaAlta || '').slice(0, 10))}</td>
      <td>${etiquetaLocal(c.sucursal)}</td>
      <td class="tabla__tenue">${escapar(c.usuario || '')}</td>
      <td class="tabla__acciones">${acciones(c)}</td>
    </tr>`;
}

/** El local que dio de alta al cliente, como etiqueta. */
function etiquetaLocal(sucursal) {
  if (!sucursal) return '<span class="tabla__tenue">—</span>';
  return `<span class="chip" data-local="${escapar(sucursal)}">${escapar(sucursal)}</span>`;
}

/** Editar y dar de baja son solo para administradores; el historial lo ve todo el que llega a esta pantalla. */
function acciones(c) {
  const cuantos = store.cantidadHistorial(c.id);
  const ojito = `
    <button class="boton-icono boton-icono--ojo" data-historial="${c.id}" type="button"
            title="Ver historial (${cuantos} ${cuantos === 1 ? 'registro' : 'registros'})">
      👁 ${cuantos || ''}
    </button>`;

  if (!auth.puede('editar')) return ojito;

  return `${ojito}
    <button class="boton-icono" data-editar="${c.id}" type="button" title="Editar">Editar</button>
    <button class="boton-icono boton-icono--peligro" data-baja="${c.id}" type="button" title="Dar de baja">Baja</button>`;
}

function conectarTabla() {
  document.querySelectorAll('[data-orden]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.orden;
      orden = { columna: col, asc: orden.columna === col ? !orden.asc : true };
      pintar();
    });
  });

  document.querySelectorAll('[data-editar]').forEach(btn => {
    btn.addEventListener('click', () => abrirEdicion(btn.dataset.editar));
  });

  document.querySelectorAll('[data-baja]').forEach(btn => {
    btn.addEventListener('click', () => darDeBaja(btn.dataset.baja));
  });

  document.querySelectorAll('[data-historial]').forEach(btn => {
    btn.addEventListener('click', () => abrirHistorial(btn.dataset.historial));
  });

  document.querySelectorAll('[data-voucher]').forEach(chk => {
    chk.addEventListener('change', async e => {
      const marcado = e.target.checked;
      try {
        await store.marcarVoucher(chk.dataset.voucher, marcado);
        if (marcado) avisar('Voucher registrado', 'ok');
      } catch (err) {
        avisar('No se pudo registrar el voucher: ' + err.message, 'error');
        e.target.checked = !marcado;
      }
    });
  });
}

/* ── Historial ──────────────────────────────────────────────────────────── */

let historiando = null;

function abrirHistorial(id) {
  const c = store.obtener(id);
  if (!c) return;

  historiando = id;
  $('canje-fecha').value = c.ultimoVoucher || hoyISO();
  $('modal-historial').hidden = false;
  pintarHistorial();
}

function cerrarHistorial() {
  const modal = $('modal-historial');
  if (modal) modal.hidden = true;
  historiando = null;
}

function pintarHistorial() {
  const c = store.obtener(historiando);
  if (!c) return cerrarHistorial();

  $('historial-titulo').textContent = c.nombreCompleto;

  const resumen = [];
  if (c.ultimoContacto) {
    resumen.push(`Último contacto: ${textoFechaCorta(c.ultimoContacto)}` +
                 (c.contactadoPor ? ` (${c.contactadoPor})` : ''));
  }
  if (c.ultimoVoucher) {
    resumen.push(`Último voucher: ${textoFechaCorta(c.ultimoVoucher)}` +
                 (c.voucherPor ? ` (${c.voucherPor})` : ''));
  }
  $('historial-sub').textContent = resumen.join(' · ') || 'Todavía no hay contactos ni canjes registrados.';

  $('btn-canje-borrar').hidden = !c.ultimoVoucher;

  const eventos = store.historialDe(historiando);
  const caja = $('historial-lista');

  if (!eventos.length) {
    caja.innerHTML = `
      <div class="vacio vacio--chico">
        <p class="vacio__texto">
          Sin movimientos registrados. El historial arranca a partir de la
          versión 2.2.0: lo que pasó antes no quedó guardado.
        </p>
      </div>`;
    return;
  }

  caja.innerHTML = eventos.map(hito).join('');
}

/** Un renglón de la línea de tiempo. */
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

async function registrarCanje() {
  if (!historiando) return;

  const fecha = $('canje-fecha').value;
  if (!fecha) return avisar('Elegí la fecha del canje', 'alerta');
  if (fecha > hoyISO()) return avisar('La fecha del canje no puede ser futura', 'alerta');

  const boton = $('btn-canje');
  boton.disabled = true;
  try {
    await store.marcarVoucher(historiando, true, fecha);
    avisar(`Canje registrado el ${textoFechaCorta(fecha)}`, 'ok');
  } catch (err) {
    avisar('No se pudo registrar: ' + err.message, 'error', 6000);
  } finally {
    boton.disabled = false;
  }
}

async function borrarCanje() {
  if (!historiando) return;
  try {
    await store.marcarVoucher(historiando, false);
    avisar('Canje borrado', 'ok');
  } catch (err) {
    avisar('No se pudo borrar: ' + err.message, 'error', 6000);
  }
}

/* ── Edición ────────────────────────────────────────────────────────────── */

let editando = null;

function abrirEdicion(id) {
  const c = store.obtener(id);
  if (!c) return;

  editando = id;
  $('edicion-titulo').textContent = c.nombreCompleto;
  $('e-nombre').value = `${c.nombre || ''} ${c.apellido || ''}`.trim();
  $('e-celular').value = mostrar(c.celular) || c.celular || '';
  $('e-email').value = c.email || '';
  $('e-notas').value = c.notas || '';

  const enInput = aInputDate(c.fechaNacimiento);
  $('e-fecha').value = enInput;
  $('e-fecha-ayuda').textContent = enInput
    ? ''
    : `Sin año cargado (${c.fechaNacimiento}). Si elegís una fecha, se guarda con año.`;

  $('modal-edicion').hidden = false;
  $('e-nombre').focus();
}

function cerrarEdicion() {
  const modal = $('modal-edicion');
  if (modal) modal.hidden = true;
  editando = null;
}

async function guardarEdicion() {
  if (!editando) return;

  const nombre = $('e-nombre').value.trim();
  if (!nombre) return avisar('Falta el nombre', 'alerta');

  const actual = store.obtener(editando);
  const enInput = $('e-fecha').value;
  const fechaNacimiento = enInput ? deInputADdMmAaaa(enInput) : actual.fechaNacimiento;

  if (!parseFechaNac(fechaNacimiento).valida) return avisar('La fecha no es válida', 'alerta');

  const boton = $('btn-guardar-edicion');
  boton.disabled = true;

  try {
    await store.editar(editando, {
      nombre,
      apellido: '',
      fechaNacimiento,
      celular: $('e-celular').value.trim(),
      email: $('e-email').value.trim().toLowerCase(),
      notas: $('e-notas').value.trim()
    });
    cerrarEdicion();
    avisar('Cambios guardados', 'ok');
  } catch (err) {
    avisar('No se pudo guardar: ' + err.message, 'error', 6000);
  } finally {
    boton.disabled = false;
  }
}

async function darDeBaja(id) {
  const c = store.obtener(id);
  if (!c) return;

  const confirmado = confirm(
    `¿Dar de baja a ${c.nombreCompleto}?\n\n` +
    'El registro deja de aparecer en la app, pero la fila se conserva en la planilla.'
  );
  if (!confirmado) return;

  try {
    await store.darDeBaja(id);
    avisar(`${c.nombreCompleto} dado de baja`, 'ok');
  } catch (err) {
    avisar('No se pudo dar de baja: ' + err.message, 'error', 6000);
  }
}

/* ── Exportación ────────────────────────────────────────────────────────── */

function exportar() {
  const lista = filtrados();
  if (!lista.length) return avisar('No hay nada para exportar', 'alerta');

  const filas = lista.map(c => ({
    nombre: c.nombreCompleto,
    fechaNacimiento: c.fechaNacimiento,
    proximoCumple: c.cumple ? c.cumple.iso : '',
    celular: c.celular,
    email: c.email || '',
    notas: c.notas || '',
    ultimoContacto: c.ultimoContacto || '',
    contactadoPor: c.contactadoPor || '',
    ultimoVoucher: c.ultimoVoucher || '',
    voucherPor: c.voucherPor || '',
    fechaAlta: c.fechaAlta || '',
    sucursal: c.sucursal || '',
    usuario: c.usuario || ''
  }));

  const columnas = [
    { clave: 'nombre',          titulo: 'Nombre' },
    { clave: 'fechaNacimiento', titulo: 'Fecha de nacimiento' },
    { clave: 'proximoCumple',   titulo: 'Próximo cumpleaños' },
    { clave: 'celular',         titulo: 'Celular' },
    { clave: 'email',           titulo: 'Email' },
    { clave: 'notas',           titulo: 'Notas' },
    { clave: 'ultimoContacto',  titulo: 'Último contacto' },
    { clave: 'contactadoPor',   titulo: 'Contactado por' },
    { clave: 'ultimoVoucher',   titulo: 'Último voucher' },
    { clave: 'voucherPor',      titulo: 'Voucher marcado por' },
    { clave: 'fechaAlta',       titulo: 'Fecha de alta' },
    { clave: 'sucursal',        titulo: 'Local' },
    { clave: 'usuario',         titulo: 'Cargado por' }
  ];

  descargar(nombreConFecha('bewild-clientes'), aCSV(filas, columnas));
  avisar(`${filas.length} ${filas.length === 1 ? 'cliente exportado' : 'clientes exportados'}`, 'ok');
}

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}
