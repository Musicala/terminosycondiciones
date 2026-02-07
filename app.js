'use strict';

/**
 * app.js — Acuerdo de Experiencia · Musicala (GATED PRO)
 * ✅ Aceptación + Exportar: OCULTOS hasta completar 100% (todas las secciones leídas)
 * ✅ Gate visual (barra + texto): muestra progreso y se desbloquea al 100%
 * ✅ Auto-avanza al marcar "Leído" (solo si NO hay búsqueda activa)
 * ✅ WhatsApp listo para enviar al aceptar (wa.me) con código clave verificable
 * ✅ Exportar solo aparece cuando ya hay aceptación guardada
 * ✅ Sin imprimir (no se usa btnPrint)
 *
 * Mejoras sin romper nada:
 * - Keys storage por versión (meta.version)
 * - Nav se construye 1 vez + updates eficientes
 * - Debounce en búsqueda
 * - Highlight seguro (no rompe HTML)
 * - Validación doc numérica + normalización
 * - No resetea sección al limpiar búsqueda (vuelve a la última)
 */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* =========================
   DOM
========================= */
const navEl       = $('#nav');
const articleEl   = $('#article');
const searchInput = $('#searchInput');
const resultsInfo = $('#resultsInfo');

const progressPill = $('#progressPill');
const statSections = $('#statSections');
const statWords    = $('#statWords');
const statRead     = $('#statRead');
const versionBadge = $('#versionBadge');

const btnAccept = $('#btnAccept');
const btnExport = $('#btnExport'); // opcional (puede no existir)

const fullName    = $('#fullName');
const docId       = $('#docId');
const acceptCheck = $('#acceptCheck');
const acceptMeta  = $('#acceptMeta');

// Gate UI
const gateCard   = $('#gateCard');
const gateMsg    = $('#gateMsg');
const gateFill   = $('#gateFill');
const gatePill   = $('#gatePill');
const gateHint   = $('#gateHint');
const acceptCard = $('#acceptCard');

/* =========================
   CONFIG / DOC
========================= */
const DOC = window.TERMS_DOC;

if (!DOC?.sections?.length) {
  if (articleEl) {
    articleEl.innerHTML =
      `<div class="sectionCard"><p class="muted">No hay contenido cargado. Revisa <code>terms-data.js</code>.</p></div>`;
  }
  throw new Error('TERMS_DOC missing');
}

const DOC_VER  = (DOC.meta?.version || 'v0').toString().trim();
const DOC_YEAR = (DOC.meta?.year || '2026').toString().trim();

// Storage keys por versión (ya no hardcodeado)
const STORAGE_KEY = `musicala_terms_acceptance_${DOC_VER}`;
const READ_KEY    = `musicala_terms_read_${DOC_VER}`;

// WhatsApp
const WHATSAPP_PHONE = '573193529475'; // 57 + 3193529475
const WHATSAPP_KEY   = 'MUSICALA-OK-2026'; // cámbialo si quieres más secreto

if (versionBadge) {
  versionBadge.textContent = DOC_VER ? `Versión ${DOC_VER}` : 'Versión';
}

/* =========================
   STATE
========================= */
const state = {
  activeId: DOC.sections[0].id,
  lastActiveId: DOC.sections[0].id, // para volver al salir de búsqueda
  query: '',
  readSet: new Set(loadJSON(READ_KEY, [])),
};

// Cache: palabras total
const WORDS_TOTAL = countWords();

/* =========================
   STORAGE HELPERS
========================= */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function saveJSON(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch {
    return false;
  }
}

/* =========================
   TEXT HELPERS
========================= */
function stripHtml(s) {
  return String(s ?? '').replace(/<[^>]+>/g, '');
}
function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function hasHtmlTag(s) {
  return /<[^>]+>/.test(String(s ?? ''));
}
function highlightPlain(text, q) {
  if (!q) return escapeHtml(text);
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Importante: el texto entra escapado antes, así no rompemos HTML.
  const escaped = escapeHtml(text);
  return escaped.replace(new RegExp(safe, 'gi'), (m) => `<mark>${m}</mark>`);
}
function highlightSafeMaybeHtml(text, q) {
  // Si hay HTML (ej. <strong>), NO metemos mark para no partir etiquetas.
  // Conserva el HTML original intacto.
  if (!q) return String(text ?? '');
  if (hasHtmlTag(text)) return String(text ?? '');
  return highlightPlain(text, q);
}
function countWords() {
  const all = DOC.sections
    .map(sec => (sec.content || []).map(p => stripHtml(p)).join(' '))
    .join(' ')
    .trim();
  return all ? all.split(/\s+/).filter(Boolean).length : 0;
}

