/**
 * BE WILD · Vista "Cumpleaños del mes"
 * ----------------------------------------------------------------------------
 * PENDIENTE — se completa en la Etapa 5.
 */

export default {
  titulo: 'Cumpleaños del mes',

  /** @param {HTMLElement} contenedor */
  render(contenedor) {
    contenedor.innerHTML = `
      <div class="vacio">
        <div class="vacio__titulo">Cumpleaños del mes</div>
        <p class="vacio__texto">Acá va el listado del mes con el botón de WhatsApp y el check de contactado.</p>
      </div>`;
  }
};
