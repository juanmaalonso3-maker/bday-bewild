/**
 * BE WILD · Vista "Cumpleaños"
 * ----------------------------------------------------------------------------
 * Muestra los cumpleaños de un mes, ordenados por día, con un selector para
 * moverse a cualquier mes: ‹ agosto 2026 ›. Arranca siempre en el mes en curso.
 *
 * El mes que viene es tan importante como el actual: a los cumpleaños de
 * septiembre conviene empezar a contactarlos en agosto, así el saludo y el
 * voucher llegan antes y no el mismo día a las corridas.
 *
 * Estados posibles, según el mes que se esté mirando:
 *   Pendiente   → mes en curso, todavía no llegó el día, sin contactar
 *   Atrasado    → el día ya pasó (o el mes ya pasó) y nadie lo contactó
 *   Adelantar   → mes futuro, sin contactar: es lo que hay que ir haciendo
 *   Contactado  → ya recibió el saludo en este ciclo
 *
 * Cada fila tiene dos marcas independientes: "Contactado" (le escribimos) y
 * "Usó voucher" (vino y lo canjeó). La segunda es la que dice si la campaña
 * sirvió de algo.
 */

import * as store from './store.js?v=2.2.0';
import * as router from './router.js?v=2.2.0';
import * as plantilla from './plantilla.js?v=2.2.0';
import { avisar } from './ui-avisos.js?v=2.2.0';
import { mostrar, linkWhatsApp, normalizar } from './utils-telefono.js?v=2.2.0';
import { textoMesAnio, hoyPartes, mesSiguiente, mesAnterior, compararMeses,
         marcadoParaCiclo, esBisiesto, textoFechaCorta } from './utils-fecha.js?v=2.2.0';

let desuscribir = null;
let filtro = 'pendientes'; // 'pendientes' | 'todos'

/** Mes que se está mirando. Se conserva al ir y volver dentro de la sesión. */
let vista = null;

/** Deja la vista posicionada en el mes en curso. */
function mesEnCurso() {
  const hoy = hoyPartes();
  return { mes: hoy.mes, anio: hoy.anio };
}

/**
 * Abre la sección de cumpleaños directamente en un mes.
 * La usa el dashboard para que "cumplen el mes que viene" lleve justo ahí.
 */
export function irAlMes(mes, anio) {
  vista = { mes, anio };
  filtro = 'pendientes';
  router.ir('cumpleanos');
  pintar();
}

