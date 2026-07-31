/**
 * BE WILD · Vista "Carga de clientes"
 * ----------------------------------------------------------------------------
 * El formulario nunca espera al servidor: al guardar, el cliente aparece en la
 * tabla de abajo y el foco vuelve al primer campo. La sincronización se muestra
 * como un estado en la fila, no como una demora.
 */

import * as store from './store.js?v=2.1.0';
import { avisar } from './ui-avisos.js?v=2.1.0';
import { normalizar, mostrar } from './utils-telefono.js?v=2.1.0';
import { deInputADdMmAaaa, parseFechaNac, MESES, dos, hoyPartes } from './utils-fecha.js?v=2.1.0';

let desuscribir = null;

export default {
  titulo: 'Carga de clientes',

  render(contenedor) {
    contenedor.innerHTML = plantilla();
    conectarFormulario();
    desuscribir = store.suscribir(pintarTabla);
  },

  destruir() {
    if (desuscribir) desuscribir();
    desuscribir = null;
  }
};

/* ── Estructura ─────────────────────────────────────────────────────────── */

function plantilla() {
  const opcionesDia = Array.from({ length: 31 }, (_, i) =>
    `<option value="${i + 1}">${i + 1}</option>`).join('');
  const opcionesMes = MESES.map((m, i) =>
    `<option value="${i + 1}">${m}</option>`).join('');

  return `
  <div class="carga">

    <section class="tarjeta">
      <h2 class="seccion-titulo">Nuevo cliente</h2>

      <div class="formulario" id="form-cliente">
        <div class="campo campo--nombre">
          <label for="f-nombre">Nombre y apellido</label>
          <input id="f-nombre" type="text" autocomplete="off" spellcheck="false" maxlength="80"
                 placeholder="Juana Pérez">
        </div>

        <div class="campo campo--fecha">
          <label for="f-fecha">Fecha de nacimiento</label>
          <input id="f-fecha" type="date" max="${hoyPartes().anio}-12-31">
          <div class="sin-anio" id="sin-anio-campos" hidden>
            <select id="f-dia" aria-label="Día">${opcionesDia}</select>
            <select id="f-mes" aria-label="Mes">${opcionesMes}</select>
          </div>
          <label class="check-chico">
            <input type="checkbox" id="f-sin-anio">
            <span>No sé el año</span>
          </label>
        </div>

        <div class="campo campo--celular">
          <label for="f-celular">Celular</label>
          <input id="f-celular" type="tel" inputmode="numeric" autocomplete="off" placeholder="11 5555-1234">
          <p class="campo__ayuda" id="ayuda-celular"></p>
        </div>

        <div class="campo campo--email">
          <label for="f-email">Email <span class="opcional">(opcional)</span></label>
          <input id="f-email" type="email" autocomplete="off" spellcheck="false"
                 maxlength="80" placeholder="nombre@mail.com">
          <p class="campo__ayuda" id="ayuda-email"></p>
        </div>

        <div class="campo campo--notas">
          <label for="f-notas">Notas <span class="opcional">(opcional)</span></label>
          <input id="f-notas" type="text" autocomplete="off" maxlength="200"
                 placeholder="Talle, preferencias, qué se llevó…">
        </div>

        <div class="campo campo--accion">
          <button class="boton boton--principal" id="btn-guardar" type="button">Guardar cliente</button>
        </div>
      </div>

      <div class="alerta-duplicado" id="alerta-duplicado" hidden></div>
      <p class="pista">Enter pasa al campo siguiente. En el último, guarda.</p>
    </section>

    <section class="tarjeta">
      <h2 class="seccion-titulo">
        Cargados hoy
        <span class="seccion-titulo__cuenta" id="cuenta-hoy"></span>
      </h2>

      <div class="aviso-error" id="aviso-error" hidden>
        <div class="aviso-error__texto">
          <strong id="aviso-error__titulo"></strong>
          <span id="aviso-error__detalle"></span>
        </div>
        <button class="boton boton--chico" id="btn-reintentar-todo" type="button">Reintentar todo</button>
      </div>

      <div id="tabla-hoy"></div>
    </section>

  </div>`;
}

/* ── Formulario ─────────────────────────────────────────────────────────── */

const $ = id => document.getElementById(id);

