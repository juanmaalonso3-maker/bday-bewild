/**
 * BE WILD · Vista "Base de datos"
 * ----------------------------------------------------------------------------
 * La base completa, con buscador, orden por columna, edición, baja y
 * exportación a CSV.
 *
 * La baja es lógica: la fila se conserva en la planilla marcada como inactiva.
 * Nada se borra de verdad, así que un clic equivocado siempre se puede revertir
 * desde el Sheet.
 */

import * as store from './store.js';
import { avisar } from './ui-avisos.js';
import { mostrar, normalizar } from './utils-telefono.js';
import { aCSV, descargar, nombreConFecha } from './utils-csv.js';
import { deInputADdMmAaaa, aInputDate, parseFechaNac, textoDiaMes } from './utils-fecha.js';

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
      <button class="boton boton--chico" id="btn-exportar" type="button">Exportar CSV</button>
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
          <label for="e-notas">Notas</label>
          <input id="e-notas" type="text" maxlength="120">
        </div>
      </div>

      <div class="acciones">
        <button class="boton boton--principal" id="btn-guardar-edicion" type="button">Guardar cambios</button>
        <button class="boton" id="btn-cancelar-edicion" type="button">Cancelar</button>
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

  $('btn-exportar').addEventListener('click', exportar);
  $('btn-cancelar-edicion').addEventListener('click', cerrarEdicion);
  $('btn-guardar-edicion').addEventListener('click', guardarEdicion);

  document.addEventListener('keydown', escaparModal);
}

function escaparModal(e) {
  if (e.key === 'Escape') cerrarEdicion();
}

/* ── Datos ──────────────────────────────────────────────────────────────── */

const COLUMNAS = [
  { clave: 'nombreCompleto',  titulo: 'Nombre',      ordenable: true },
  { clave: 'fechaNacimiento', titulo: 'Nacimiento',  ordenable: true },
  { clave: 'proximo',         titulo: 'Próximo',     ordenable: true },
  { clave: 'celular',         titulo: 'Celular',     ordenable: true },
  { clave: 'notas',           titulo: 'Notas',       ordenable: false },
  { clave: 'fechaAlta',       titulo: 'Alta',        ordenable: true },
  { clave: 'usuario',         titulo: 'Terminal',    ordenable: true }
];

function filtrados() {
  let lista = store.listar();

  if (busqueda) {
    lista = lista.filter(c =>
      c.nombreCompleto.toLowerCase().includes(busqueda) ||
      String(c.celular).includes(busqueda.replace(/\D/g, '')) ||
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
  if (!col.ordenable) return `<th>${col.titulo}</th>`;
  const activa = orden.columna === col.clave;
  const flecha = activa ? (orden.asc ? ' ↑' : ' ↓') : '';
  return `<th class="th-ordenable${activa ? ' th--activa' : ''}" data-orden="${col.clave}">${col.titulo}${flecha}</th>`;
}

function fila(c) {
  const tel = normalizar(c.celular);
  const celular = tel.valido
    ? escapar(mostrar(tel.canonico))
    : `<span class="revisar">${escapar(c.celular || '—')}</span>`;

  const proximo = c.cumple
    ? `${textoDiaMes(c.cumple.dia, c.cumple.mes)}${c.contactado ? ' <span class="ok-mini">✓</span>' : ''}`
    : '<span class="revisar">fecha inválida</span>';

  return `
    <tr>
      <td><strong>${escapar(c.nombreCompleto)}</strong></td>
      <td>${escapar(c.fechaNacimiento || '—')}</td>
      <td class="tabla__tenue">${proximo}</td>
      <td>${celular}</td>
      <td class="tabla__tenue">${escapar(c.notas || '')}</td>
      <td class="tabla__tenue">${escapar(String(c.fechaAlta || '').slice(0, 10))}</td>
      <td class="tabla__tenue">${escapar(c.usuario || '')}</td>
      <td class="tabla__acciones">
        <button class="boton-icono" data-editar="${c.id}" type="button" title="Editar">Editar</button>
        <button class="boton-icono boton-icono--peligro" data-baja="${c.id}" type="button" title="Dar de baja">Baja</button>
      </td>
    </tr>`;
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
    notas: c.notas || '',
    ultimoContacto: c.ultimoContacto || '',
    fechaAlta: c.fechaAlta || '',
    usuario: c.usuario || ''
  }));

  const columnas = [
    { clave: 'nombre',          titulo: 'Nombre' },
    { clave: 'fechaNacimiento', titulo: 'Fecha de nacimiento' },
    { clave: 'proximoCumple',   titulo: 'Próximo cumpleaños' },
    { clave: 'celular',         titulo: 'Celular' },
    { clave: 'notas',           titulo: 'Notas' },
    { clave: 'ultimoContacto',  titulo: 'Último contacto' },
    { clave: 'fechaAlta',       titulo: 'Fecha de alta' },
    { clave: 'usuario',         titulo: 'Terminal' }
  ];

  descargar(nombreConFecha('bewild-clientes'), aCSV(filas, columnas));
  avisar(`${filas.length} ${filas.length === 1 ? 'cliente exportado' : 'clientes exportados'}`, 'ok');
}

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}