export default {
  titulo: 'Cumpleaños',

  render(contenedor) {
    if (!vista) vista = mesEnCurso();
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
    <div class="mes-nav">
      <button class="mes-nav__flecha" id="mes-anterior" type="button"
              aria-label="Mes anterior">‹</button>
      <div class="mes-nav__centro">
        <h2 class="mes-nav__titulo" id="mes-titulo">—</h2>
        <span class="seccion-titulo__cuenta" id="cuenta-cumples"></span>
      </div>
      <button class="mes-nav__flecha" id="mes-siguiente" type="button"
              aria-label="Mes siguiente">›</button>
      <button class="boton boton--chico mes-nav__hoy" id="mes-hoy" type="button" hidden>
        Volver al mes actual
      </button>
    </div>

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

  $('mes-anterior').addEventListener('click', () => {
    vista = mesAnterior(vista.mes, vista.anio);
    pintar();
  });

  $('mes-siguiente').addEventListener('click', () => {
    vista = mesSiguiente(vista.mes, vista.anio);
    pintar();
  });

  $('mes-hoy').addEventListener('click', () => {
    vista = mesEnCurso();
    pintar();
  });
}

/* ── Datos ──────────────────────────────────────────────────────────────── */

/**
 * Cumpleaños del mes que se está mirando, ordenados por día.
 * El 29/02 se muestra como 28/02 en los años que no son bisiestos.
 */
function delMes() {
  const { mes, anio } = vista;

  return store.listar()
    .filter(c => c.nacimiento && c.nacimiento.valida && c.nacimiento.mes === mes)
    .map(c => {
      const dia = (mes === 2 && c.nacimiento.dia === 29 && !esBisiesto(anio))
        ? 28
        : c.nacimiento.dia;

      const contactado = marcadoParaCiclo(c.ultimoContacto, mes, anio);
      const voucher = marcadoParaCiclo(c.ultimoVoucher, mes, anio);

      return { ...c, dia, contactadoEnMes: contactado, voucherEnMes: voucher,
               estado: estadoDe(dia, contactado) };
    })
    .sort((a, b) => a.dia - b.dia || a.nombreCompleto.localeCompare(b.nombreCompleto, 'es'));
}

/** Estado de una fila según el mes que se esté mirando. */
function estadoDe(dia, contactado) {
  if (contactado) return 'contactado';

  const hoy = hoyPartes();
  const relacion = compararMeses(vista.mes, vista.anio, hoy.mes, hoy.anio);

  if (relacion > 0) return 'proximo';   // todavía no llegó ese mes
  if (relacion < 0) return 'atrasado';  // el mes entero ya pasó
  return dia < hoy.dia ? 'atrasado' : 'pendiente';
}

/* ── Pintado ────────────────────────────────────────────────────────────── */

const ETIQUETAS = {
  pendiente:  'Pendiente',
  atrasado:   'Atrasado',
  proximo:    'Adelantar',
  contactado: 'Contactado'
};

function pintar() {
  const contenedor = $('tabla-cumples');
  if (!contenedor) return;

  const hoy = hoyPartes();
  const relacion = compararMeses(vista.mes, vista.anio, hoy.mes, hoy.anio);

  $('mes-titulo').textContent = textoMesAnio(vista.mes, vista.anio);
  $('mes-hoy').hidden = relacion === 0;

  const todos = delMes();
  const porContactar = todos.filter(c => c.estado !== 'contactado');
  const conVoucher = todos.filter(c => c.voucherEnMes).length;
  const lista = filtro === 'todos' ? todos : porContactar;

  document.querySelectorAll('.filtro').forEach(btn => {
    btn.classList.toggle('filtro--activo', btn.dataset.filtro === filtro);
  });

  $('cuenta-cumples').textContent = todos.length
    ? `${todos.length} en el mes · ${porContactar.length} sin contactar · ${conVoucher} ${conVoucher === 1 ? 'usó' : 'usaron'} el voucher`
    : '';

  $('nota-filtro').textContent = notaDelMes(todos, relacion);

  if (!lista.length) {
    contenedor.innerHTML = `
      <div class="vacio vacio--chico">
        <p class="vacio__texto">${textoVacio(todos.length, relacion)}</p>
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
          <th class="tabla__centro">Contactado</th>
          <th class="tabla__centro">Usó voucher</th>
        </tr>
      </thead>
      <tbody>${lista.map(fila).join('')}</tbody>
    </table>`;

  conectarFilas();
}

/** El renglón de contexto debajo de los filtros. */
function notaDelMes(todos, relacion) {
  if (!todos.length) return '';

  if (relacion > 0) {
    const faltan = todos.filter(c => !c.contactadoEnMes).length;
    return faltan
      ? `${faltan} para ir adelantando este mes`
      : 'Ya están todos adelantados';
  }

  const atrasados = todos.filter(c => c.estado === 'atrasado').length;
  if (!atrasados) return '';
  return `${atrasados} ${atrasados === 1 ? 'quedó' : 'quedaron'} sin saludar`;
}

function textoVacio(cuantos, relacion) {
  if (!cuantos) return 'No hay cumpleaños cargados para este mes.';
  if (relacion > 0) return 'Ya adelantaste el contacto de todos los de este mes.';
  return 'Ya saludaste a todos los cumpleaños de este mes.';
}

function fila(c) {
  const tel = normalizar(c.celular);
  const hoy = hoyPartes();
  const esHoy = c.dia === hoy.dia && vista.mes === hoy.mes && vista.anio === hoy.anio;

  const celular = tel.valido
    ? escapar(mostrar(tel.canonico))
    : `<span class="revisar" title="Número a revisar">${escapar(c.celular || '—')}</span>`;

  const botonWpp = tel.valido
    ? `<button class="boton boton--chico boton--wpp" data-wpp="${c.id}" type="button">WhatsApp</button>`
    : `<span class="tabla__tenue">sin número</span>`;

  const cumpleAnios = c.nacimiento.anio ? vista.anio - c.nacimiento.anio : null;

  return `
    <tr data-estado="${c.estado}"${esHoy ? ' class="fila--hoy"' : ''}>
      <td class="tabla__numero">
        <span class="dia">${c.dia}</span>
        ${esHoy ? '<span class="etiqueta-hoy">hoy</span>' : ''}
      </td>
      <td><strong>${escapar(c.nombreCompleto)}</strong></td>
      <td class="tabla__tenue">${escapar(c.fechaNacimiento || '—')}${
        cumpleAnios !== null ? ` <span class="edad">(cumple ${cumpleAnios})</span>` : ''
      }</td>
      <td>${celular}</td>
      <td><span class="chip" data-estado-cumple="${c.estado}">${ETIQUETAS[c.estado]}</span></td>
      <td>${botonWpp}</td>
      <td class="tabla__centro">
        <input type="checkbox" class="check-contacto" data-contacto="${c.id}"
               ${c.contactadoEnMes ? 'checked' : ''}
               title="${c.contactadoEnMes ? tituloMarca('Contactada', c.ultimoContacto, c.contactadoPor) : 'Marcar como contactada'}"
               aria-label="Marcar como contactada">
      </td>
      <td class="tabla__centro">
        <input type="checkbox" class="check-voucher" data-voucher="${c.id}"
               ${c.voucherEnMes ? 'checked' : ''}
               title="${c.voucherEnMes ? tituloMarca('Usó el voucher', c.ultimoVoucher, c.voucherPor) : 'Marcar que usó el voucher'}"
               aria-label="Marcar que usó el voucher">
      </td>
    </tr>`;
}

/** "Usó el voucher el 12/09/2026 · lo marcó bw.este@bewild.com.ar" */
function tituloMarca(que, fecha, quien) {
  const partes = [`${que} el ${textoFechaCorta(fecha)}`];
  if (quien) partes.push(`lo marcó ${quien}`);
  return escapar(partes.join(' · '));
}

function conectarFilas() {
  document.querySelectorAll('[data-wpp]').forEach(btn => {
    btn.addEventListener('click', () => abrirWhatsApp(btn.dataset.wpp));
  });

  document.querySelectorAll('[data-contacto]').forEach(chk => {
    chk.addEventListener('change', async e => {
      try {
        await store.marcarContacto(chk.dataset.contacto, e.target.checked);
      } catch (err) {
        avisar('No se pudo marcar: ' + err.message, 'error');
        e.target.checked = !e.target.checked;
      }
    });
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

  const yaContactado = marcadoParaCiclo(cliente.ultimoContacto, vista.mes, vista.anio);
  if (!yaContactado) {
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
