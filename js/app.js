import { seedState, ENERGY, PHYSICAL, COMPANY, COMPANY_LABEL } from './data.js';
import { loadState, saveState, askForPersistence } from './db.js';
import {
  rank, scoreCandidate, findVariant, placeById, extraById, extrasFor, pickItem, fits,
} from './match.js';

// ---------- tiny DOM helper ----------
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(kid));
  }
  return el;
}
const $ = id => document.getElementById(id);
const uid = () => 'x' + Math.random().toString(36).slice(2, 9);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- state ----------
let state;
let view = 'today';
let collTab = 'activities';
const prefs = { energy: null, where: null, company: null };
let seed = 1;
let cur = null; // { variantId, placeId, extraId, seed }

function normalize(s) {
  s.tags ||= [];
  s.activities ||= [];
  s.places ||= [];
  s.extras ||= [];
  s.savedCombos ||= [];
  s.history ||= [];
  for (const a of s.activities) {
    a.items ||= []; a.itemsLabel ||= ''; a.saved = !!a.saved;
    for (const v of a.variants) { v.alsoAt ||= []; v.neverAt ||= []; v.itemKind ||= null; v.needs ||= []; v.company ||= ['alone']; v.physical ||= 'none'; }
  }
  for (const p of s.places) { p.saved = !!p.saved; p.offers ||= []; p.company ||= ['alone']; }
  const tagSet = new Set(s.tags);
  for (const t of [...s.activities.flatMap(a => a.variants.flatMap(v => v.needs)), ...s.places.flatMap(p => p.offers), ...s.extras.flatMap(e => e.needs)]) tagSet.add(t);
  s.tags = [...tagSet];
  return s;
}

function commit() { saveState(state); render(); }

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- suggestion logic ----------
function freshSuggestion() {
  const r = rank(state, prefs, seed);
  const top = r[0];
  cur = top ? { variantId: top.variant.id, placeId: top.place ? top.place.id : null, extraId: null, seed } : null;
}
function curValid() {
  if (!cur) return false;
  const fv = findVariant(state, cur.variantId);
  if (!fv) return false;
  if (cur.placeId) { const p = placeById(state, cur.placeId); if (!p) return false; }
  return true;
}
function resolveCur() {
  const { activity, variant } = findVariant(state, cur.variantId);
  const place = cur.placeId ? placeById(state, cur.placeId) : null;
  const extra = cur.extraId ? extraById(state, cur.extraId) : null;
  return { activity, variant, place, extra };
}
function comboKey(c) { return `${c.variantId}|${c.placeId || ''}|${c.extraId || ''}`; }
function savedComboFor(c) { return state.savedCombos.find(s => comboKey(s) === comboKey(c)); }

function setPref(key, value) {
  prefs[key] = prefs[key] === value ? null : value;
  seed++;
  freshSuggestion();
  render();
}
function shuffle() { seed++; freshSuggestion(); render(); }

function swapActivity() {
  const alts = rank(state, prefs, seed + 1)
    .filter(c => (c.place ? c.place.id : null) === cur.placeId && c.variant.id !== cur.variantId);
  if (!alts.length) return toast('Nothing else fits there');
  seed++;
  cur = { ...cur, variantId: alts[0].variant.id, seed };
  keepExtraIfValid();
  render();
}
function swapPlace() {
  const alts = rank(state, prefs, seed + 1)
    .filter(c => c.variant.id === cur.variantId && (c.place ? c.place.id : null) !== cur.placeId && c.place);
  if (!alts.length) return toast('That activity only fits one place');
  seed++;
  cur = { ...cur, placeId: alts[0].place.id, seed };
  keepExtraIfValid();
  render();
}
function keepExtraIfValid() {
  if (!cur.extraId) return;
  const place = cur.placeId ? placeById(state, cur.placeId) : null;
  if (!extrasFor(state, place).some(e => e.id === cur.extraId)) cur.extraId = null;
}
function toggleExtra(id) { cur.extraId = cur.extraId === id ? null : id; render(); }

