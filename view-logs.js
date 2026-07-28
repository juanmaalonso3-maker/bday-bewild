/**
 * BE WILD · Vista "Registro"
 * ----------------------------------------------------------------------------
 * PENDIENTE — se completa en la Etapa 7.
 */

export default {
  titulo: 'Registro',

  /** @param {HTMLElement} contenedor */
  render(contenedor) {
    contenedor.innerHTML = `
      <div class="vacio">
        <div class="vacio__titulo">Registro</div>
        <p class="vacio__texto">Acá va el historial de errores y sincronizaciones, con exportación a CSV.</p>
      </div>`;
  }
};
