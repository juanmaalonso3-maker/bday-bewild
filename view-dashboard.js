/**
 * BE WILD · Vista "Dashboard"
 * ----------------------------------------------------------------------------
 * Indicadores del día y un panorama del mes. Todo se calcula en el navegador a
 * partir del estado ya cargado, así que no hace ni una llamada al servidor.
 *
 * La pregunta que tiene que contestar de un vistazo es doble:
 *   1. ¿A quién hay que escribirle hoy y a quién conviene ir adelantando?
 *   2. De todo lo que escribimos este mes, ¿cuántas vinieron a usar el voucher?
 * Lo segundo es lo único que dice si la campaña sirve o si estamos mandando
 * mensajes al vacío.
 */

import * as store from './store.js?v=2.2.0';
import * as router from './router.js?v=2.2.0';
import { irAlMes } from './view-cumpleanos.js?v=2.2.0';
import { hoyISO, hoyPartes, mesActual, mesProximo, mesSiguiente,
         marcadoParaCiclo, MESES } from './utils-fecha.js?v=2.2.0';

let desuscribir = null;

export default {
  titulo: 'Dashboard',

  render(contenedor) {
    contenedor.innerHTML = '<div id="tablero"></div>';
    desuscribir = store.suscribir(pintar);
  },

  destruir() {
    if (desuscribir) desuscribir();
    desuscribir = null;
  }
};

/* ── Cálculos ───────────────────────────────────────────────────────────── */

function metricas() {
  const clientes = store.listar();
  const hoy = hoyISO();
  const partes = hoyPartes();
  const proximo = mesSiguiente(partes.mes, partes.anio);

  const delMes = clientes.filter(c => c.cumple && c.cumple.esteMes);

  // Los del mes que viene se evalúan contra SU ciclo, no contra el de hoy: a
  // alguien que cumple en septiembre lo podemos haber contactado en agosto y
  // eso ya cuenta como hecho.
  const delProximo = clientes.filter(c => c.cumple && c.cumple.mesQueViene);
  const proximoSinContactar = delProximo
    .filter(c => !marcadoParaCiclo(c.ultimoContacto, proximo.mes, proximo.anio)).length;

  const contactadasMes = delMes.filter(c => c.contactado).length;
  const vouchersMes = delMes.filter(c => c.voucherUsado).length;

  return {
    total: clientes.length,
    altasHoy: clientes.filter(c => String(c.fechaAlta || '').slice(0, 10) === hoy).length,
    aContactarHoy: delMes.filter(c => c.cumple.dia === partes.dia && !c.contactado).length,
    contactadasHoy: clientes.filter(c => c.ultimoContacto === hoy).length,
    pendientesMes: delMes.filter(c => !c.contactado).length,
    totalMes: delMes.length,

    proximo,
    totalProximo: delProximo.length,
    proximoSinContactar,

    contactadasMes,
    vouchersMes,
    vouchersHoy: clientes.filter(c => c.ultimoVoucher === hoy).length,

    altasPorDia: altasUltimos30(clientes),
    porMes: cumplesPorMes(clientes)
  };
}

/** Altas de los últimos 30 días, en orden cronológico. */
function altasUltimos30(clientes) {
  const conteo = new Map();
  const hoy = new Date(hoyISO() + 'T12:00:00');

  for (let i = 29; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(d.getDate() - i);
    conteo.set(d.toISOString().slice(0, 10), 0);
  }

  clientes.forEach(c => {
    const dia = String(c.fechaAlta || '').slice(0, 10);
    if (conteo.has(dia)) conteo.set(dia, conteo.get(dia) + 1);
  });

  return [...conteo.entries()].map(([fecha, cantidad]) => ({ fecha, cantidad }));
}

/** Cuántos cumpleaños hay en cada mes del año. */
function cumplesPorMes(clientes) {
  const meses = Array(12).fill(0);
  clientes.forEach(c => {
    if (c.nacimiento && c.nacimiento.valida) meses[c.nacimiento.mes - 1]++;
  });
  return meses;
}

/* ── Pintado ────────────────────────────────────────────────────────────── */

function pintar() {
  const contenedor = document.getElementById('tablero');
  if (!contenedor) return;

  const m = metricas();

  contenedor.innerHTML = `
    <div class="indicadores">
      ${indicador('Clientes agregados hoy', m.altasHoy, '', '')}
      ${indicador('A contactar hoy', m.aContactarHoy, m.aContactarHoy ? 'destacado' : '', '', 'mes-actual')}
      ${indicador('Contactadas hoy', m.contactadasHoy, '', m.vouchersHoy ? `${m.vouchersHoy} usaron el voucher hoy` : '')}
      ${indicador('Pendientes de ' + mesActual(), m.pendientesMes, m.pendientesMes ? 'alerta' : '',
                  `${m.totalMes} ${m.totalMes === 1 ? 'cumpleaños' : 'cumpleaños'} en el mes`, 'mes-actual')}
      ${indicador('A contactar de ' + mesProximo(), m.proximoSinContactar,
                  m.proximoSinContactar ? 'proximo' : '',
                  `${m.totalProximo} ${m.totalProximo === 1 ? 'cumple' : 'cumplen'} el mes que viene`,
                  'mes-proximo')}
    </div>

    ${panelCampana(m)}

    <div class="paneles">
      <section class="tarjeta">
        <h2 class="seccion-titulo">
          Altas de los últimos 30 días
          <span class="seccion-titulo__cuenta">${m.total} en total</span>
        </h2>
        ${grafico(m.altasPorDia)}
      </section>

      <section class="tarjeta">
        <h2 class="seccion-titulo">Cumpleaños por mes</h2>
        ${graficoMeses(m.porMes)}
      </section>
    </div>`;

  contenedor.querySelectorAll('[data-ir]').forEach(el => {
    el.addEventListener('click', () => abrirMes(el.dataset.ir));
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirMes(el.dataset.ir); }
    });
  });
}