/* =========================
   FILTER
========================= */
function sectionMatches(sec, q) {
  if (!q) return true;
  const hay = (
    (sec.title || '') + ' ' +
    (sec.summary || '') + ' ' +
    (sec.content || []).map(stripHtml).join(' ')
  ).toLowerCase();
  return hay.includes(q.toLowerCase());
}

/* =========================
   PROGRESS / GATE
========================= */
function getReadPct() {
  const total = DOC.sections.length || 1;
  return Math.round((state.readSet.size / total) * 100);
}
function isFullyRead() {
  return state.readSet.size >= DOC.sections.length;
}

function updateGate() {
  const pct = getReadPct();
  const unlocked = isFullyRead();

  if (gateFill) gateFill.style.width = `${pct}%`;
  if (gatePill) gatePill.textContent = `${pct}% completado`;

  if (gateCard) gateCard.dataset.state = unlocked ? 'unlocked' : 'locked';
  if (gateHint) gateHint.textContent = unlocked ? 'Listo ✅' : 'Bloqueado';

  if (gateMsg) {
    gateMsg.textContent = unlocked
      ? 'Perfecto. Ya completaste la lectura. Ahora puedes aceptar el Acuerdo de Experiencia.'
      : 'Para habilitar la aceptación, marca como leídas todas las secciones. Cuando llegues al 100%, esto se activará.';
  }

  if (acceptCard) acceptCard.hidden = !unlocked;

  const saved = loadJSON(STORAGE_KEY, null);
  const canExport = unlocked && !!saved?.acceptedAt;
  if (btnExport) btnExport.hidden = !canExport;

  if (btnAccept) btnAccept.disabled = !unlocked;
}

/* =========================
   NAV (build once + update)
========================= */
let navBuilt = false;

function buildNavOnce() {
  if (!navEl || navBuilt) return;

  navEl.innerHTML = '';
  const frag = document.createDocumentFragment();

  DOC.sections.forEach(sec => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'navItem';
    btn.dataset.id = sec.id;

    const left = document.createElement('div');
    left.className = 'navLeft';

    const title = document.createElement('div');
    title.className = 'navTitle';
    title.textContent = sec.title || sec.id;

    const sub = document.createElement('div');
    sub.className = 'navSub';
    sub.textContent = sec.summary || '';

    left.appendChild(title);
    left.appendChild(sub);

    const dot = document.createElement('div');
    dot.className = 'navDot';
    dot.title = 'Pendiente';

    btn.appendChild(left);
    btn.appendChild(dot);
    frag.appendChild(btn);
  });

  navEl.appendChild(frag);

  // Event delegation: 1 listener para todo
  navEl.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('.navItem');
    if (!btn || !navEl.contains(btn)) return;
    const id = btn.dataset.id;
    if (!id) return;

    state.activeId = id;
    if (!state.query.trim()) state.lastActiveId = id;

    updateNavUI();
    renderArticle();
    updateStats();
    scrollContentTop();
  });

  navBuilt = true;
  updateNavUI();
}

function updateNavUI() {
  if (!navEl) return;

  const items = $$('.navItem', navEl);
  items.forEach(btn => {
    const id = btn.dataset.id;
    const isActive = id === state.activeId;

    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');

    const dot = btn.querySelector('.navDot');
    const done = state.readSet.has(id);
    if (dot) {
      dot.classList.toggle('done', done);
      dot.title = done ? 'Leído' : 'Pendiente';
    }
  });
}

