/**
 * BE WILD · Vista "Ajustes"
 * ----------------------------------------------------------------------------
 * PENDIENTE — se completa en la Etapa 5.
 */

export default {
  titulo: 'Ajustes',

  /** @param {HTMLElement} contenedor */
  render(contenedor) {
    contenedor.innerHTML = `
      <div class="vacio">
        <div class="vacio__titulo">Ajustes</div>
        <p class="vacio__texto">Acá se edita la plantilla del mensaje de WhatsApp.</p>
      </div>`;
  }
};
