/**
 * BE WILD · Vista "Dashboard"
 * ----------------------------------------------------------------------------
 * PENDIENTE — se completa en la Etapa 7.
 */

export default {
  titulo: 'Dashboard',

  /** @param {HTMLElement} contenedor */
  render(contenedor) {
    contenedor.innerHTML = `
      <div class="vacio">
        <div class="vacio__titulo">Dashboard</div>
        <p class="vacio__texto">Acá van los indicadores del día y las altas de los últimos 30 días.</p>
      </div>`;
  }
};