/* =========================
   ARTICLE
========================= */
function renderArticle() {
  if (!articleEl) return;

  const q = state.query.trim();
  const secs = DOC.sections.filter(sec => sectionMatches(sec, q));

  if (resultsInfo) {
    if (q) {
      resultsInfo.hidden = false;
      resultsInfo.textContent = `Resultados para “${q}”: ${secs.length} sección(es).`;
    } else {
      resultsInfo.hidden = true;
      resultsInfo.textContent = '';
    }
  }

  const renderList = q
    ? secs
    : DOC.sections.filter(s => s.id === state.activeId);

  articleEl.innerHTML = '';
  const frag = document.createDocumentFragment();

  renderList.forEach(sec => {
    const card = document.createElement('section');
    card.className = 'sectionCard';
    card.id = `sec-${sec.id}`;

    const head = document.createElement('div');
    head.className = 'secHead';

    const h = document.createElement('h2');
    h.className = 'secTitle';
    // título no debería tener HTML, pero igual lo hacemos seguro
    h.innerHTML = q ? highlightPlain(sec.title || sec.id, q) : escapeHtml(sec.title || sec.id);

    const meta = document.createElement('div');
    meta.className = 'secMeta';

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = state.readSet.has(sec.id) ? 'Leído ✅' : 'Pendiente';

    const hint = document.createElement('span');
    hint.textContent = sec.id;

    meta.appendChild(badge);
    meta.appendChild(hint);

    head.appendChild(h);
    head.appendChild(meta);

    const body = document.createElement('div');
    body.className = 'secBody';

    const contentArr = Array.isArray(sec.content) ? sec.content : [];
    const html = contentArr
      .map(p => `<p>${q ? highlightSafeMaybeHtml(p, q) : String(p ?? '')}</p>`)
      .join('');

    body.innerHTML = html || `<p class="muted">Sin contenido aún.</p>`;

    // Botón marcar leído / avanzar
    const markBtn = document.createElement('button');
    markBtn.type = 'button';
    markBtn.className = 'btn ghost';
    markBtn.style.marginTop = '10px';

    const isRead = state.readSet.has(sec.id);
    const isLast = DOC.sections[DOC.sections.length - 1]?.id === sec.id;

    if (isRead) {
      markBtn.textContent = 'Marcar como no leído';
      markBtn.title = 'Marcar esta sección como no leída';
    } else {
      markBtn.textContent = isLast ? 'Leído (finalizar)' : 'Leído y seguir';
      markBtn.title = isLast ? 'Marcar como leído y finalizar la lectura' : 'Marcar como leído y pasar a la siguiente';
    }

    markBtn.addEventListener('click', () => toggleRead(sec.id));

    card.appendChild(head);
    card.appendChild(body);
    card.appendChild(markBtn);

    frag.appendChild(card);
  });

  articleEl.appendChild(frag);
}

/* =========================
   READ FLOW
========================= */
function toggleRead(id) {
  const wasRead = state.readSet.has(id);

  if (wasRead) state.readSet.delete(id);
  else state.readSet.add(id);

  saveJSON(READ_KEY, Array.from(state.readSet));

  // Auto-avanza SOLO si marcamos como leído y NO hay búsqueda activa
  if (!wasRead && !state.query.trim()) {
    const idx = DOC.sections.findIndex(s => s.id === id);
    const next = DOC.sections[idx + 1];
    if (next) {
      state.activeId = next.id;
      state.lastActiveId = state.activeId;
    }
  }

  updateNavUI();
  renderArticle();
  updateStats();

  if (!wasRead && !state.query.trim()) {
    scrollContentTop();
  }
}

/* =========================
   STATS
========================= */
function updateStats() {
  if (statSections) statSections.textContent = String(DOC.sections.length);
  if (statWords) statWords.textContent = String(WORDS_TOTAL);

  const pct = getReadPct();
  if (statRead) statRead.textContent = `${pct}%`;
  if (progressPill) progressPill.textContent = `${pct}% leído`;

  updateGate();
}

/* =========================
   ACCEPTANCE
========================= */
function hydrateAcceptanceUI() {
  const saved = loadJSON(STORAGE_KEY, null);

  if (acceptMeta) {
    if (saved?.acceptedAt) {
      acceptMeta.hidden = false;
      acceptMeta.innerHTML = `
        <strong>Aceptado</strong><br>
        ${escapeHtml(saved.fullName)} · ${escapeHtml(saved.docId)}<br>
        ${new Date(saved.acceptedAt).toLocaleString('es-CO')}
      `;
    } else {
      acceptMeta.hidden = true;
      acceptMeta.innerHTML = '';
    }
  }

  if (fullName && saved?.fullName) fullName.value = saved.fullName;
  if (docId && saved?.docId) docId.value = saved.docId;
  if (acceptCheck) acceptCheck.checked = !!saved?.accepted;
}

function normalizeDoc(raw) {
  return String(raw ?? '').replace(/\D+/g, '').trim();
}

