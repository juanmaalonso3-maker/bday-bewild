/**
 * BE WILD · Vista "Cumpleaños del mes"
 * ----------------------------------------------------------------------------
 * Muestra los cumpleaños del mes calendario en curso, ordenados por día.
 *
 * Tres estados posibles:
 *   Pendiente  → todavía no llegó el día y no fue contactado
 *   Atrasado   → el día ya pasó y nadie lo contactó
 *   Contactado → ya recibió el saludo este año
 *
 * El filtro por defecto muestra lo que falta contactar (pendientes + atrasados).
 * Los atrasados se mantienen a la vista a propósito: si nadie abre la app una
 * semana, esos clientes se perderían para siempre.
 */

import * as store from './store.js';
import * as plantilla from './plantilla.js';
import { avisar } from './ui-avisos.js';
import { mostrar, linkWhatsApp, normalizar } from './utils-telefono.js';
import { mesActual, textoDiaMes, hoyPartes } from './utils-fecha.js';

let desuscribir = null;
let filtro = 'pendientes'; // 'pendientes' | 'todos'

export default {
  titulo: 'Cumpleaños del mes',

  render(contenedor) {
    contenedor.innerHTML = plantillaHtml();
    conectarControles();
    desuscribir = store.suscribir(pintar);
    plantilla.cargar();
  },

  destruir() {
    if (desuscribir) desuscribir();
    desuscribir = null;
  }
};

/* ── Estructura ─────────────────────────────────────────────────────────── */

function plantillaHtml() {
  return `
  <section class="tarjeta">
    <h2 class="seccion-titulo">
      ${mesActual()}
      <span class="seccion-titulo__cuenta" id="cuenta-cumples"></span>
    </h2>

    <div class="filtros">
      <button class="filtro" data-filtro="pendientes" type="button">A contactar</button>
      <button class="filtro" data-filtro="todos" type="button">Todo el mes</button>
      <span class="filtros__nota" id="nota-filtro"></span>
    </div>

    <div id="tabla-cumples"></div>
  </section>`;
}

const $ = id => document.getElementById(id);

function conectarControles() {
  document.querySelectorAll('.filtro').forEach(btn => {
    btn.addEventListener('click', () => {
      filtro = btn.dataset.filtro;
      pintar();
    });
  });
}

/* ── Datos ──────────────────────────────────────────────────────────────── */

/** Cumpleaños del mes en curso, ordenados por día. */
function delMes() {
  return store.listar()
    .filter(c => c.cumple && c.cumple.esteMes)
    .map(c => ({ ...c, estado: estadoDe(c) }))
    .sort((a, b) => a.cumple.dia - b.cumple.dia);
}

function estadoDe(c) {
  if (c.contactado) return 'contactado';
  return c.cumple.yaPaso ? 'atrasado' : 'pendiente';
}

/* ── Pintado ────────────────────────────────────────────────────────────── */

const ETIQUETAS = {
  pendiente:  'Pendiente',
  atrasado:   'Atrasado',
  contactado: 'Contactado'
};

function pintar() {
  const contenedor = $('tabla-cumples');
  if (!contenedor) return;

  const todos = delMes();
  const porContactar = todos.filter(c => c.estado !== 'contactado');
  const lista = filtro === 'todos' ? todos : porContactar;

  document.querySelectorAll('.filtro').forEach(btn => {
    btn.classList.toggle('filtro--activo', btn.dataset.filtro === filtro);
  });

  $('cuenta-cumples').textContent = todos.length
    ? `${todos.length} en el mes · ${porContactar.length} sin contactar`
    : '';

  const atrasados = todos.filter(c => c.estado === 'atrasado').length;
  $('nota-filtro').textContent = atrasados
    ? `${atrasados} ${atrasados === 1 ? 'quedó' : 'quedaron'} sin saludar`
    : '';

  if (!lista.length) {
    contenedor.innerHTML = `
      <div class="vacio vacio--chico">
        <p class="vacio__texto">${
          todos.length
            ? 'Ya saludaste a todos los cumpleaños de este mes.'
            : 'No hay cumpleaños cargados para este mes.'
        }</p>
      </div>`;
    return;
  }

  contenedor.innerHTML = `
    <table class="tabla tabla--cumples">
      <thead>
        <tr>
          <th>Día</th>
          <th>Nombre</th>
          <th>Nacimiento</th>
          <th>Celular</th>
          <th>Estado</th>
          <th class="tabla__acciones">Acción</th>
          <th>Contactado</th>
        </tr>
      </thead>
      <tbody>${lista.map(fila).join('')}</tbody>
    </table>`;

  conectarFilas();
}

function fila(c) {
  const tel = normalizar(c.celular);
  const hoy = hoyPartes();
  const esHoy = c.cumple.dia === hoy.dia;

  const celular = tel.valido
    ? escapar(mostrar(tel.canonico))
    : `<span class="revisar" title="Número a revisar">${escapar(c.celular || '—')}</span>`;

  const botonWpp = tel.valido
    ? `<button class="boton boton--chico boton--wpp" data-wpp="${c.id}" type="button">WhatsApp</button>`
    : `<span class="tabla__tenue">sin número</span>`;

  return `
    <tr data-estado="${c.estado}"${esHoy ? ' class="fila--hoy"' : ''}>
      <td class="tabla__numero">
        <span class="dia">${c.cumple.dia}</span>
        ${esHoy ? '<span class="etiqueta-hoy">hoy</span>' : ''}
      </td>
      <td><strong>${escapar(c.nombreCompleto)}</strong></td>
      <td class="tabla__tenue">${escapar(c.fechaNacimiento || '—')}${
        c.nacimiento.anio ? ` <span class="edad">(cumple ${hoy.anio - c.nacimiento.anio})</span>` : ''
      }</td>
      <td>${celular}</td>
      <td><span class="chip" data-estado-cumple="${c.estado}">${ETIQUETAS[c.estado]}</span></td>
      <td>${botonWpp}</td>
      <td class="tabla__centro">
        <input type="checkbox" class="check-contacto" data-contacto="${c.id}"
               ${c.contactado ? 'checked' : ''} aria-label="Marcar como contactado">
      </td>
    </tr>`;
}

function conectarFilas() {
  document.querySelectorAll('[data-wpp]').forEach(btn => {
    btn.addEventListener('click', () => abrirWhatsApp(btn.dataset.wpp));
  });

  document.querySelectorAll('[data-contacto]').forEach(chk => {
    chk.addEventListener('change', async e => {
      const id = chk.dataset.contacto;
      try {
        await store.marcarContacto(id, e.target.checked);
      } catch (err) {
        avisar('No se pudo marcar: ' + err.message, 'error');
        e.target.checked = !e.target.checked;
      }
    });
  });
}

/**
 * Abre el chat con el mensaje ya escrito y marca el contacto en el mismo paso.
 * Si el operador se arrepiente, puede destildar el checkbox.
 */
async function abrirWhatsApp(id) {
  const cliente = store.obtener(id);
  if (!cliente) return;

  const tel = normalizar(cliente.celular);
  if (!tel.valido) {
    avisar('El número no es válido. Corregilo en Base de datos.', 'alerta');
    return;
  }

  const mensaje = plantilla.aplicar(cliente);
  window.open(linkWhatsApp(tel.canonico, mensaje), '_blank', 'noopener');

  if (!cliente.contactado) {
    try {
      await store.marcarContacto(id, true);
      avisar(`${cliente.nombreCompleto} marcado como contactado`, 'ok');
    } catch (err) {
      avisar('Se abrió el chat pero no se pudo marcar: ' + err.message, 'alerta', 6000);
    }
  }
}

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}
