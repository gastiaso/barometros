/* Barómetro a barómetro: paneles del explorador (creación, pintado, metadatos, exportación y rejilla). */
'use strict';

/* ================= paneles ================= */
let PANELES = [];
let SEQ = 0;
const nuevoId = () => 'p' + (++SEQ);

function tituloPanel(cfg, res) {
  return tituloBase(cfg, res) + (cfg.recuerdo ? ' (con reponderación por recuerdo)' : '');
}
function tituloBase(cfg, res) {
  const P = preg(cfg.preg);
  if (cfg.tipo === 'barras') return cfg.cruce ? `${P.t}, por ${CRUCE_DE[cfg.cruce].toLowerCase()}` : P.t;
  if (!cfg.cruce) return P.t;
  const cat1 = res && res.cat1 ? res.cat1 : cfg.cat1;
  const nom = cat1 ? nombreResp(P, cat1) : '';
  const de = P.tipo === 'medias' ? `Valoración de ${nom}` : P.tipo === 'media' ? P.t : `${P.t}: ${nom}`;
  return `${de}, por ${CRUCE_DE[cfg.cruce].toLowerCase()}`;
}
/* Aviso en los paneles cuya medida es una pregunta de voto: va en la línea de metadatos, y con ella en el PNG y el CSV */
const AVISO_VOTO = 'No es la estimación de voto del CIS';
function esSerieVoto(cfg) {
  const medidas = cfg.tipo === 'dispersion' ? [cfg.x?.preg, cfg.y?.preg] : cfg.tipo === 'mapa' ? [cfg.ind?.preg] : [cfg.preg];
  return medidas.some(id => PARTIDISTAS.includes(id));
}
const avisoVoto = cfg => (esSerieVoto(cfg) ? `. ${AVISO_VOTO}` : '');
function metaPanel(cfg, res) {
  const P = preg(cfg.preg);
  const f = res.filas;
  const ud = res.unidad === 'media' ? 'Media de 1 a 10' : P.tipo === 'multi' ? '% de entrevistados (hasta tres menciones)' : '% de entrevistados';
  const per = !f.length ? '' : cfg.tipo === 'barras' ? `${mesLargo(f[0].e.mes)} (estudio ${f[0].e.estudio})` : `${mesCorto(f[0].e.mes)} a ${mesCorto(f[f.length - 1].e.mes)}`;
  const fil = cfg.filtro ? `. Solo ${etiqueta(cfg.filtro.col, cfg.filtro.val)}` : '';
  const exn = cfg.exNR && res.unidad !== 'media' ? '. Sin NS/NC en la base' : '';
  const mov = cfg.movil && cfg.tipo !== 'barras' ? '. Media móvil centrada de 3 barómetros: cada punto resume ese barómetro, el anterior y el siguiente (el último, los dos anteriores)' : '';
  const rec = cfg.recuerdo ? '. Pesos ajustados al recuerdo de voto (estimación propia)' : '';
  return `${ud}. ${per}${fil}${exn}${mov}${rec}${textoMenciones(P, f)}${textoBloques(cfg)}${avisoVoto(cfg)}`;
}
/* Las series que suman cualquiera de las tres menciones dependen de cuántas cita cada persona, que varía entre barómetros
   (R30): se dice cuántas de media en el primer y el último barómetro del panel */
function textoMenciones(P, f) {
  if (P.tipo !== 'multi' || f.length < 2) return '';
  const k = P.cols[0].startsWith('prob_esp') ? 'menciones_esp' : 'menciones_per';
  const a = f[0].e.info?.[k], b = f[f.length - 1].e.info?.[k];
  if (a == null || b == null) return '';
  return `. Menciones por persona: ${fmt2(+a)} de media en ${mesCorto(f[0].e.mes)} y ${fmt2(+b)} en ${mesCorto(f[f.length - 1].e.mes)} (R30)`;
}

