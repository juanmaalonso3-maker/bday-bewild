/**
 * BE WILD · Vista "Base de datos"
 * ----------------------------------------------------------------------------
 * PENDIENTE — se completa en la Etapa 6.
 */

export default {
  titulo: 'Base de datos',

  /** @param {HTMLElement} contenedor */
  render(contenedor) {
    contenedor.innerHTML = `
      <div class="vacio">
        <div class="vacio__titulo">Base de datos</div>
        <p class="vacio__texto">Acá va la base completa: buscar, ordenar, editar, dar de baja y exportar a CSV.</p>
      </div>`;
  }
};
