/**
 * BE WILD · Vista "Ajustes"
 * ----------------------------------------------------------------------------
 * Por ahora solo el mensaje de cumpleaños. Se guarda en la hoja Config, así que
 * el cambio lo ven las dos sucursales sin tocar el código.
 */

import * as plantilla from './plantilla.js?v=2.1.0';
import { avisar } from './ui-avisos.js?v=2.1.0';
import * as auth from './auth.js?v=2.1.0';

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
      <h2 class="seccion-titulo">Sesión</h2>
      <p class="ayuda-bloque">
        Estos datos quedan registrados en cada cliente que cargues, para saber
        desde qué local se dio de alta.
      </p>
      <dl class="datos-sesion" id="datos-sesion"></dl>
    </section>`;

    conectar();
  }
};

function conectar() {
  const campo = document.getElementById('txt-plantilla');

  // Los operadores ven el mensaje pero no lo cambian: la promo la define
  // administración y tiene que ser la misma en las dos sucursales.
  if (!auth.puede('configurar')) {
    campo.readOnly = true;
    campo.classList.add('entrada--solo-lectura');
    document.querySelector('.acciones').hidden = true;
  }

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

  pintarSesion();
}

function pintarSesion() {
  const u = auth.usuario();
  if (!u) return;

  const filas = [
    ['Cuenta', u.email],
    ['Local', u.etiqueta],
    ['Rol', u.rol === 'ADMIN' ? 'Administrador (acceso completo)' : 'Operador (carga y cumpleaños)']
  ];

  document.getElementById('datos-sesion').innerHTML = filas.map(([clave, valor]) => `
    <div class="datos-sesion__fila">
      <dt>${escapar(clave)}</dt>
      <dd>${escapar(valor)}</dd>
    </div>`).join('');
}

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}
