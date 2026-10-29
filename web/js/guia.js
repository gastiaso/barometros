/* Barómetro a barómetro: «¿Qué es esto?», la página de entrada.
   Explica la herramienta paso a paso con paneles reales, pintados con el mismo motor que el explorador
   (panelEl y renderPanel de app.js). Los textos están en index.html; aquí solo la configuración de cada panel. */
'use strict';

const GUIA = { cfg: new Map(), io: null };

/* Paneles de cada paso (la clave es el data-paso del contenedor en index.html). Sin cifras fijas: se recalculan con cada
   barómetro nuevo. */
function pasosGuia() {
  const viv = vivienda();
  return {
    'qe-leer': [{ preg: 'eco_esp' }],
    'qe-cambio': [{ tipo: 'comparar', preg: 'prob_esp', banda: true }],
    'qe-rupturas': [{ preg: 'ideologia' }],
    'qe-cruces': [{ preg: 'prob_esp', cruce: 'edad_g', cat1: viv }],
    'qe-dispersion': [{ tipo: 'dispersion', grupo: 'voto_simpatia', x: { preg: 'ideologia' }, y: { preg: 'prob_esp', cat: viv }, acum: 3 }],
    'qe-voto': [{ preg: 'intencion_voto_r' }, { preg: 'intencion_voto_r', recuerdo: true }],
  };
}

/* Panel de la guía: el del explorador sin los controles que editan PANELES, con «Tabla» y «Abrir en el explorador» */
function panelGuia(cfg) {
  const el = panelEl(cfg);
  el.classList.add('qe-panel');
  const viejo = el.querySelector('.acts');
  const acts = viejo.cloneNode(false);
  acts.innerHTML = '<button class="ib" type="button" data-a="tabla" aria-pressed="false">Tabla</button>' +
    '<button class="ib abrir" type="button" data-a="abrir">Abrir en el explorador</button>';
  viejo.replaceWith(acts);
  acts.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.a === 'tabla') { const t = el.querySelector('.tabla'); t.hidden = !t.hidden; b.setAttribute('aria-pressed', String(!t.hidden)); }
    if (b.dataset.a === 'abrir') abrirEnExplorador(cfg);
  });
  return el;
}

/* Copia el panel al principio del explorador, como «Nuevo panel», y cambia de pestaña */
function abrirEnExplorador(cfg) {
  const { id, ...resto } = cfg;
  PANELES.unshift({ ...structuredClone(resto), id: nuevoId() });
  guardar();
  GRID_LISTO = false;
  pestana('series');
  scrollTo(0, 0);
}

const pintarGuia = el => { el._pintado = true; renderPanel(el, GUIA.cfg.get(el)); };

function iniciarGuia() {
  const poner = (k, v) => document.querySelectorAll(`[data-qe="${k}"]`).forEach(x => { x.textContent = v; });
  poner('nbar', fmtInt(EST.length));
  poner('nent', fmtInt(META.filas));

  // cada panel se pinta cuando se acerca a la pantalla: la página no descarga columnas que nadie llega a ver
  GUIA.io = new IntersectionObserver(entradas => entradas.forEach(e => {
    if (!e.isIntersecting) return;
    GUIA.io.unobserve(e.target);
    pintarGuia(e.target);
  }), { rootMargin: '400px 0px' });
  const pasos = pasosGuia();
  let n = 0;
  document.querySelectorAll('#view-que .qe-graf[data-paso]').forEach(host => {
    (pasos[host.dataset.paso] || []).forEach(c => {
      const cfg = { ...c, id: 'g' + (++n) };
      const el = panelGuia(cfg);
      host.appendChild(el);
      GUIA.cfg.set(el, cfg);
      GUIA.io.observe(el);
    });
  });
}

/* Tras un cambio de tema o de tamaño, o al volver a la pestaña */
function repintarGuia() {
  const vista = $('#view-que');
  if (!vista || vista.hidden) return;
  GUIA.cfg.forEach((cfg, el) => { if (el._pintado) renderPanel(el, cfg); });
}