function abrirMes(cual) {
  const hoy = hoyPartes();
  if (cual === 'mes-proximo') {
    const p = mesSiguiente(hoy.mes, hoy.anio);
    return irAlMes(p.mes, p.anio);
  }
  if (cual === 'mes-actual') return irAlMes(hoy.mes, hoy.anio);
  router.ir('cumpleanos');
}

function indicador(titulo, valor, tono, nota, destino) {
  return `
    <div class="indicador ${tono ? 'indicador--' + tono : ''}"
         ${destino ? `data-ir="${destino}" role="button" tabindex="0"` : ''}>
      <span class="indicador__valor">${valor}</span>
      <span class="indicador__titulo">${titulo}</span>
      ${nota ? `<span class="indicador__nota">${nota}</span>` : ''}
    </div>`;
}

/**
 * El panel que importa: de los cumpleaños de este mes, a cuántas les
 * escribimos y cuántas terminaron usando el voucher.
 *
 * La conversión se mide sobre las contactadas, no sobre el total del mes: si
 * a alguien nunca le escribimos, que no haya venido no dice nada del voucher.
 */
function panelCampana(m) {
  const conversion = m.contactadasMes
    ? Math.round((m.vouchersMes / m.contactadasMes) * 100)
    : 0;

  const anchoContacto = m.totalMes ? (m.contactadasMes / m.totalMes) * 100 : 0;
  const anchoVoucher  = m.totalMes ? (m.vouchersMes / m.totalMes) * 100 : 0;

  return `
    <section class="tarjeta campana">
      <h2 class="seccion-titulo">
        Campaña de ${mesActual()}
        <span class="seccion-titulo__cuenta">${m.totalMes} ${m.totalMes === 1 ? 'cumpleaños' : 'cumpleaños'} en el mes</span>
      </h2>

      ${!m.totalMes ? `
        <p class="vacio__texto">No hay cumpleaños cargados para este mes.</p>
      ` : `
        <div class="campana__cifras">
          <div class="campana__cifra">
            <span class="campana__valor">${m.contactadasMes}</span>
            <span class="campana__rotulo">contactadas</span>
          </div>
          <div class="campana__cifra">
            <span class="campana__valor">${m.vouchersMes}</span>
            <span class="campana__rotulo">usaron el voucher</span>
          </div>
          <div class="campana__cifra campana__cifra--destacada">
            <span class="campana__valor">${conversion}%</span>
            <span class="campana__rotulo">de las contactadas vino</span>
          </div>
        </div>

        <div class="campana__barras">
          <div class="campana__linea">
            <span class="campana__etiqueta">Contactadas</span>
            <div class="campana__pista">
              <div class="campana__relleno campana__relleno--contacto" style="width:${anchoContacto}%"></div>
            </div>
            <span class="campana__cuenta">${m.contactadasMes} de ${m.totalMes}</span>
          </div>
          <div class="campana__linea">
            <span class="campana__etiqueta">Usaron voucher</span>
            <div class="campana__pista">
              <div class="campana__relleno campana__relleno--voucher" style="width:${anchoVoucher}%"></div>
            </div>
            <span class="campana__cuenta">${m.vouchersMes} de ${m.totalMes}</span>
          </div>
        </div>
      `}
    </section>`;
}

/** Gráfico de barras en SVG, sin librerías. */
function grafico(datos) {
  const maximo = Math.max(1, ...datos.map(d => d.cantidad));
  const ancho = 100 / datos.length;

  const barras = datos.map((d, i) => {
    const alto = (d.cantidad / maximo) * 100;
    return `<rect x="${i * ancho + ancho * 0.15}%" y="${100 - alto}%"
                  width="${ancho * 0.7}%" height="${alto}%"
                  class="barra" data-cantidad="${d.cantidad}">
              <title>${d.fecha}: ${d.cantidad}</title>
            </rect>`;
  }).join('');

  const primera = datos[0] ? etiquetaFecha(datos[0].fecha) : '';
  const ultima = datos.length ? etiquetaFecha(datos[datos.length - 1].fecha) : '';

  return `
    <div class="grafico">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="grafico__svg">${barras}</svg>
      <div class="grafico__eje">
        <span>${primera}</span>
        <span class="grafico__max">máx. ${maximo} por día</span>
        <span>${ultima}</span>
      </div>
    </div>`;
}

function graficoMeses(meses) {
  const maximo = Math.max(1, ...meses);
  const hoy = hoyPartes();
  const actual = hoy.mes - 1;
  const siguiente = mesSiguiente(hoy.mes, hoy.anio).mes - 1;

  return `
    <div class="barras-mes">
      ${meses.map((cantidad, i) => `
        <div class="barra-mes ${i === actual ? 'barra-mes--actual' : ''}${i === siguiente ? ' barra-mes--proximo' : ''}">
          <div class="barra-mes__valor">${cantidad || ''}</div>
          <div class="barra-mes__caja">
            <div class="barra-mes__relleno" style="height:${(cantidad / maximo) * 100}%"></div>
          </div>
          <div class="barra-mes__nombre">${MESES[i].slice(0, 3)}</div>
        </div>`).join('')}
    </div>`;
}

function etiquetaFecha(iso) {
  const [, mes, dia] = iso.split('-');
  return `${Number(dia)}/${Number(mes)}`;
}
