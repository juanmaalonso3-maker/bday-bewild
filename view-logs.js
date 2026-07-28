/**
 * BE WILD · Vista "Registro"
 * ----------------------------------------------------------------------------
 * Historial local de lo que hizo la app: altas, ediciones, bajas, contactos y
 * cualquier error de sincronización. Sirve para reconstruir qué pasó cuando
 * algo salió mal, sin depender de que alguien se acuerde.
 *
 * Los errores y advertencias además viajan a la hoja Logs de la planilla.
 */

import { historial, limpiarHistorial } from './logger.js';
import * as sync from './sync.js';
import { avisar } from './ui-avisos.js';
import { aCSV, descargar, nombreConFecha } from './utils-csv.js';

let filtroNivel = 'todos';
let entradas = [];

export default {
  titulo: 'Registro',

  render(contenedor) {
    contenedor.innerHTML = estructura();
    conectar();
    cargar();
  }
};

const $ = id => document.getElementById(id);

function estructura() {
  return `
  <section class="tarjeta">
    <h2 class="seccion-titulo">
      Cola de sincronización
      <span class="seccion-titulo__cuenta" id="cuenta-cola">—</span>
    </h2>
    <div class="acciones acciones--compactas">
      <button class="boton boton--chico" id="btn-reintentar" type="button">Reintentar ahora</button>
      <button class="boton boton--chico" id="btn-recargar" type="button">Recargar todo desde la planilla</button>
    </div>
  </section>

  <section class="tarjeta">
    <h2 class="seccion-titulo">
      Eventos
      <span class="seccion-titulo__cuenta" id="cuenta-logs"></span>
    </h2>

    <div class="barra-herramientas">
      <div class="filtros">
        <button class="filtro" data-nivel="todos" type="button">Todos</button>
        <button class="filtro" data-nivel="ERROR" type="button">Errores</button>
        <button class="filtro" data-nivel="WARN" type="button">Advertencias</button>
        <button class="filtro" data-nivel="INFO" type="button">Actividad</button>
      </div>
      <div class="acciones acciones--compactas">
        <button class="boton boton--chico" id="btn-exportar-log" type="button">Exportar CSV</button>
        <button class="boton boton--chico" id="btn-limpiar-log" type="button">Limpiar</button>
      </div>
    </div>

    <div class="tabla-scroll" id="tabla-logs"></div>
  </section>`;
}

function conectar() {
  document.querySelectorAll('[data-nivel]').forEach(btn => {
    btn.addEventListener('click', () => {
      filtroNivel = btn.dataset.nivel;
      pintar();
    });
  });

  $('btn-exportar-log').addEventListener('click', exportar);
  $('btn-limpiar-log').addEventListener('click', limpiar);

  $('btn-reintentar').addEventListener('click', async () => {
    await sync.reintentarAhora();
    avisar('Reintento disparado', 'ok');
    setTimeout(actualizarCola, 1200);
  });

  $('btn-recargar').addEventListener('click', async e => {
    const boton = e.currentTarget;
    boton.disabled = true;
    try {
      const { recibidos } = await sync.recargarTodo();
      avisar(`${recibidos} ${recibidos === 1 ? 'registro traído' : 'registros traídos'}`, 'ok');
      cargar();
    } catch (err) {
      avisar('No se pudo recargar: ' + err.message, 'error', 6000);
    } finally {
      boton.disabled = false;
    }
  });

  actualizarCola();
}

async function actualizarCola() {
  const n = await sync.pendientes();
  const el = $('cuenta-cola');
  if (el) el.textContent = n ? `${n} ${n === 1 ? 'operación esperando' : 'operaciones esperando'}` : 'todo sincronizado';
}

async function cargar() {
  entradas = (await historial()).reverse();
  pintar();
  actualizarCola();
}

function pintar() {
  const contenedor = $('tabla-logs');
  if (!contenedor) return;

  document.querySelectorAll('[data-nivel]').forEach(btn => {
    btn.classList.toggle('filtro--activo', btn.dataset.nivel === filtroNivel);
  });

  const lista = filtroNivel === 'todos'
    ? entradas
    : entradas.filter(e => e.nivel === filtroNivel);

  $('cuenta-logs').textContent = `${lista.length} ${lista.length === 1 ? 'evento' : 'eventos'}`;

  if (!lista.length) {
    contenedor.innerHTML = `
      <div class="vacio vacio--chico">
        <p class="vacio__texto">No hay eventos registrados.</p>
      </div>`;
    return;
  }

  contenedor.innerHTML = `
    <table class="tabla tabla--logs">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Nivel</th>
          <th>Evento</th>
          <th>Detalle</th>
          <th>Terminal</th>
        </tr>
      </thead>
      <tbody>
        ${lista.slice(0, 400).map(e => `
          <tr>
            <td class="tabla__tenue">${escapar(e.timestamp)}</td>
            <td><span class="chip" data-nivel-log="${e.nivel}">${e.nivel}</span></td>
            <td><code>${escapar(e.evento)}</code></td>
            <td class="tabla__tenue celda-detalle">${escapar(e.detalle)}</td>
            <td class="tabla__tenue">${escapar(e.usuario || '')}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    ${lista.length > 400 ? '<p class="pista">Se muestran los 400 más recientes. La exportación incluye todo.</p>' : ''}`;
}

function exportar() {
  if (!entradas.length) return avisar('No hay eventos para exportar', 'alerta');

  const columnas = [
    { clave: 'timestamp', titulo: 'Fecha' },
    { clave: 'nivel',     titulo: 'Nivel' },
    { clave: 'evento',    titulo: 'Evento' },
    { clave: 'detalle',   titulo: 'Detalle' },
    { clave: 'usuario',   titulo: 'Terminal' },
    { clave: 'clienteId', titulo: 'ID cliente' }
  ];

  descargar(nombreConFecha('bewild-registro'), aCSV(entradas, columnas));
  avisar(`${entradas.length} eventos exportados`, 'ok');
}

async function limpiar() {
  if (!confirm('¿Borrar el registro local?\n\nNo afecta a los clientes ni a la hoja Logs de la planilla.')) return;
  await limpiarHistorial();
  entradas = [];
  pintar();
  avisar('Registro vaciado', 'ok');
}

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}