function validateAcceptance() {
  if (!isFullyRead()) return { ok: false, msg: 'Primero completa la lectura (100%).' };

  const name = (fullName?.value || '').trim();
  const doc  = normalizeDoc(docId?.value || '');

  if (!name || name.length < 5) return { ok: false, msg: 'Escribe tu nombre completo.' };
  if (!doc || doc.length < 5) return { ok: false, msg: 'Escribe un documento válido (solo números).' };
  if (!acceptCheck?.checked) return { ok: false, msg: 'Debes marcar la casilla de aceptación.' };

  return { ok: true, msg: '', name, doc };
}

function openWhatsAppAcceptance(payload) {
  const readPct = payload?.readProgress?.readPct ?? 0;
  const year = payload?.docMeta?.year || DOC_YEAR;
  const ver  = payload?.docMeta?.version || DOC_VER;

  const msg =
`Hola Musicala 👋
Acepté el Acuerdo de Experiencia (${year}${ver ? ` · ${ver}` : ''}).
Nombre: ${payload.fullName}
Documento: ${payload.docId}
Progreso lectura: ${readPct}%
Código: ${WHATSAPP_KEY}`;

  const url = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function saveAcceptance() {
  const v = validateAcceptance();
  if (!v.ok) return toast(v.msg);

  // normaliza doc en el input para que quede limpio
  if (docId) docId.value = v.doc;

  const payload = {
    docMeta: DOC.meta,
    fullName: v.name,
    docId: v.doc,
    accepted: true,
    acceptedAt: new Date().toISOString(),
    readProgress: {
      readSections: Array.from(state.readSet),
      readPct: getReadPct(),
    },
  };

  const ok = saveJSON(STORAGE_KEY, payload);

  hydrateAcceptanceUI();
  updateGate();

  if (!ok) {
    toast('No pude guardar en este dispositivo (storage bloqueado).');
    return;
  }

  toast('Aceptación guardada ✅');
  // WhatsApp
  openWhatsAppAcceptance(payload);
}

function exportAcceptance() {
  const saved = loadJSON(STORAGE_KEY, null);
  if (!saved?.acceptedAt) return toast('Primero guarda tu aceptación.');
  if (!isFullyRead()) return toast('Completa la lectura (100%) para exportar.');

  try {
    const blob = new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `aceptacion_musicala_${(saved.docId || 'doc')}_${DOC_YEAR}_${DOC_VER}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  } catch {
    toast('No pude exportar en este navegador.');
  }
}

/* =========================
   UX
========================= */
function scrollContentTop() {
  // mejor que scrollIntoView del contenedor: llevamos foco al article
  if (articleEl) {
    articleEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    const content = document.querySelector('.content');
    content?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function toast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;

  t.style.position = 'fixed';
  t.style.left = '50%';
  t.style.bottom = '18px';
  t.style.transform = 'translateX(-50%)';
  t.style.padding = '10px 12px';
  t.style.borderRadius = '999px';
  t.style.background = 'rgba(255,255,255,.92)';
  t.style.border = '1px solid rgba(11,16,32,.12)';
  t.style.boxShadow = '0 14px 35px rgba(11,16,32,.12)';
  t.style.zIndex = '9999';
  t.style.color = 'rgba(11,16,32,.86)';
  t.style.fontWeight = '800';
  t.style.fontSize = '13px';
  t.style.maxWidth = '92vw';
  t.style.textAlign = 'center';

  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

function debounce(fn, wait = 120) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* =========================
   RENDER / INIT
========================= */
function renderAll() {
  buildNavOnce();
  updateNavUI();
  renderArticle();
  updateStats();
  hydrateAcceptanceUI();
  updateGate();
}

/* =========================
   EVENTS
========================= */
const onSearch = debounce(() => {
  const q = (searchInput?.value || '').trim();
  const wasSearching = !!state.query.trim();

  state.query = q;

  if (q) {
    // al empezar búsqueda, guarda dónde estaba
    if (!wasSearching) state.lastActiveId = state.activeId;
    // en búsqueda no importa activeId, renderArticle muestra lista
  } else {
    // al salir de búsqueda, vuelve a donde estaba
    state.activeId = state.lastActiveId || DOC.sections[0].id;
  }

  updateNavUI();
  renderArticle();
  updateStats();
}, 120);

searchInput?.addEventListener('input', onSearch);

btnAccept?.addEventListener('click', saveAcceptance);
btnExport?.addEventListener('click', exportAcceptance);

// Enter en inputs dispara guardar
[fullName, docId].forEach(el => {
  el?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveAcceptance();
  });
});

/* =========================
   START
========================= */
renderAll();