function conectarFormulario() {
  const campos = ['f-nombre', 'f-fecha', 'f-celular', 'f-email', 'f-notas'];

  // Enter encadena los campos; en el último, guarda.
  campos.forEach((id, i) => {
    $(id).addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (i === campos.length - 1) guardar();
      else $(campos[i + 1]).focus();
    });
  });

  $('f-sin-anio').addEventListener('change', e => {
    const sinAnio = e.target.checked;
    $('f-fecha').hidden = sinAnio;
    $('sin-anio-campos').hidden = !sinAnio;
    (sinAnio ? $('f-dia') : $('f-fecha')).focus();
  });

  $('f-celular').addEventListener('blur', revisarCelular);
  $('f-celular').addEventListener('input', () => {
    $('ayuda-celular').textContent = '';
    $('alerta-duplicado').hidden = true;
  });

  $('f-email').addEventListener('blur', revisarEmail);
  $('f-email').addEventListener('input', () => { $('ayuda-email').textContent = ''; });

  $('btn-guardar').addEventListener('click', guardar);

  $('btn-reintentar-todo').addEventListener('click', async e => {
    const boton = e.currentTarget;
    boton.disabled = true;
    boton.textContent = 'Enviando…';
    try {
      await store.reintentarTodo();
      avisar('Reintento enviado', 'ok');
    } catch (err) {
      avisar('No se pudo reintentar: ' + err.message, 'error');
    } finally {
      boton.disabled = false;
      boton.textContent = 'Reintentar todo';
    }
  });

  $('f-nombre').focus();
}

/** Avisa si el número no se entiende o si ya existe en la base. */
function revisarCelular() {
  const valor = $('f-celular').value.trim();
  const ayuda = $('ayuda-celular');
  const alerta = $('alerta-duplicado');

  ayuda.textContent = '';
  ayuda.className = 'campo__ayuda';
  alerta.hidden = true;
  if (!valor) return;

  const tel = normalizar(valor);

  if (!tel.valido) {
    ayuda.textContent = tel.motivo + '. Se va a guardar igual, marcado para revisar.';
    ayuda.className = 'campo__ayuda campo__ayuda--alerta';
    return;
  }

  ayuda.textContent = mostrar(tel.canonico) + (tel.asumido ? ' · se asumió el código 11' : '');

  const existente = store.buscarPorCelular(tel.canonico);
  if (existente) {
    alerta.hidden = false;
    alerta.innerHTML = `
      <strong>Este número ya está en la base.</strong>
      ${escapar(existente.nombreCompleto)} — cargado el ${escapar(existente.fechaAlta || 's/d')}.
      Podés guardarlo igual si es otra persona.`;
  }
}

/**
 * El mail es opcional, así que un formato raro avisa pero no frena la carga:
 * en el mostrador es preferible un dato imperfecto a perder el cliente.
 */
function revisarEmail() {
  const valor = $('f-email').value.trim();
  const ayuda = $('ayuda-email');
  ayuda.textContent = '';
  ayuda.className = 'campo__ayuda';
  if (!valor) return;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor)) {
    ayuda.textContent = 'Revisá el formato del mail.';
    ayuda.className = 'campo__ayuda campo__ayuda--alerta';
    return;
  }

  const existente = store.buscarPorEmail(valor);
  if (existente) {
    ayuda.textContent = `Ya lo tiene ${existente.nombreCompleto}.`;
    ayuda.className = 'campo__ayuda campo__ayuda--alerta';
  }
}

/** Toma los datos del formulario. */
function leerFormulario() {
  const sinAnio = $('f-sin-anio').checked;

  let fechaNacimiento = '';
  if (sinAnio) {
    fechaNacimiento = `${dos(Number($('f-dia').value))}/${dos(Number($('f-mes').value))}`;
  } else if ($('f-fecha').value) {
    fechaNacimiento = deInputADdMmAaaa($('f-fecha').value);
  }

  return {
    // Nombre y apellido van juntos en un solo campo: en el mostrador se escribe
    // de corrido y separarlos obligaba a decidir dónde termina uno y empieza
    // el otro, algo que falla con nombres compuestos.
    nombre: $('f-nombre').value.trim(),
    apellido: '',
    fechaNacimiento,
    celular: $('f-celular').value.trim(),
    email: $('f-email').value.trim().toLowerCase(),
    notas: $('f-notas').value.trim()
  };
}

async function guardar() {
  const datos = leerFormulario();

  if (!datos.nombre) return frenar('f-nombre', 'Falta el nombre');
  if (!datos.fechaNacimiento) return frenar('f-fecha', 'Falta la fecha de nacimiento');
  if (!parseFechaNac(datos.fechaNacimiento).valida) return frenar('f-fecha', 'La fecha no es válida');
  if (!datos.celular) return frenar('f-celular', 'Falta el celular');

  const boton = $('btn-guardar');
  boton.disabled = true;

  try {
    const cliente = await store.agregar(datos);
    limpiarFormulario();
    avisar(`${cliente.nombreCompleto} guardado`, 'ok');
  } catch (err) {
    avisar('No se pudo guardar: ' + err.message, 'error', 6000);
  } finally {
    boton.disabled = false;
  }
}

