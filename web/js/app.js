/* Barómetro a barómetro: estado (paneles guardados, enlaces #p= y presets), nota metodológica, «Qué cambia en el
   último barómetro» y arranque. El resto del explorador está en comun.js, datos.js, grafico.js, paneles.js y editor.js. */
'use strict';

/* ================= estado ================= */
function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(PANELES.map(limpio))); } catch (e) { /* sin almacenamiento */ }
  // tras un cambio manda lo guardado: un enlace #p= en la dirección lo taparía al recargar
  if (location.hash.startsWith('#p=') || presetDeHash()) history.replaceState(null, '', location.pathname + '#series');
}
const presetDeHash = () => { const h = location.hash.slice(1); return PRESETS[h] ? h : null; };
function cargarPaneles() {
  let ps = null;
  if (location.hash.startsWith('#p=')) { try { ps = JSON.parse(b64d(location.hash.slice(3))); } catch (e) { ps = null; } }
  if (presetDeHash()) ps = resolver(PRESETS[presetDeHash()]);
  if (!ps) { try { ps = JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch (e) { ps = null; } }
  if (!Array.isArray(ps) || !ps.length) ps = defecto();
  PANELES = ps.filter(p => VISTAS[p.tipo] || preg(p.preg)).map(p => ({ ...p, id: nuevoId() }));
}
function defecto() {
  return resolver(META.veda ? DEFECTO_VEDA : esMovil() ? DEFECTO_MOVIL : DEFECTO);
}


/* ================= nota metodológica ================= */
function pintarMetodologia() {
  const ultimo = EST[EST.length - 1], primero = EST[0];
  const nTot = META.filas;
  $('#m-cobertura').textContent = `Cobertura: ${EST.length} barómetros mensuales, de ${mesLargo(primero.mes)} a ${mesLargo(ultimo.mes)}, con ${fmtInt(nTot)} entrevistas en total.`;
  document.querySelectorAll('.cita-ult').forEach(x => { x.textContent = `${mesLargo(ultimo.mes)} (estudio ${ultimo.estudio})`; });
  const tipos = { C: 'C', B: 'B', tecnica: 'Técnica', 'tecnica-critica': 'Técnica', hueco: 'Hueco', descartada: 'Descartada' };
  $('#m-rupt-tabla').innerHTML = `<table><thead><tr><th>Ruptura</th><th>Mes</th><th>Tipo</th><th>Afecta a</th><th>Qué cambia</th><th>Estado</th></tr></thead><tbody>${META.rupturas.map(r => `<tr id="r-${esc(r.ruptura_id)}"><td>${esc(r.ruptura_id)}${r.etiqueta_corta ? `<br><small>${esc(r.etiqueta_corta)}</small>` : ''}</td><td>${esc(r.mes)}</td><td><span class="tipo ${esc(r.tipo)}">${esc(tipos[r.tipo] || r.tipo)}</span></td><td>${esc(r.conceptos_afectados.replace(/,\s*/g, ', '))}</td><td>${esc(r.descripcion)}</td><td>${esc(r.estado)}</td></tr>`).join('')}</tbody></table>`;
  const titulo = id => PREG.find(p => p.id === id)?.t || (META.conceptos[id]?.etiqueta) || id;
  $('#m-preg-fichas').innerHTML = Object.entries(META.enunciados || {}).sort((a, z) => titulo(a[0]).localeCompare(titulo(z[0]), 'es')).map(([id, vs]) => `<div class="ficha"><h4>${esc(titulo(id))}</h4>${vs.map(v => `<p class="per">Versión ${esc(v.version)}: ${esc(mesCorto(v.desde))} a ${esc(mesCorto(v.hasta))}</p><p>${esc(v.enunciado.replace(/\s+\.$/, ''))}</p>`).join('')}</div>`).join('');
  // catálogo de categorías de problemas por barómetro, si los metadatos lo traen
  const cat = META.catalogo_problemas || [];
  if (cat.length) {
    const nTot = EST.length;
    const parciales = cat.filter(c => +c.n_esp < nTot || +c.n_per < nTot);
    const fila = c => `<tr><td>${esc(c.id)}</td><td>${esc(c.etiqueta)}</td><td>${esc(mesCorto(c.desde))} a ${esc(mesCorto(c.hasta))}</td><td class="n">${esc(c.n_esp)} / ${esc(c.n_per)}</td><td>${c.huecos ? esc(c.huecos.split(' ').map(mesCorto).join(', ')) : '—'}</td></tr>`;
    $('#m-prob-catalogo').innerHTML = `<details class="resumen" open><summary>Categorías que no están en todos los barómetros (${parciales.length} de ${cat.length})</summary><div class="tablaw"><table><thead><tr><th>Id</th><th>Categoría</th><th>Barómetros</th><th>En cuántos (España / personales)</th><th>Falta en</th></tr></thead><tbody>${parciales.map(fila).join('')}</tbody></table></div></details>
      <details class="resumen"><summary>Todas las categorías (${cat.length})</summary><div class="tablaw"><table><thead><tr><th>Id</th><th>Categoría</th><th>Barómetros</th><th>En cuántos (España / personales)</th><th>Falta en</th></tr></thead><tbody>${cat.map(fila).join('')}</tbody></table></div></details>`;
  }
  // menciones medias por persona en las preguntas de problemas (R30), si los metadatos las traen
  const conMenc = META.estudios.some(e => e.menciones_esp != null);
  $('#m-est-tabla').innerHTML = `<table><thead><tr><th>Mes</th><th>Estudio</th><th>Trabajo de campo</th><th>Entrevistas</th><th>Efecto de diseño</th>${conMenc ? '<th>Menciones: España</th><th>Menciones: personales</th>' : ''}</tr></thead><tbody>${META.estudios.map(e => `<tr><td>${esc(mesCorto(e.mes))}</td><td>${esc(e.estudio)}</td><td>${esc(e.fecha_campo_inicio)} a ${esc(e.fecha_campo_fin)}</td><td class="n">${fmtInt(+e.n)}</td><td class="n">${fmt2(+e.deff)}</td>${conMenc ? `<td class="n">${fmt2(e.menciones_esp == null ? null : +e.menciones_esp)}</td><td class="n">${fmt2(e.menciones_per == null ? null : +e.menciones_per)}</td>` : ''}</tr>`).join('')}</tbody></table>`;
}

/* ================= qué cambia en el último barómetro ================= */
/* Compara el último barómetro con el anterior que hizo la misma pregunta. Con tantas comparaciones a la vez, el umbral
   es más exigente que el del panel «Comparar»: significativa al 99 % y de al menos un punto (una décima en las medias).
   No compara a través de una ruptura C. */
const RESUMEN = [
  { preg: 'intencion_voto_r', t: 'Intención directa de voto' },
  { preg: 'voto_simpatia', t: 'Voto + simpatía' },
  { preg: 'pref_presidente', t: 'Preferencia como presidente' },
  { preg: 'lideres', t: 'Valoración de líderes' },
  { preg: 'prob_esp', t: 'Principales problemas de España' },
  { preg: 'prob_per', t: 'Problemas que más le afectan' },
  { preg: 'eco_esp', t: 'Situación económica general' },
  { preg: 'eco_per', t: 'Situación económica personal' },
  { preg: 'ideologia', t: 'Autoubicación ideológica' },
];
const Q_FDR = 0.05, MIN_DIF = 1, MIN_DIF_MEDIA = 0.1, MIN_PCT_RESUMEN = 2, MAX_CAMBIOS = 4;
/* Función de distribución normal estándar (Abramowitz y Stegun 7.1.26; error < 1,5e-7) */
function phi(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
  return z >= 0 ? 0.5 + 0.5 * y : 0.5 - 0.5 * y;
}
const pBilateral = z => 2 * (1 - phi(Math.abs(z)));
/* Benjamini–Hochberg: el mayor p que cumple p(k) ≤ k·q/m; todo p menor o igual se declara significativo */
function umbralBH(ps, q = Q_FDR) {
  const o = ps.slice().sort((a, b) => a - b), m = o.length;
  let u = -1;
  for (let k = m; k >= 1; k--) if (o[k - 1] <= k * q / m) { u = o[k - 1]; break; }
  return u;
}
async function cambiosUltimo(spec) {
  const P = preg(spec.preg);
  if (!disponible(P)) return null;
  const res = await calcular({ preg: spec.preg, desde: EST[Math.max(0, EST.length - 6)].mes });
  const media = res.unidad === 'media';
  const con = res.filas.filter(f => media ? Object.keys(f.grupos[0].vals).length : f.grupos[0].n > 0);
  const ultimo = EST[EST.length - 1].mes;
  if (!con.length || con[con.length - 1].e.mes !== ultimo) return { ...spec, ausente: true };
  if (con.length < 2) return null;
  const fA = con[con.length - 2], fB = con[con.length - 1];
  const corte = rupturas({ preg: spec.preg }).find(r => r.tipo === 'C' && r.m > fA.e.mes && r.m <= fB.e.mes);
  const base = { ...spec, fA, fB, media, conc: P.cols[0] };
  if (corte) return { ...base, corte };
  const gA = fA.grupos[0], gB = fB.grupos[0], candidatos = [];
  for (const id of res.ids) {
    if (NR.has(id) && id !== 'NS') continue;
    const vA = gA.vals[id], vB = gB.vals[id];
    if (vA == null || vB == null) continue;            // respuesta que no se ofrecía en uno de los dos meses
    let se, d = vB - vA;
    if (media) {
      const nA = gA.ns[id], nB = gB.ns[id];
      if (nA < MIN_N || nB < MIN_N || Math.abs(d) < MIN_DIF_MEDIA) continue;
      se = Math.sqrt(kish(nA, gA.sw[id], gA.sw2?.[id]) * gA.sd[id] ** 2 / nA + kish(nB, gB.sw[id], gB.sw2?.[id]) * gB.sd[id] ** 2 / nB);
    } else {
      if (Math.max(vA, vB) < MIN_PCT_RESUMEN || Math.abs(d) < MIN_DIF) continue;
      const pA = vA / 100, pB = vB / 100;
      se = 100 * Math.sqrt(kish(gA.n, gA.base, gA.base2) * pA * (1 - pA) / gA.n + kish(gB.n, gB.base, gB.base2) * pB * (1 - pB) / gB.n);
    }
    if (se > 0) candidatos.push({ id, vA, vB, d, p: pBilateral(d / se) });
  }
  return { ...base, candidatos };
}
/* Con todos los candidatos del resumen a la vista, fija el umbral BH y reparte los cambios por pregunta */
function aplicarFDR(rs) {
  const todos = rs.flatMap(r => r.candidatos || []);
  const u = umbralBH(todos.map(c => c.p));
  for (const r of rs) {
    if (!r.candidatos) continue;
    const cambios = r.candidatos.filter(c => c.p <= u).sort((a, z) => Math.abs(z.d) - Math.abs(a.d));
    r.cambios = cambios.slice(0, MAX_CAMBIOS); r.mas = Math.max(0, cambios.length - MAX_CAMBIOS);
  }
  return { rs, m: todos.length };
}
let RESUMEN_LISTO = false;
async function pintarResumen() {
  const box = $('#resumen');
  if (!box || RESUMEN_LISTO) return;
  RESUMEN_LISTO = true;
  const n = EST.length;
  if (n < 2) return;
  // abierto en pantallas anchas y altas; en el móvil y en pantallas bajas (portátil pequeño, zoom alto), cerrado para que
  // los paneles no queden varias pantallas más abajo
  let abierto = !esMovil() && innerHeight >= 800;
  try { const v = localStorage.getItem('bet-resumen'); if (v) abierto = v === 'abierto'; } catch (e) { /* */ }
  const ult = EST[n - 1], ant = EST[n - 2];
  box.hidden = false;
  box.open = abierto;
  box.innerHTML = `<summary><span class="rs-t">Qué cambia en el último barómetro</span><span class="rs-m">${esc(mesLargo(ult.mes))} frente a ${esc(mesLargo(ant.mes))}</span></summary><p class="note">Calculando…</p>`;
  // cerrado, no se calcula (ni descarga sus columnas) hasta que se abre
  await new Promise(ok => {
    if (box.open) return ok();
    box.addEventListener('toggle', function abrir() { if (box.open) { box.removeEventListener('toggle', abrir); ok(); } });
  });
  box.addEventListener('toggle', () => { try { localStorage.setItem('bet-resumen', box.open ? 'abierto' : 'cerrado'); } catch (e) { /* */ } });
  let rs, m = 0;
  try { rs = (await Promise.all(RESUMEN.map(cambiosUltimo))).filter(Boolean); ({ m } = aplicarFDR(rs)); }
  catch (e) { box.querySelector('.note').textContent = e.message; return; }
  const fmtv = (v, media) => media ? fmt2(v) : fmt1(v) + ' %';
  const fmtd = (d, media) => `${d > 0 ? '+' : '−'}${media ? fmt2(Math.abs(d)) : fmt1(Math.abs(d))}`;
  const nombre = (r, id) => nombreResp(preg(r.preg), id);
  const conCambios = rs.filter(r => r.cambios && r.cambios.length);
  const sin = rs.filter(r => r.cambios && !r.cambios.length).map(r => r.t);
  const cortes = rs.filter(r => r.corte);
  const ausentes = rs.filter(r => r.ausente).map(r => r.t);
  const bloque = r => {
    const otroMes = r.fA.e.mes !== ant.mes ? `<p class="rs-sub">Frente a ${esc(mesLargo(r.fA.e.mes))}, el último barómetro anterior con la pregunta</p>` : '';
    const items = r.cambios.map(c => `<li><span class="rs-n">${esc(nombre(r, c.id))}</span><span class="rs-v">${fmtv(c.vB, r.media)}</span><span class="rs-d ${c.d > 0 ? 'sube' : 'baja'}">${fmtd(c.d, r.media)}</span></li>`).join('');
    return `<div class="rs-it"><h3>${esc(r.t)}</h3>${otroMes}<ul>${items}</ul>${r.mas ? `<p class="rs-sub">y ${r.mas} ${r.mas === 1 ? 'cambio más' : 'cambios más'}</p>` : ''}<button class="ib abrir" type="button" data-comparar="${esc(r.preg)}" data-mesa="${esc(r.fA.e.mes)}">Ver la comparación completa</button></div>`;
  };
  box.innerHTML = `<summary><span class="rs-t">Qué cambia en el último barómetro</span><span class="rs-m">${esc(mesLargo(ult.mes))} (estudio ${esc(ult.estudio)}) frente a ${esc(mesLargo(ant.mes))}</span></summary>
    ${conCambios.length ? `<div class="rs-grid">${conCambios.map(bloque).join('')}</div>` : '<p class="note">Ningún cambio significativo entre los dos barómetros con estos criterios.</p>'}
    ${sin.length ? `<p class="note"><b>Sin cambios significativos:</b> ${esc(sin.join(', ').toLowerCase())}.</p>` : ''}
    ${cortes.map(r => `<p class="note"><b>${esc(r.t)}:</b> sin comparación por la ruptura ${esc(r.corte.ruptura_id)} (${esc(breveRuptura(r.corte.descripcion))}).</p>`).join('')}
    ${ausentes.length ? `<p class="note"><b>No se preguntan en el último barómetro:</b> ${esc(ausentes.join(', ').toLowerCase())}.</p>` : ''}
    <p class="note rs-crit">Solo cambios de al menos un punto (una décima en las valoraciones) que siguen siendo significativos tras corregir por comparaciones múltiples: ${m} comparaciones a la vez, con la tasa de falsos descubrimientos controlada al 5 % (Benjamini–Hochberg) y el efecto de diseño de cada estudio. Variación en puntos; respuestas de menos del ${MIN_PCT_RESUMEN} % fuera. Un cambio significativo no siempre es un cambio de opinión: también puede deberse al cuestionario, por ejemplo a preguntas previas sobre el mismo tema.</p>`;
  box.querySelectorAll('[data-comparar]').forEach(bt => bt.addEventListener('click', () => {
    PANELES.unshift({ tipo: 'comparar', preg: bt.dataset.comparar, mesA: bt.dataset.mesa, id: nuevoId() });
    guardar(); renderTodo();
    grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

/* ================= arranque ================= */
/* Modo daltónico (TRAZOS_CVD y modoCVD, en comun.js): aquí, el conmutador */
function cvd(on) {
  try { if (on) localStorage.setItem('bet-cvd', '1'); else localStorage.removeItem('bet-cvd'); } catch (e) { /* */ }
  if (on) document.documentElement.dataset.cvd = '1'; else delete document.documentElement.dataset.cvd;
  const b = $('#cvd'); if (b) b.setAttribute('aria-pressed', String(!!on));
  rerender();
}
function tema(v) {
  try { if (v === 'system') localStorage.removeItem('bet-tema'); else localStorage.setItem('bet-tema', v); } catch (e) { /* */ }
  if (v === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
  document.querySelectorAll('#tema button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  rerender();
}
/* La web entra por «¿Qué es esto?» la primera vez; cuando ya se ha visto la pestaña de series en este navegador, entra
   directamente en ella (la guía sigue a un clic). Los paneles del explorador no se pintan (ni descargan sus columnas)
   hasta que se abre la pestaña de series. */
const VISTAS_WEB = ['que', 'series', 'est', 'meth', 'datos'];
const CLAVE_GUIA = 'bet-guia';
const guiaVista = () => { try { return localStorage.getItem(CLAVE_GUIA) === 'vista'; } catch (e) { return false; } };
let GRID_LISTO = false;
function mostrarVista(t) {
  document.querySelectorAll('.tabs button').forEach(b => { const on = b.dataset.tab === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
  VISTAS_WEB.forEach(v => { const el = $('#view-' + v); if (el) el.hidden = v !== t; });
}
/* La pestaña va en la dirección (#que, #series, #est, #meth, #datos): el botón atrás vuelve a la anterior */
/* Un ancla interna (#m-rupt del índice de la nota, #r-R10 de la tabla de rupturas) pertenece a la pestaña que la contiene */
const vistaDeAncla = h => { const el = h && !VISTAS_WEB.includes(h) ? document.getElementById(h) : null; const v = el && el.closest('[id^="view-"]'); return v ? v.id.slice(5) : null; };
const vistaDeHash = () => { const h = location.hash.slice(1); return h.startsWith('p=') || PRESETS[h] ? 'series' : h.startsWith('est=') ? 'est' : VISTAS_WEB.includes(h) ? h : vistaDeAncla(h); };
/* Tras mostrar la pestaña, lleva la vista al ancla de la dirección (el navegador no puede hacerlo mientras está oculta) */
const irAlAncla = () => { const el = document.getElementById(location.hash.slice(1)); if (el && !VISTAS_WEB.includes(el.id)) el.scrollIntoView(); };
function pestana(t, historial = true) {
  if (historial && vistaDeHash() !== t) history.pushState(null, '', '#' + t);
  mostrarVista(t);
  if (!META) return;
  if (t === 'series') { try { localStorage.setItem(CLAVE_GUIA, 'vista'); } catch (e) { /* */ } if (GRID_LISTO) rerender(); else { GRID_LISTO = true; leerPaleta(); renderTodo(); } pintarResumen(); }
  if (t === 'que') repintarGuia();
  if (t === 'est' && typeof pintarEstimacion === 'function') pintarEstimacion();
}

async function iniciar() {
  try { await cargarMeta(); } catch (e) { $('#upd').textContent = e.message; return; }
  const ult = EST[EST.length - 1];
  $('#upd').innerHTML = `Último barómetro: <b>${esc(mesLargo(ult.mes))}</b> (estudio ${esc(ult.estudio)})`;
  if (META.veda) { $('#aviso-veda').hidden = false; $('#descargas').innerHTML = '<li>Las descargas del fichero armonizado se suspenden durante el periodo de prohibición de publicación de sondeos.</li>'; }
  const t = document.documentElement.dataset.theme || 'system';
  document.querySelectorAll('#tema button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === t)));
  leerPaleta();
  cargarPaneles();
  if (typeof iniciarGuia === 'function') iniciarGuia();
  pintarMetodologia();
  pestana(VISTAS_WEB.find(v => $('#view-' + v) && !$('#view-' + v).hidden) || ($('#view-que') ? 'que' : 'series'), false);
  irAlAncla();
}

document.querySelectorAll('#tema button').forEach(b => b.addEventListener('click', () => tema(b.dataset.v)));
$('#cvd')?.addEventListener('click', () => cvd(!modoCVD()));
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => pestana(b.dataset.tab)));
// flechas, Inicio y Fin entre pestañas
$('.tabs').addEventListener('keydown', ev => {
  const bs = [...document.querySelectorAll('.tabs button')], i = bs.indexOf(document.activeElement);
  if (i < 0) return;
  const j = { ArrowRight: (i + 1) % bs.length, ArrowLeft: (i - 1 + bs.length) % bs.length, Home: 0, End: bs.length - 1 }[ev.key];
  if (j == null) return;
  ev.preventDefault(); bs[j].focus(); pestana(bs[j].dataset.tab);
});
/* Carga una selección con nombre (#vivienda…) y abre las series; con historial, deja el nombre en la dirección */
function aplicarPreset(nombre, historial = true) {
  if (!PRESETS[nombre] || !META) return false;
  PANELES = resolver(PRESETS[nombre]).map(p => ({ ...p, id: nuevoId() }));
  if (historial) history.pushState(null, '', '#' + nombre);
  GRID_LISTO = false;
  pestana('series', false);
  scrollTo(0, 0);
  return true;
}
addEventListener('popstate', () => { if (presetDeHash() && aplicarPreset(presetDeHash(), false)) return; const t = vistaDeHash() || 'que'; if (META) pestana(t, false); else mostrarVista(t); irAlAncla(); });
document.querySelectorAll('[data-preset]').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); aplicarPreset(a.dataset.preset); }));
document.querySelectorAll('[data-goto]').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); pestana(a.dataset.goto); scrollTo(0, 0); }));
$('#b-add').addEventListener('click', () => abrirEditor(null));
$('#b-reset').addEventListener('click', () => {
  if (!confirm('¿Volver a los paneles iniciales? Se pierden los paneles actuales.')) return;
  PANELES = defecto().map(p => ({ ...p, id: nuevoId() })); try { localStorage.removeItem(CLAVE); } catch (e) { /* */ }
  history.replaceState(null, '', location.pathname + '#series'); renderTodo();
});
$('#b-link').addEventListener('click', async ev => {
  const url = location.origin + location.pathname + '#p=' + b64e(JSON.stringify(PANELES.map(limpio)));
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); ev.target.textContent = 'Enlace copiado'; } catch (e) { ev.target.textContent = 'Enlace en la barra de direcciones'; }
  setTimeout(() => { ev.target.textContent = 'Copiar enlace a estos paneles'; }, 2500);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', rerender);
let rto; addEventListener('resize', () => { clearTimeout(rto); rto = setTimeout(rerender, 200); });
// los enlaces a paneles (#p=…, #vivienda…) y a una pestaña (#series, #meth…) entran directamente en ella; sin enlace,
// quien ya ha visto las series entra en ellas
if (vistaDeHash()) mostrarVista(vistaDeHash()); else if (guiaVista() && $('#view-series')) mostrarVista('series');
iniciar();
