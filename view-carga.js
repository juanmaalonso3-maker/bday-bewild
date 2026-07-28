/**
 * BE WILD · Vista "Carga de clientes"
 * ----------------------------------------------------------------------------
 * PENDIENTE — se completa en la Etapa 4.
 */

export default {
  titulo: 'Carga de clientes',

  /** @param {HTMLElement} contenedor */
  render(contenedor) {
    contenedor.innerHTML = `
      <div class="vacio">
        <div class="vacio__titulo">Carga de clientes</div>
        <p class="vacio__texto">Acá va el formulario de alta y la tabla de clientes cargados hoy.</p>
      </div>`;
  }
};