function panelEl(cfg) {
  const el = document.createElement('section');
  el.className = 'panel' + (cfg.ancho ? ' wide' : '');
  el.dataset.id = cfg.id;
  el.innerHTML = `<header class="phd"><div class="ttl"><h2></h2><p class="meta"></p></div>
    <div class="acts">
      <button class="ib" type="button" data-a="edit">Configurar</button>
      ${cfg.tipo && cfg.tipo !== 'calor' ? '' : `<button class="ib" type="button" data-a="rupt" aria-pressed="${!cfg.sinRupturas}">${cfg.sinRupturas ? 'Mostrar rupturas' : 'Ocultar rupturas'}</button>`}
      ${!cfg.tipo && META.eventos?.length ? `<button class="ib" type="button" data-a="elec" aria-pressed="${!!cfg.elecciones}" title="Marcar las convocatorias electorales en el eje">Elecciones</button>` : ''}
      <button class="ib" type="button" data-a="tabla" aria-pressed="false">Tabla</button>
      <button class="ib" type="button" data-a="csv">CSV</button>
      <button class="ib" type="button" data-a="png">PNG</button>
      ${cfg.tipo === 'puntos' ? '<button class="ib" type="button" data-a="banner" title="PNG de 1584 × 396 (a doble resolución), con título y fuente">Banner</button>' : ''}
      <button class="ib" type="button" data-a="dup">Duplicar</button>
      <button class="ib" type="button" data-a="del" aria-label="Quitar panel">Quitar</button>
    </div></header>
    <div class="chart"></div><div class="tabla" hidden></div><div class="notas"></div>
    <p class="src">Fuente: CIS, barómetros mensuales (microdatos). Elaboración: Barómetro a barómetro.</p>`;
  el.querySelector('.acts').addEventListener('click', ev => {
    const a = ev.target.closest('button')?.dataset.a; if (!a) return;
    const i = PANELES.findIndex(p => p.id === cfg.id);
    if (a === 'edit') abrirEditor(PANELES[i]);
    if (a === 'dup') { PANELES.splice(i + 1, 0, { ...structuredClone(PANELES[i]), id: nuevoId() }); guardar(); renderTodo(); }
    if (a === 'del') { const [q] = PANELES.splice(i, 1); guardar(); renderTodo(); avisoDeshacer(q, i); }
    if (a === 'tabla') { const t = el.querySelector('.tabla'); t.hidden = !t.hidden; ev.target.setAttribute('aria-pressed', String(!t.hidden)); }
    if (a === 'rupt') {
      const p = PANELES[i]; p.sinRupturas = !p.sinRupturas; guardar();
      ev.target.textContent = p.sinRupturas ? 'Mostrar rupturas' : 'Ocultar rupturas';
      ev.target.setAttribute('aria-pressed', String(!p.sinRupturas));
      renderPanel(el, p);
    }
    if (a === 'elec') {
      const p = PANELES[i]; p.elecciones = !p.elecciones; guardar();
      ev.target.setAttribute('aria-pressed', String(!!p.elecciones));
      renderPanel(el, p);
    }
    if (a === 'csv') exportarCSV(el);
    if (a === 'png') exportarPNG(el);
    if (a === 'banner') exportarBanner(el);
  });
  return el;
}