function frenar(idCampo, mensaje) {
  avisar(mensaje, 'alerta');
  $(idCampo).focus();
}

function limpiarFormulario() {
  ['f-nombre', 'f-fecha', 'f-celular', 'f-email', 'f-notas'].forEach(id => { $(id).value = ''; });
  $('f-sin-anio').checked = false;
  $('f-fecha').hidden = false;
  $('sin-anio-campos').hidden = true;
  $('ayuda-celular').textContent = '';
  $('ayuda-email').textContent = '';
  $('alerta-duplicado').hidden = true;
  $('f-nombre').focus();
}

/* ── Tabla del día ──────────────────────────────────────────────────────── */

const ETIQUETAS_SYNC = {
  pendiente:     'Pendiente',
  sincronizando: 'Enviando',
  sincronizado:  'Guardado',
  error:         'Error'
};

function pintarTabla() {
  const contenedor = $('tabla-hoy');
  if (!contenedor) return;

  const lista = store.altasDeHoy();
  $('cuenta-hoy').textContent = lista.length
    ? `${lista.length} ${lista.length === 1 ? 'cliente' : 'clientes'}`
    : '';

  if (!lista.length) {
    contenedor.innerHTML = `
      <div class="vacio vacio--chico">
        <p class="vacio__texto">Todavía no cargaste ningún cliente hoy.</p>
      </div>`;
    return;
  }

  contenedor.innerHTML = `
    <table class="tabla">
      <thead>
        <tr>
          <th>Hora</th>
          <th>Nombre</th>
          <th>Nacimiento</th>
          <th>Celular</th>
          <th>Email</th>
          <th>Notas</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map(fila).join('')}
      </tbody>
    </table>`;

  conectarReintentos(lista);
}

/** Botones de reintento, por fila y general. */
function conectarReintentos(lista) {
  document.querySelectorAll('[data-reintentar]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Enviando…';
      try {
        await store.reintentar(btn.dataset.reintentar);
      } catch (err) {
        avisar('No se pudo reintentar: ' + err.message, 'error');
      }
    });
  });

  const conError = lista.filter(c => c.estadoSync === 'error');
  const aviso = $('aviso-error');
  if (!aviso) return;

  aviso.hidden = !conError.length;
  if (!conError.length) return;

  $('aviso-error__titulo').textContent =
    conError.length === 1
      ? 'Un cliente no se pudo guardar en la planilla.'
      : `${conError.length} clientes no se pudieron guardar en la planilla.`;

  // El motivo del primer error alcanza: cuando fallan varios, casi siempre es
  // por la misma causa.
  $('aviso-error__detalle').textContent = conError[0].errorSync
    ? ' ' + conError[0].errorSync
    : ' Están guardados en esta computadora y se reenvían al reintentar.';
}

function fila(c) {
  const hora = String(c.fechaAlta || '').slice(11, 16);
  const tel = normalizar(c.celular);
  const celular = tel.valido
    ? escapar(mostrar(tel.canonico))
    : `<span class="revisar" title="Número a revisar">${escapar(c.celular)}</span>`;

  return `
    <tr>
      <td class="tabla__tenue">${hora}</td>
      <td><strong>${escapar(c.nombreCompleto)}</strong></td>
      <td>${escapar(c.fechaNacimiento || '—')}</td>
      <td>${celular}</td>
      <td class="tabla__tenue">${escapar(c.email || '')}</td>
      <td class="tabla__tenue">${escapar(c.notas || '')}</td>
      <td class="celda-estado">${estadoConBoton(c)}</td>
    </tr>`;
}

/**
 * Estado de la fila. Cuando algo falló se agrega el botón de reintentar:
 * la mayoría de los errores son pasajeros (se cayó internet, el servidor tardó)
 * y se resuelven con un clic, sin tener que volver a cargar al cliente.
 */
function estadoConBoton(c) {
  const chip = `<span class="chip" data-estado="${c.estadoSync}" title="${escapar(c.errorSync || '')}">${
    ETIQUETAS_SYNC[c.estadoSync] || c.estadoSync
  }</span>`;

  if (c.estadoSync !== 'error') return chip;

  return `${chip}
    <button class="boton-icono boton-icono--reintentar" data-reintentar="${c.id}"
            type="button" title="Volver a enviar">Reintentar</button>`;
}

/** Evita que un nombre con < o & rompa la tabla. */
function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}