function choose() {
  const { activity, variant, place, extra } = resolveCur();
  const item = pickItem(activity, variant, cur.seed);
  state.history.unshift({
    id: uid(), ts: Date.now(), variantId: variant.id, placeId: place ? place.id : null,
    extraId: extra ? extra.id : null,
    title: variant.name, activityName: activity.name, placeName: place ? place.name : '', extraName: extra ? extra.name : '',
    item: item || '',
  });
  saveState(state);
  toast('Noted. Enjoy it, or don’t. No pressure.');
  render();
}
function toggleSaveCombo() {
  const existing = savedComboFor(cur);
  if (existing) state.savedCombos = state.savedCombos.filter(s => s !== existing);
  else state.savedCombos.unshift({ id: uid(), variantId: cur.variantId, placeId: cur.placeId, extraId: cur.extraId, ts: Date.now() });
  commit();
  toast(existing ? 'Removed from saved' : 'Saved for later');
}

// ---------- views ----------
const ENERGY_CARDS = [
  { v: 'low', hue: 'teal', t: 'Low', d: 'easy going' },
  { v: 'medium', hue: 'amber', t: 'Medium', d: 'some focus' },
  { v: 'high', hue: 'coral', t: 'High', d: 'deep focus' },
];
const WHERE_CARDS = [
  { v: 'home', hue: 'blue', t: 'Stay home', d: '' },
  { v: 'out', hue: 'teal', t: 'Go out', d: '' },
  { v: 'either', hue: 'sky', t: 'Either', d: '' },
];
const COMPANY_CARDS = [
  { v: 'alone', hue: 'violet', t: 'By myself', d: '' },
  { v: 'around', hue: 'pink', t: 'Around people', d: 'no need to chat' },
  { v: 'with', hue: 'amber', t: 'With someone', d: '' },
];

function cardGroup(title, hint, cards, key) {
  return h('section', { class: 'group' },
    h('div', { class: 'group-title' }, title, hint ? h('small', null, ' · ' + hint) : null),
    h('div', { class: 'cards' }, cards.map(c =>
      h('button', {
        class: 'card', type: 'button', 'data-hue': c.hue, 'aria-pressed': String(prefs[key] === c.v), onclick: () => setPref(key, c.v),
      }, h('span', { class: 't' }, c.t), c.d ? h('span', { class: 'd' }, c.d) : null))));
}

function suggestionCard() {
  if (!curValid()) freshSuggestion();
  if (!cur) return h('div', { class: 'empty' }, 'Your menu is empty. Add some activities and places under Edit.');
  const { activity, variant, place, extra } = resolveCur();
  const scored = scoreCandidate({ activity, variant, place }, prefs, state.history);
  const item = pickItem(activity, variant, cur.seed);
  const saved = !!savedComboFor(cur);
  const extraOpts = extrasFor(state, place);

  const pills = [cap(variant.mental) + ' mental energy'];
  if (variant.physical !== 'none') pills.push('Physical: ' + variant.physical);
  const comp = (place ? variant.company.filter(c => place.company.includes(c)) : variant.company).map(c => COMPANY_LABEL[c]);
  if (comp.length) pills.push(comp.join(' / '));

  return h('section', { class: 'suggest' },
    h('div', { class: 'kicker' }, activity.name),
    h('h2', null, variant.name),
    place ? h('div', { class: 'where' }, 'at ' + place.name) : null,
    item ? h('div', { class: 'detail' }, `${activity.itemsLabel || 'Maybe'}: ${item}`) : null,
    extraOpts.length ? h('div', { class: 'row' }, h('div', { class: 'chips' }, extraOpts.map(e =>
      h('button', { class: 'chip', type: 'button', 'aria-pressed': String(cur.extraId === e.id), onclick: () => toggleExtra(e.id) },
        (cur.extraId === e.id ? '✓ ' : '+ ') + e.name)))) : null,
    h('div', { class: 'meta' }, pills.map(p => h('span', { class: 'pill' }, p))),
    scored.notes.length ? h('p', { class: 'note' }, 'A gentle stretch: ' + scored.notes.join(', ') + '.') : null,
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', onclick: choose }, 'I’ll do this'),
      h('button', { class: 'btn', type: 'button', onclick: shuffle }, 'Shuffle')),
    h('div', { class: 'row' },
      h('button', { class: 'btn small quiet', type: 'button', onclick: swapActivity }, '⇄ Swap activity'),
      place ? h('button', { class: 'btn small quiet', type: 'button', onclick: swapPlace }, '⇄ Swap place') : null,
      h('button', { class: 'btn small quiet', type: 'button', 'aria-pressed': String(saved), onclick: toggleSaveCombo },
        saved ? '★ Saved' : '☆ Save for later')));
}