async function renderPanel(el, cfg) {
  const P = preg(cfg.preg);
  const h2 = el.querySelector('h2'), meta = el.querySelector('.meta'), host = el.querySelector('.chart'),
    notas = el.querySelector('.notas'), tabla = el.querySelector('.tabla');
  host.style.overflowX = '';
  if (VISTAS[cfg.tipo]) {
    el.classList.add('cargando');
    try {
      const out = await VISTAS[cfg.tipo](host, cfg);
      if (out.vacio) { host.innerHTML = `<p class="empty">${esc(out.vacio)}</p>`; notas.innerHTML = ''; tabla.innerHTML = ''; el._res = null; if (!h2.textContent) h2.textContent = TIPOS.find(t => t[0] === cfg.tipo)[1]; return; }
      const rec = cfg.recuerdo && cfg.tipo !== 'transferencias';
      h2.textContent = out.titulo + (rec ? ' (con reponderación por recuerdo)' : '');
      meta.textContent = out.meta + (rec ? '. Pesos ajustados al recuerdo de voto (estimación propia)' : '') + textoBloques(cfg) + avisoVoto(cfg);
      notas.innerHTML = [...(rec ? [NOTA_RECUERDO] : []), ...out.notas].map(t => `<p class="note">${esc(t)}</p>`).join('');
      tabla.innerHTML = `<table><thead><tr>${out.tabla.cab.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${out.tabla.filas.map(f => `<tr>${f.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      el._res = { generico: out, cfg };
    } catch (e) {
      h2.textContent = TIPOS.find(t => t[0] === cfg.tipo)[1]; meta.textContent = '';
      host.innerHTML = `<p class="empty">${esc(META.veda && /no disponible/.test(e.message) ? 'Serie retirada durante el periodo de prohibición de publicación de sondeos.' : e.message)}</p>`;
      notas.innerHTML = ''; tabla.innerHTML = ''; el._res = null;
    } finally { el.classList.remove('cargando'); }
    return;
  }
  if (!disponible(P) || (cfg.cruce && !META.columnas[cfg.cruce]) || (cfg.filtro && !META.columnas[cfg.filtro.col])) {
    h2.textContent = P ? P.t : 'Panel';
    meta.textContent = '';
    host.innerHTML = `<p class="empty">${META.veda ? 'Serie retirada durante el periodo de prohibición de publicación de sondeos (del 24 al 29 de noviembre).' : 'Serie no disponible.'}</p>`;
    notas.innerHTML = ''; tabla.innerHTML = '';
    el._res = null;
    return;
  }
  el.classList.add('cargando');
  try {
    const barras = cfg.tipo === 'barras';
    const mesB = barras ? (cfg.mes && ESTI[cfg.mes] != null ? cfg.mes : EST[EST.length - 1].mes) : null;
    const res = await calcular(barras ? { ...cfg, desde: mesB, hasta: mesB } : cfg);
    const apilar = barras && res.P.tipo === 'cat' && (cfg.apilar ? cfg.apilar === 'apiladas' : !!cfg.cruce && datosBarras(res, cfg).cats.length >= 5);
    const resTot = apilar && cfg.cruce ? await calcular({ ...cfg, cruce: null, desde: mesB, hasta: mesB }) : null;
    const out = !barras ? dibujar(host, res, cfg) : apilar ? dibujarApiladas(host, res, cfg, resTot) : dibujarBarras(host, res, cfg);
    res.cat1 = out.cat1;
    h2.textContent = tituloPanel(cfg, res);
    meta.textContent = metaPanel(cfg, res);
    if (out.vacio) { host.innerHTML = `<p class="empty">${esc(out.vacio)}</p>`; notas.innerHTML = ''; tabla.innerHTML = ''; el._res = null; return; }
    el._res = { res, out, cfg };
    // notas
    const vistas = new Set();
    const ns = cfg.sinRupturas && out.rup.length ? ['<p class="note">Líneas de ruptura ocultas en el gráfico. Las variaciones mensuales siguen sin calcularse a través de una ruptura C.</p>'] : [];
    ns.push(...out.rup.filter(r => !vistas.has(r.ruptura_id) && vistas.add(r.ruptura_id))
      .map(r => `<p class="note"><span class="rid">${esc(r.ruptura_id)}</span>${r.etiqueta_corta ? ' ' + esc(r.etiqueta_corta) : ''} (${esc(mesCorto(r.m))}, tipo ${esc(r.tipo)}): ${esc(breveRuptura(r.descripcion))}</p>`));
    if (cfg.recuerdo) ns.unshift(`<p class="note">${esc(NOTA_RECUERDO)}</p>`);
    if (out.barras) notasEstudio(cfg, res.filas[0].e.mes).forEach(t => ns.push(`<p class="note">${esc(t)}</p>`));
    if (out.omitidos) ns.push(`<p class="note">${out.omitidos} ${out.barras ? (out.omitidos === 1 ? 'barra omitida' : 'barras omitidas') : (out.omitidos === 1 ? 'punto omitido' : 'puntos omitidos')} por tener menos de ${MIN_N} entrevistas.</p>`);
    notas.innerHTML = ns.join('');
    tabla.innerHTML = tablaHTML(out, res);
  } catch (e) {
    host.innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  } finally { el.classList.remove('cargando'); }
}

function tablaHTML(out, res) {
  const media = res.unidad === 'media';
  const f = media ? fmt2 : fmt1;
  if (out.barras && out.barras.apiladas) {
    const B = out.barras, F = B.apiladas;
    return `<table><thead><tr><th>${esc(res.cfg.cruce ? CRUCE_DE[res.cfg.cruce] : '')}</th>${B.cats.map(c => `<th>${esc(B.nomCat(c))}</th>`).join('')}<th>Resto</th><th>Base (n)</th></tr></thead><tbody>${F.map(r => `<tr><td>${esc(r.label)}</td>${r.segs.map(d => `<td>${r.ok ? fmt1(d.v) : 'n < 50'}</td>`).join('')}<td>${fmtInt(r.n)}</td></tr>`).join('')}</tbody></table>`;
  }
  if (out.barras) {
    const B = out.barras;
    const val = (g, c) => { const x = B.celdas.find(d => d.gid === g && d.cid === c); return x.v != null ? f(x.v) : x.omit ? 'n < 50' : '—'; };
    const nG = g => { const x = B.celdas.find(d => d.gid === g); return x ? fmtInt(x.n || 0) : ''; };
    return `<table><thead><tr><th>${esc(res.cfg.cruce ? CRUCE_DE[res.cfg.cruce] : '')}</th>${B.cats.map(c => `<th>${esc(B.nomCat(c))}</th>`).join('')}${media ? '' : '<th>Base (n)</th>'}</tr></thead><tbody>${B.grupos.map(g => `<tr><td>${esc(B.nomGrupo(g))}</td>${B.cats.map(c => `<td>${val(g, c)}</td>`).join('')}${media ? '' : `<td>${nG(g)}</td>`}</tr>`).join('')}</tbody></table>`;
  }
  const head = `<tr><th>Mes</th>${out.ser.map(s => `<th>${esc(s.label)}</th>`).join('')}${!res.cfg.cruce && !media ? '<th>Base (n)</th>' : ''}</tr>`;
  const rows = res.filas.map((fl, i) => `<tr><td>${esc(mesCorto(fl.e.mes))}</td>${out.ser.map(s => `<td>${s.pts[i].v != null ? f(s.pts[i].v) : s.pts[i].omit ? 'n < 50' : '—'}</td>`).join('')}${!res.cfg.cruce && !media ? `<td>${fmtInt(out.ser[0].pts[i].n || 0)}</td>` : ''}</tr>`).reverse();
  return `<table><thead>${head}</thead><tbody>${rows.join('')}</tbody></table>`;
}

function descargar(nombre, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
/* Rupturas que explican las marcas R del panel, para el CSV y el PNG */
function rupturasPanel(el) {
  const r = el._res; if (!r) return [];
  if (r.out && r.out.rup) return [...new Map(r.out.rup.map(x => [x.ruptura_id, x])).values()]
    .map(x => `${x.ruptura_id} (${mesCorto(x.m)}, tipo ${x.tipo}): ${breveRuptura(x.descripcion)}`);
  if (r.generico && r.cfg.tipo === 'calor') return r.generico.notas;
  return [];
}
function exportarCSV(el) {
  if (!el._res) return;
  // entre comillas; si empieza por =, +, - o @, con un apóstrofo delante para que la hoja de cálculo no lo ejecute
  const q = s => { let t = String(s); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
  const notasR = rupturasPanel(el).map(q);
  const titulo = el.querySelector('h2').textContent, metaT = el.querySelector('.meta').textContent;
  if (el._res.generico) {
    const G = el._res.generico.csv;
    const cel = v => v == null || (typeof v === 'number' && !isFinite(v)) ? '' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : typeof v === 'boolean' ? (v ? 'sí' : 'no') : q(v);
    const lines = [G.cab.join(','), ...G.filas.map(f => f.map(cel).join(',')), '', q(`${titulo}. ${metaT}`), ...notasR, q('Fuente: CIS, barómetros mensuales (microdatos). Elaboración: Barómetro a barómetro.')];
    return descargar(slug(titulo) + '.csv', new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
  }
  const { out, res, cfg } = el._res;
  const num = v => v != null ? v.toFixed(3) : '';
  let lines;
  if (out.barras && out.barras.apiladas) {
    const B = out.barras, e = res.filas[0].e;
    lines = [['mes', 'estudio', 'grupo', 'respuesta', 'valor', 'margen_inferior', 'margen_superior', 'n_base'].join(',')];
    B.apiladas.forEach(r => r.segs.forEach(d => lines.push([e.mes, e.estudio, q(r.label), q(d.cid === '__resto' ? 'Resto de respuestas' : B.nomCat(d.cid)), r.ok ? num(d.v) : '', num(d.lo), num(d.hi), r.n].join(','))));
  } else if (out.barras) {
    const B = out.barras, e = res.filas[0].e;
    lines = [['mes', 'estudio', 'grupo', 'respuesta', 'valor', 'margen_inferior', 'margen_superior', 'n_base'].join(',')];
    B.celdas.forEach(c => lines.push([e.mes, e.estudio, q(B.nomGrupo(c.gid)), q(B.nomCat(c.cid)), num(c.v), num(c.lo), num(c.hi), c.n ?? ''].join(',')));
  } else {
    lines = [['mes', 'estudio', 'serie', 'valor', 'margen_inferior', 'margen_superior', 'n_base'].join(',')];
    out.ser.forEach(s => s.pts.forEach((p, i) => lines.push([res.filas[i].e.mes, res.filas[i].e.estudio, q(s.label), num(p.v), num(p.lo), num(p.hi), p.n ?? ''].join(','))));
  }
  lines.push('', q(`${tituloPanel(cfg, res)}. ${metaPanel(cfg, res)}`), ...notasR, q('Fuente: CIS, barómetros mensuales (microdatos). Elaboración: Barómetro a barómetro.'));
  descargar(slug(tituloPanel(cfg, res)) + '.csv', new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
}
/* PNG del panel a doble resolución: el gráfico (SVG, o el lienzo de una vista en canvas, redibujado a esa escala)
   con título, metadatos y fuente */
function exportarPNG(el) {
  if (!el._res) return;
  const svg = el.querySelector('.chart svg'), lienzo = el._res.generico?.lienzo, canvas = el.querySelector('.chart canvas');
  if (!svg && !(lienzo && canvas)) return;
  const titulo = el.querySelector('h2').textContent, metaT = el.querySelector('.meta').textContent;
  const W = svg ? +svg.getAttribute('width') : parseFloat(canvas.style.width), H = svg ? +svg.getAttribute('height') : parseFloat(canvas.style.height);
  const fuente = 'Fuente: CIS, barómetros mensuales (microdatos). Elaboración: Barómetro a barómetro.';
  const fT = `600 16px ${PAL.fontD}`, fM = `12px ${PAL.font}`;
  // título, metadatos y fuente parten línea si no caben en el ancho del gráfico
  const medir = document.createElement('canvas').getContext('2d');
  const partir = (txt, font) => {
    medir.font = font;
    return txt.split(' ').reduce((ls, w) => {
      const prueba = ls.length ? ls[ls.length - 1] + ' ' + w : w;
      if (ls.length && medir.measureText(prueba).width <= W - 16) ls[ls.length - 1] = prueba; else ls.push(w);
      return ls;
    }, []);
  };
  const lT = partir(titulo, fT), lM = partir(metaT, fM);
  // al pie, qué es cada marca R del gráfico (solo las que se dibujan)
  const rupt = el._res.cfg.sinRupturas ? [] : rupturasPanel(el);
  const lF = [...rupt.flatMap(t => partir(t, fM)), ...partir(fuente, fM)];
  const s = 2, top = 14 + lT.length * 20 + lM.length * 16 + 8, bot = lF.length * 16 + 18;
  const cv = document.createElement('canvas'); cv.width = W * s; cv.height = (H + top + bot) * s;
  const ctx = cv.getContext('2d'); ctx.scale(s, s);
  ctx.fillStyle = PAL.surface; ctx.fillRect(0, 0, W, H + top + bot);
  ctx.fillStyle = PAL.ink; ctx.font = fT; lT.forEach((l, i) => ctx.fillText(l, 8, 22 + i * 20));
  ctx.fillStyle = PAL.ink3; ctx.font = fM; lM.forEach((l, i) => ctx.fillText(l, 8, 22 + lT.length * 20 + i * 16));
  lF.forEach((l, i) => ctx.fillText(l, 8, H + top + 20 + i * 16));
  const pegar = img => { ctx.drawImage(img, 0, top, W, H); cv.toBlob(b => descargar(slug(titulo) + '.png', b)); };
  if (!svg) return pegar(lienzo(s));
  const img = new Image();
  img.onload = () => pegar(img);
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
}
/* Banner de una vista que lo ofrece (puntos): 1584 × 396 a doble resolución, con título y fuente dentro */
async function exportarBanner(el) {
  const g = el._res?.generico;
  if (!g || !g.banner) return;
  const titulo = el.querySelector('h2').textContent;
  try { descargar(slug(titulo) + '_banner.png', await g.banner(2)); }
  catch (e) { el.querySelector('.notas').insertAdjacentHTML('beforeend', `<p class="note">No se ha podido generar el banner: ${esc(e.message)}</p>`); }
}

const grid = $('#grid');
/* Cada panel se calcula y se dibuja cuando se acerca a la pantalla: en el móvil no se descargan las columnas de
   paneles que nadie llega a ver. Sin IntersectionObserver, se pintan todos. */
let IO_PANELES = null;
function pintarPanel(el) {
  el.classList.remove('pendiente'); el._pintado = true;
  const cfg = PANELES.find(p => p.id === el.dataset.id);
  if (cfg) renderPanel(el, cfg).then(() => {
    const t = el.querySelector('h2').textContent, q = el.querySelector('[data-a=del]');
    if (q && t) q.setAttribute('aria-label', 'Quitar el panel «' + t + '»');
  });
}
/* Quitar un panel se puede deshacer durante unos segundos */
let DESHACER = null;
function avisoDeshacer(cfg, i) {
  let bar = $('#deshacer');
  if (!bar) {
    bar = document.createElement('div'); bar.id = 'deshacer'; bar.className = 'deshacer'; bar.setAttribute('role', 'status');
    document.body.appendChild(bar);
  }
  bar.innerHTML = 'Panel quitado. <button class="btn" type="button">Deshacer</button>';
  bar.hidden = false;
  clearTimeout(DESHACER);
  bar.querySelector('button').addEventListener('click', () => {
    PANELES.splice(Math.min(i, PANELES.length), 0, cfg); guardar(); renderTodo(); bar.hidden = true; clearTimeout(DESHACER);
  });
  DESHACER = setTimeout(() => { bar.hidden = true; }, 8000);
}
function renderTodo() {
  if (IO_PANELES) IO_PANELES.disconnect();
  grid.innerHTML = '';
  if (!PANELES.length) { grid.innerHTML = '<p class="empty">No hay paneles. Usa «Nuevo panel» para añadir uno.</p>'; return; }
  IO_PANELES = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    IO_PANELES.unobserve(e.target); pintarPanel(e.target);
  }), { rootMargin: '600px 0px' }) : null;
  PANELES.forEach(cfg => {
    const el = panelEl(cfg); el.classList.add('pendiente'); grid.appendChild(el);
    if (IO_PANELES) IO_PANELES.observe(el); else pintarPanel(el);
  });
}
function rerender() {
  leerPaleta();
  grid.querySelectorAll('.panel').forEach(el => { if (el._pintado) pintarPanel(el); });
  if (typeof repintarGuia === 'function') repintarGuia();
  if (typeof estRepintar === 'function' && !$('#view-est').hidden) estRepintar();
}
