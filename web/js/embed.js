/* Barómetro a barómetro: arranque de embed.html, un solo panel para insertar en otra página con <iframe>.
   Usa el mismo motor que el explorador (comun, datos, grafico, paneles, vistas) sin editor, guía ni estado guardado. */
'use strict';

/* Lo que el panel necesita de app.js y aquí no existe: no hay paneles guardados ni editor */
function guardar() { /* nada que guardar */ }
function abrirEditor() { /* sin editor */ }

function cfgEmbed() {
  const q = new URLSearchParams(location.search);
  const i = Math.max(0, +(q.get('i') || 0));
  if (q.get('p')) {
    try { const ps = JSON.parse(b64d(q.get('p'))); return Array.isArray(ps) ? ps[i] : ps; } catch (e) { return null; }
  }
  const nombre = q.get('preset');
  if (nombre && PRESETS[nombre]) return resolver(PRESETS[nombre])[i] || null;
  return null;
}

/* Altura del documento a la página que contiene el iframe, cada vez que cambia */
function avisarAltura() {
  if (window.parent === window) return;
  try { window.parent.postMessage({ bab: 'altura', altura: document.documentElement.scrollHeight }, '*'); } catch (e) { /* */ }
}

async function iniciarEmbed() {
  const host = $('#grid');
  try { await cargarMeta(); } catch (e) { host.innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  leerPaleta();
  const base = cfgEmbed();
  if (!base || !(VISTAS[base.tipo] || preg(base.preg))) {
    host.innerHTML = '<p class="empty">Falta el panel: la dirección debe llevar ?p=… (botón «Insertar» de un panel) o ?preset=… (enlace con nombre).</p>';
    return;
  }
  const cfg = { ...base, id: nuevoId() };
  PANELES = [cfg];
  renderTodo();
  const enlace = location.origin + location.pathname.replace(/embed\.html$/, '') + '#p=' + b64e(JSON.stringify([limpio(cfg)]));
  // las notas (rupturas, avisos) van plegadas: el iframe suele tener poca altura
  $('#ver').innerHTML = `<a href="${esc(enlace)}" target="_blank" rel="noopener">Ver y editar en Barómetro a barómetro</a><button class="ib" type="button" id="notas" aria-pressed="false">Notas</button>`;
  $('#notas').addEventListener('click', ev => { const p = $('#grid .panel'); const on = p.classList.toggle('con-notas'); ev.target.setAttribute('aria-pressed', String(on)); avisarAltura(); });
  if (typeof ResizeObserver === 'function') new ResizeObserver(avisarAltura).observe(document.body);
  avisarAltura();
}

matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', rerender);
let rtoEmbed; addEventListener('resize', () => { clearTimeout(rtoEmbed); rtoEmbed = setTimeout(rerender, 200); });
iniciarEmbed();