function alternatives() {
  if (!cur) return null;
  const seen = new Set([cur.variantId]);
  const alts = [];
  for (const c of rank(state, prefs, seed)) {
    if (seen.has(c.variant.id)) continue;
    seen.add(c.variant.id);
    alts.push(c);
    if (alts.length === 3) break;
  }
  if (!alts.length) return null;
  return h('section', null,
    h('div', { class: 'section-label alt-title' }, 'Or maybe'),
    h('div', { class: 'list' }, alts.map(c =>
      h('button', {
        class: 'item', type: 'button',
        onclick: () => { cur = { variantId: c.variant.id, placeId: c.place ? c.place.id : null, extraId: null, seed: ++seed }; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
      }, h('div', { class: 'grow' }, h('div', { class: 'name' }, c.variant.name), h('div', { class: 'sub' }, c.place ? c.place.name : c.activity.name))))));
}

function todayView() {
  return h('div', null,
    h('header', { class: 'head' }, h('h1', null, 'Sabbatical Menu'), h('p', { class: 'sub' }, 'Plan experiences, not outcomes. What do you fancy today?')),
    cardGroup('Mental energy', 'optional', ENERGY_CARDS, 'energy'),
    cardGroup('Where', 'optional', WHERE_CARDS, 'where'),
    cardGroup('Company', 'optional', COMPANY_CARDS, 'company'),
    suggestionCard(),
    alternatives());
}

function comboDescription(c) {
  const fv = findVariant(state, c.variantId);
  const place = c.placeId ? placeById(state, c.placeId) : null;
  const extra = c.extraId ? extraById(state, c.extraId) : null;
  if (!fv) return null;
  return { title: fv.variant.name, sub: [place && place.name, extra && '+ ' + extra.name].filter(Boolean).join(' · ') || fv.activity.name };
}

function loadCombo(c) {
  cur = { variantId: c.variantId, placeId: c.placeId, extraId: c.extraId, seed: ++seed };
  view = 'today'; render(); window.scrollTo({ top: 0 });
}

function savedView() {
  const combos = state.savedCombos.map(c => ({ c, d: comboDescription(c) })).filter(x => x.d);
  const acts = state.activities.filter(a => a.saved);
  const places = state.places.filter(p => p.saved);
  const empty = !combos.length && !acts.length && !places.length;
  return h('div', null,
    h('header', { class: 'head' }, h('h1', null, 'Saved'), h('p', { class: 'sub' }, 'Ideas for another day.')),
    empty ? h('div', { class: 'empty' }, 'Nothing saved yet. Tap “Save for later” on a suggestion, or star things under Edit.') : null,
    combos.length ? h('div', null, h('div', { class: 'section-label' }, 'Combinations'), h('div', { class: 'list' }, combos.map(({ c, d }) =>
      h('div', { class: 'item' },
        h('button', { class: 'grow item', type: 'button', style: 'border:0;padding:0;background:none', onclick: () => loadCombo(c) },
          h('div', { class: 'grow' }, h('div', { class: 'name' }, d.title), h('div', { class: 'sub' }, d.sub))),
        h('button', { class: 'star', type: 'button', 'aria-pressed': 'true', 'aria-label': 'Remove from saved', onclick: () => { state.savedCombos = state.savedCombos.filter(s => s !== c); commit(); } }, '★'))))) : null,
    acts.length ? h('div', null, h('div', { class: 'section-label' }, 'Activities'), h('div', { class: 'list' }, acts.map(a =>
      h('div', { class: 'item' },
        h('button', { class: 'grow item', type: 'button', style: 'border:0;padding:0;background:none', onclick: () => tryActivity(a) },
          h('div', { class: 'grow' }, h('div', { class: 'name' }, a.name), h('div', { class: 'sub' }, a.variants.length + ' variant' + (a.variants.length === 1 ? '' : 's')))),
        h('button', { class: 'star', type: 'button', 'aria-pressed': 'true', 'aria-label': 'Remove from saved', onclick: () => { a.saved = false; commit(); } }, '★'))))) : null,
    places.length ? h('div', null, h('div', { class: 'section-label' }, 'Places'), h('div', { class: 'list' }, places.map(p =>
      h('div', { class: 'item' },
        h('button', { class: 'grow item', type: 'button', style: 'border:0;padding:0;background:none', onclick: () => tryPlace(p) },
          h('div', { class: 'grow' }, h('div', { class: 'name' }, p.name), h('div', { class: 'sub' }, p.where === 'home' ? 'At home' : 'Out'))),
        h('button', { class: 'star', type: 'button', 'aria-pressed': 'true', 'aria-label': 'Remove from saved', onclick: () => { p.saved = false; commit(); } }, '★'))))) : null);
}

function tryActivity(a) {
  const ids = new Set(a.variants.map(v => v.id));
  const r = rank(state, prefs, ++seed).filter(c => ids.has(c.variant.id));
  if (!r.length) return toast('Nothing fits that yet');
  loadCombo({ variantId: r[0].variant.id, placeId: r[0].place ? r[0].place.id : null, extraId: null });
}
function tryPlace(p) {
  const r = rank(state, prefs, ++seed).filter(c => c.place && c.place.id === p.id);
  if (!r.length) return toast('Nothing fits there yet');
  loadCombo({ variantId: r[0].variant.id, placeId: p.id, extraId: null });
}

function historyView() {
  const byDay = new Map();
  for (const e of state.history) {
    const day = new Date(e.ts).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(e);
  }
  return h('div', null,
    h('header', { class: 'head' }, h('h1', null, 'Chosen'), h('p', { class: 'sub' }, 'A quiet record of what you picked, not what you finished.')),
    !state.history.length ? h('div', { class: 'empty' }, 'Nothing here yet. Choices you make will appear as a gentle trail.') : null,
    [...byDay].map(([day, entries]) => h('section', null,
      h('div', { class: 'section-label' }, day),
      h('div', { class: 'list' }, entries.map(e =>
        h('div', { class: 'item' },
          h('div', { class: 'grow' },
            h('div', { class: 'name' }, e.title),
            h('div', { class: 'sub' }, [e.placeName && 'at ' + e.placeName, e.extraName && '+ ' + e.extraName, e.item].filter(Boolean).join(' · ') || e.activityName)),
          h('button', { class: 'btn small quiet', type: 'button', onclick: () => { if (findVariant(state, e.variantId)) loadCombo(e); else toast('That one has since been removed'); } }, 'Again'),
          h('button', { class: 'star', type: 'button', 'aria-label': 'Remove from history', onclick: () => { state.history = state.history.filter(x => x !== e); commit(); } }, '×')))))));
}

// ---------- collection (editing) ----------
function collectionView() {
  const tabs = [['activities', 'Activities'], ['places', 'Places'], ['extras', 'Extras'], ['data', 'Data']];
  return h('div', null,
    h('header', { class: 'head' }, h('h1', null, 'Your menu'), h('p', { class: 'sub' }, 'Change anything. It all lives on this phone.')),
    h('div', { class: 'seg' }, tabs.map(([k, l]) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(collTab === k), onclick: () => { collTab = k; render(); } }, l))),
    collTab === 'activities' ? activitiesList() : collTab === 'places' ? placesList() : collTab === 'extras' ? extrasList() : dataPanel());
}

