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
    'qe-portada': [defectoPuntos()],
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
  const { id, guia, ...resto } = cfg;
  PANELES.unshift({ ...structuredClone(resto), id: nuevoId() });
  guardar();
  GRID_LISTO = false;
  pestana('series');
  scrollTo(0, 0);
}

const pintarGuia = el => { el._pintado = true; renderPanel(el, GUIA.cfg.get(el)); };

/* Qué cambia en el último barómetro, en la portada: las mismas comparaciones que el resumen del explorador
   (cambiosUltimo + Benjamini–Hochberg), limitadas a preguntas cuyas columnas la guía descarga de todos modos */
const RESUMEN_GUIA = ['intencion_voto_r', 'prob_esp', 'eco_esp', 'ideologia'];
async function pintarCambiosGuia() {
  const box = $('#qe-cambios');
  if (!box || box._pintado || EST.length < 2 || $('#view-que').hidden) return;
  box._pintado = true;
  const ult = EST[EST.length - 1], ant = EST[EST.length - 2];
  let rs;
  try { rs = (await Promise.all(RESUMEN.filter(s => RESUMEN_GUIA.includes(s.preg)).map(cambiosUltimo))).filter(Boolean); aplicarFDR(rs); }
  catch (e) { return; }
  const items = rs.filter(r => r.cambios && r.cambios.length).flatMap(r => r.cambios.slice(0, 2).map(c => ({ r, c }))).slice(0, 5);
  const fmtv = (v, media) => media ? fmt2(v) : fmt1(v) + ' %';
  const fmtd = (d, media) => `${d > 0 ? '+' : '−'}${media ? fmt2(Math.abs(d)) : fmt1(Math.abs(d))}`;
  const lista = items.length
    ? `<ul>${items.map(({ r, c }) => `<li><span class="rs-n">${esc(nombreResp(preg(r.preg), c.id))}</span><small>${esc(r.t.toLowerCase())}</small><span class="rs-v">${fmtv(c.vB, r.media)}</span><span class="rs-d ${c.d > 0 ? 'sube' : 'baja'}">${fmtd(c.d, r.media)}</span></li>`).join('')}</ul>`
    : `<p>Sin cambios significativos frente a ${esc(mesLargo(ant.mes))} en intención de voto, problemas de España, situación económica e ideología.</p>`;
  box.innerHTML = `<h3>Qué cambia en ${esc(mesLargo(ult.mes))} <small>frente a ${esc(mesLargo(ant.mes))}</small></h3>${lista}<p><a href="#series" data-goto="series" data-resumen="1">Todos los cambios →</a></p>`;
  box.querySelector('[data-goto]').addEventListener('click', ev => {
    ev.preventDefault();
    try { localStorage.setItem('bet-resumen', 'abierto'); } catch (e) { /* */ }
    pestana('series'); scrollTo(0, 0);
    const r = $('#resumen'); if (r) r.open = true;
  });
  box.hidden = false;
}

function iniciarGuia() {
  const poner = (k, v) => document.querySelectorAll(`[data-qe="${k}"]`).forEach(x => { x.textContent = v; });
  poner('nbar', fmtInt(EST.length));
  poner('nent', fmtInt(META.filas));
  // el resumen de la portada se calcula cuando el navegador queda libre, después de la nube de puntos
  const tras = window.requestIdleCallback || (f => setTimeout(f, 800));
  tras(() => { pintarCambiosGuia(); });

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
      const cfg = { ...c, id: 'g' + (++n), guia: true };   // guia: las rupturas se rotulan con su etiqueta corta
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
  pintarCambiosGuia();
  GUIA.cfg.forEach((cfg, el) => { if (el._pintado) renderPanel(el, cfg); });
}
