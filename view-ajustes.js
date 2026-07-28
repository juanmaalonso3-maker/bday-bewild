/**
 * BE WILD · Vista "Ajustes"
 * ----------------------------------------------------------------------------
 * Por ahora solo el mensaje de cumpleaños. Se guarda en la hoja Config, así que
 * el cambio lo ven las dos sucursales sin tocar el código.
 */

import * as plantilla from './plantilla.js';
import { avisar } from './ui-avisos.js';
import { TERMINALES } from './config.js';
import * as terminal from './ui-terminal.js';

export default {
  titulo: 'Ajustes',

  render(contenedor) {
    contenedor.innerHTML = `
    <section class="tarjeta">
      <h2 class="seccion-titulo">Mensaje de cumpleaños</h2>

      <p class="ayuda-bloque">
        Este es el texto que se abre en WhatsApp al tocar el botón.
        Podés usar <code>{nombre}</code> para el nombre de pila,
        <code>{dia}</code> y <code>{mes}</code> para la fecha.
      </p>

      <textarea id="txt-plantilla" class="entrada entrada--texto" rows="5"
                maxlength="900">${escapar(plantilla.obtener())}</textarea>

      <div class="previa">
        <span class="previa__titulo">Así lo va a recibir</span>
        <p class="previa__texto" id="previa-texto"></p>
      </div>

      <div class="acciones">
        <button class="boton boton--principal" id="btn-guardar-plantilla" type="button">Guardar mensaje</button>
        <button class="boton" id="btn-restaurar" type="button">Restaurar el original</button>
      </div>
    </section>

    <section class="tarjeta">
      <h2 class="seccion-titulo">Terminal de esta computadora</h2>
      <p class="ayuda-bloque">
        Queda registrada en cada cliente que se carga desde acá.
        Cuando activemos el ingreso con Google, se reemplaza por el usuario real.
      </p>
      <div class="terminales" id="lista-terminales"></div>
    </section>`;

    conectar();
  }
};

function conectar() {
  const campo = document.getElementById('txt-plantilla');

  const refrescarPrevia = () => {
    document.getElementById('previa-texto').textContent = plantilla.vistaPrevia(campo.value);
  };

  campo.addEventListener('input', refrescarPrevia);
  refrescarPrevia();

  document.getElementById('btn-guardar-plantilla').addEventListener('click', async e => {
    const boton = e.currentTarget;
    boton.disabled = true;
    try {
      await plantilla.guardar(campo.value);
      avisar('Mensaje guardado', 'ok');
    } catch (err) {
      avisar('No se pudo guardar: ' + err.message, 'error', 6000);
    } finally {
      boton.disabled = false;
    }
  });

  document.getElementById('btn-restaurar').addEventListener('click', () => {
    campo.value = plantilla.porDefecto();
    refrescarPrevia();
    avisar('Texto original cargado. Acordate de guardarlo.', 'alerta');
  });

  pintarTerminales();
}

function pintarTerminales() {
  const cont = document.getElementById('lista-terminales');
  const activa = terminal.obtener();

  cont.innerHTML = TERMINALES.map(t => `
    <button class="opcion-terminal ${t.id === activa ? 'opcion-terminal--activa' : ''}"
            data-terminal="${t.id}" type="button">
      <span>${t.nombre}</span>
      <span class="opcion-terminal__nota">${t.nota}</span>
    </button>`).join('');

  cont.querySelectorAll('[data-terminal]').forEach(btn => {
    btn.addEventListener('click', () => {
      terminal.definir(btn.dataset.terminal);
      pintarTerminales();
      avisar('Terminal actualizada', 'ok');
    });
  });
}

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}