function starBtn(obj) {
  return h('button', { class: 'star', type: 'button', 'aria-pressed': String(obj.saved), 'aria-label': 'Save for later', onclick: e => { e.stopPropagation(); obj.saved = !obj.saved; commit(); } }, obj.saved ? '★' : '☆');
}

function activitiesList() {
  return h('div', null,
    h('div', { class: 'list' }, state.activities.map(a =>
      h('div', { class: 'item', role: 'button', tabindex: '0', onclick: () => editActivity(a) },
        h('div', { class: 'grow' }, h('div', { class: 'name' }, a.name), h('div', { class: 'sub' }, a.variants.map(v => v.name).join(' · '))),
        starBtn(a)))),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => editActivity(null) }, '+ Add activity')));
}
function placesList() {
  return h('div', null,
    h('div', { class: 'list' }, state.places.map(p =>
      h('div', { class: 'item', role: 'button', tabindex: '0', onclick: () => editPlace(p) },
        h('div', { class: 'grow' }, h('div', { class: 'name' }, p.name), h('div', { class: 'sub' }, (p.where === 'home' ? 'Home' : 'Out') + ' · ' + (p.offers.join(', ') || 'no tags'))),
        starBtn(p)))),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => editPlace(null) }, '+ Add place')));
}
function extrasList() {
  return h('div', null,
    h('p', { class: 'sub', style: 'margin-bottom:10px' }, 'Optional add-ons, like coffee. They appear when a place offers what they need.'),
    h('div', { class: 'list' }, state.extras.map(x =>
      h('div', { class: 'item', role: 'button', tabindex: '0', onclick: () => editExtra(x) },
        h('div', { class: 'grow' }, h('div', { class: 'name' }, x.name), h('div', { class: 'sub' }, x.needs.length ? 'Needs: ' + x.needs.join(', ') : 'Goes anywhere'))))),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => editExtra(null) }, '+ Add extra')));
}

function dataPanel() {
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none', onchange: importFile });
  return h('div', null,
    h('p', { class: 'sub' }, 'Your data is stored only in this browser. Export a backup now and then, especially before clearing Safari data.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', onclick: exportData }, 'Export backup'),
      h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, 'Import backup')),
    fileInput,
    h('div', { class: 'section-label' }, 'Start over'),
    h('button', { class: 'btn danger', type: 'button', onclick: resetData }, 'Reset to starter menu'));
}

async function exportData() {
  const json = JSON.stringify(state, null, 2);
  const name = `sabbatical-menu-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Sabbatical Menu backup' }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function importFile(ev) {
  const f = ev.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const s = JSON.parse(reader.result);
      if (!Array.isArray(s.activities) || !Array.isArray(s.places)) throw new Error('bad');
      if (!confirm('Replace everything on this phone with this backup?')) return;
      state = normalize(s); freshSuggestion(); commit(); toast('Backup restored');
    } catch { toast('That file doesn’t look like a backup'); }
  };
  reader.readAsText(f);
}
function resetData() {
  if (!confirm('Replace your menu, saved ideas and history with the starter menu?')) return;
  state = normalize(seedState()); freshSuggestion(); commit(); toast('Starter menu restored');
}

// ---------- editor sheet ----------
function openSheet({ title, draft, body, onSave, onDelete }) {
  const root = $('sheet-root');
  const scrim = h('div', { class: 'scrim' });
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  scrim.append(sheet);
  const close = () => { scrim.remove(); document.body.style.overflow = ''; };
  const redraw = () => {
    const top = sheet.scrollTop;
    sheet.replaceChildren(
      h('div', { class: 'sheet-head' }, h('h2', null, title), h('button', { class: 'btn small quiet', type: 'button', onclick: close }, 'Cancel')),
      body(draft, redraw),
      h('div', { class: 'actions' },
        onDelete ? h('button', { class: 'btn danger', type: 'button', onclick: () => { if (confirm('Delete this? This can’t be undone.')) { onDelete(); close(); commit(); } } }, 'Delete') : null,
        h('button', { class: 'btn primary', type: 'button', onclick: () => { if (onSave(draft) !== false) { close(); commit(); } } }, 'Save')));
    sheet.scrollTop = top;
  };
  redraw();
  root.append(scrim);
  document.body.style.overflow = 'hidden';
}

function chipSet(options, selected, multi, onChange) {
  return h('div', { class: 'chips' }, options.map(o => {
    const on = multi ? selected.includes(o.v) : selected === o.v;
    return h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(on),
      onclick: () => onChange(multi ? (on ? selected.filter(x => x !== o.v) : [...selected, o.v]) : o.v),
    }, o.l);
  }));
}
function tagChips(selected, onChange, redraw) {
  const wrap = chipSet(state.tags.map(t => ({ v: t, l: t })), selected, true, onChange);
  wrap.append(h('button', {
    class: 'chip add', type: 'button', onclick: () => {
      const t = (prompt('New tag name (e.g. “garden”)') || '').trim().toLowerCase();
      if (!t) return;
      if (!state.tags.includes(t)) state.tags.push(t);
      onChange(selected.includes(t) ? selected : [...selected, t]);
    },
  }, '+ new tag'));
  return wrap;
}
function field(label, control, hint) {
  return h('div', { class: 'field' }, h('div', { class: 'lbl' }, label), control, hint ? h('div', { class: 'hint' }, hint) : null);
}
function textInput(value, onInput, placeholder) {
  const el = h('input', { type: 'text', placeholder: placeholder || '', autocomplete: 'off' });
  el.value = value; el.addEventListener('input', () => onInput(el.value));
  return el;
}

function editActivity(existing) {
  const draft = existing
    ? JSON.parse(JSON.stringify(existing))
    : { id: uid(), name: '', saved: false, itemsLabel: '', items: [], variants: [{ id: uid(), name: '', mental: 'low', physical: 'none', company: ['alone'], needs: [], alsoAt: [], neverAt: [], itemKind: null }] };
  draft._itemsText = draft.items.map(i => i.name + (i.kind === 'new' ? ' (new)' : '')).join('\n');
  const placeOpts = state.places.map(p => ({ v: p.id, l: p.name }));

  openSheet({
    title: existing ? 'Edit activity' : 'New activity',
    draft,
    body: (d, redraw) => h('div', null,
      field('Name', textInput(d.name, v => { d.name = v; }, 'e.g. Baking')),
      h('div', { class: 'section-label', style: 'margin-top:4px' }, 'Variants'),
      d.variants.map((v, i) => h('div', { class: 'subcard' },
        h('div', { class: 'top' }, textInput(v.name, x => { v.name = x; }, 'e.g. Bake something familiar'),
          d.variants.length > 1 ? h('button', { class: 'btn small quiet', type: 'button', 'aria-label': 'Remove variant', onclick: () => { d.variants.splice(i, 1); redraw(); } }, '×') : null),
        field('Mental energy', chipSet(ENERGY.map(e => ({ v: e, l: cap(e) })), v.mental, false, x => { v.mental = x; redraw(); })),
        field('Company that suits it', chipSet(COMPANY.map(c => ({ v: c, l: COMPANY_LABEL[c] })), v.company, true, x => { v.company = x; redraw(); })),
        field('Needs from a place', tagChips(v.needs, x => { v.needs = x; redraw(); }, redraw), 'Leave empty for a standalone activity that needs no place.'),
        h('details', { class: 'more' }, h('summary', null, 'More options'),
          field('Physical intensity', chipSet(PHYSICAL.map(p => ({ v: p, l: cap(p) })), v.physical, false, x => { v.physical = x; redraw(); })),
          field('Also works at (override)', chipSet(placeOpts, v.alsoAt, true, x => { v.alsoAt = x; redraw(); })),
          field('Never pair with', chipSet(placeOpts, v.neverAt, true, x => { v.neverAt = x; redraw(); })),
          d.itemsLabel ? field('Picks from my list', chipSet([{ v: '', l: 'Any' }, { v: 'familiar', l: 'Familiar' }, { v: 'new', l: 'New' }], v.itemKind || '', false, x => { v.itemKind = x || null; redraw(); })) : null))),
      h('button', { class: 'btn small', type: 'button', onclick: () => { d.variants.push({ id: uid(), name: '', mental: 'low', physical: 'none', company: ['alone'], needs: [], alsoAt: [], neverAt: [], itemKind: null }); redraw(); } }, '+ Add variant'),
      h('div', { class: 'section-label' }, 'Your own list (optional)'),
      field('List name', textInput(d.itemsLabel, x => { d.itemsLabel = x; }, 'e.g. Games'), 'Suggestions will pick something from this list.'),
      (() => {
        const ta = h('textarea', { placeholder: 'One per line. Add (new) after ones you haven’t tried.' });
        ta.value = d._itemsText; ta.addEventListener('input', () => { d._itemsText = ta.value; });
        return ta;
      })()),
    onSave: d => {
      if (!d.name.trim()) { toast('Give it a name first'); return false; }
      d.variants = d.variants.filter(v => v.name.trim());
      if (!d.variants.length) { toast('Add at least one variant'); return false; }
      d.name = d.name.trim();
      d.variants.forEach(v => { v.name = v.name.trim(); });
      d.items = d._itemsText.split('\n').map(l => l.trim()).filter(Boolean).map(l => (/\(new\)$/i.test(l) ? { name: l.replace(/\s*\(new\)$/i, ''), kind: 'new' } : { name: l, kind: 'familiar' }));
      delete d._itemsText;
      const i = state.activities.findIndex(a => a.id === d.id);
      if (i >= 0) state.activities[i] = d; else state.activities.push(d);
      cleanSavedCombos();
      freshSuggestion();
    },
    onDelete: existing ? () => { state.activities = state.activities.filter(a => a.id !== existing.id); cleanSavedCombos(); freshSuggestion(); } : null,
  });
}

function editPlace(existing) {
  const draft = existing ? JSON.parse(JSON.stringify(existing)) : { id: uid(), name: '', where: 'out', company: ['alone', 'around'], offers: [], saved: false };
  openSheet({
    title: existing ? 'Edit place' : 'New place',
    draft,
    body: (d, redraw) => h('div', null,
      field('Name', textInput(d.name, v => { d.name = v; }, 'e.g. The library')),
      field('Where', chipSet([{ v: 'home', l: 'At home' }, { v: 'out', l: 'Out' }], d.where, false, x => { d.where = x; redraw(); })),
      field('Company possible here', chipSet(COMPANY.map(c => ({ v: c, l: COMPANY_LABEL[c] })), d.company, true, x => { d.company = x; redraw(); })),
      field('What it offers', tagChips(d.offers, x => { d.offers = x; redraw(); }, redraw), 'Activities match places by these tags.')),
    onSave: d => {
      if (!d.name.trim()) { toast('Give it a name first'); return false; }
      d.name = d.name.trim();
      const i = state.places.findIndex(p => p.id === d.id);
      if (i >= 0) state.places[i] = d; else state.places.push(d);
      freshSuggestion();
    },
    onDelete: existing ? () => {
      state.places = state.places.filter(p => p.id !== existing.id);
      for (const a of state.activities) for (const v of a.variants) { v.alsoAt = v.alsoAt.filter(x => x !== existing.id); v.neverAt = v.neverAt.filter(x => x !== existing.id); }
      cleanSavedCombos(); freshSuggestion();
    } : null,
  });
}

function editExtra(existing) {
  const draft = existing ? JSON.parse(JSON.stringify(existing)) : { id: uid(), name: '', needs: [] };
  openSheet({
    title: existing ? 'Edit extra' : 'New extra',
    draft,
    body: (d, redraw) => h('div', null,
      field('Name', textInput(d.name, v => { d.name = v; }, 'e.g. A pastry')),
      field('Needs from a place', tagChips(d.needs, x => { d.needs = x; redraw(); }, redraw), 'Leave empty to offer it anywhere.')),
    onSave: d => {
      if (!d.name.trim()) { toast('Give it a name first'); return false; }
      d.name = d.name.trim();
      const i = state.extras.findIndex(x => x.id === d.id);
      if (i >= 0) state.extras[i] = d; else state.extras.push(d);
    },
    onDelete: existing ? () => { state.extras = state.extras.filter(x => x.id !== existing.id); cleanSavedCombos(); } : null,
  });
}

function cleanSavedCombos() {
  state.savedCombos = state.savedCombos.filter(c =>
    findVariant(state, c.variantId) && (!c.placeId || placeById(state, c.placeId)) && (!c.extraId || extraById(state, c.extraId)));
}

// ---------- shell ----------
const NAV = [['today', '◐', 'Today'], ['saved', '☆', 'Saved'], ['history', '◷', 'Chosen'], ['collection', '✎', 'Edit']];
function renderNav() {
  $('nav').replaceChildren(h('div', { class: 'inner' }, NAV.map(([k, ic, l]) =>
    h('button', { type: 'button', 'aria-current': view === k ? 'page' : null, onclick: () => { view = k; render(); window.scrollTo({ top: 0 }); } },
      h('span', { class: 'ic', 'aria-hidden': 'true' }, ic), l))));
}
function render() {
  const el = view === 'today' ? todayView() : view === 'saved' ? savedView() : view === 'history' ? historyView() : collectionView();
  $('app').replaceChildren(el);
  renderNav();
}

async function init() {
  const stored = await loadState();
  state = normalize(stored || seedState());
  if (!stored) await saveState(state);
  freshSuggestion();
  render();
  askForPersistence();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
