// Soft attribute matching. Pure functions, no DOM.
import { ENERGY } from './data.js';

const DAY = 86400000;

export function placeById(state, id) { return state.places.find(p => p.id === id) || null; }
export function extraById(state, id) { return state.extras.find(e => e.id === id) || null; }
export function findVariant(state, id) {
  for (const a of state.activities) {
    const v = a.variants.find(x => x.id === id);
    if (v) return { activity: a, variant: v };
  }
  return null;
}

// Does this variant work at this place?
export function fits(variant, place) {
  if (variant.neverAt.includes(place.id)) return false;
  if (variant.alsoAt.includes(place.id)) return true;
  if (!variant.needs.every(n => place.offers.includes(n))) return false;
  return variant.company.some(c => place.company.includes(c));
}

// Every sensible activity/place pairing, plus standalone activities.
export function candidates(state) {
  const out = [];
  for (const activity of state.activities) {
    for (const variant of activity.variants) {
      if (variant.needs.length === 0) out.push({ activity, variant, place: null });
      for (const place of state.places) {
        if (variant.needs.length === 0 && !variant.alsoAt.includes(place.id)) continue;
        if (fits(variant, place)) out.push({ activity, variant, place });
      }
    }
  }
  return out;
}

export function extrasFor(state, place) {
  if (!place) return state.extras.filter(e => e.needs.length === 0);
  return state.extras.filter(e => e.needs.every(n => place.offers.includes(n)));
}

// Cheap stable pseudo-random in [0,1) from a string + seed.
export function jitter(key, seed) {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// "Go out" accepts local places too; "Stay local" only accepts local ones.
export function whereOk(pref, place) {
  if (pref === 'home') return place.where === 'home';
  if (pref === 'local') return place.where === 'local';
  if (pref === 'out') return place.where !== 'home';
  return true;
}

// prefs: { energy, where, company } each may be null/'either' = no preference.
export function scoreCandidate(c, prefs, history, now = Date.now()) {
  let penalty = 0;
  const notes = [];
  if (prefs.energy) {
    const diff = ENERGY.indexOf(c.variant.mental) - ENERGY.indexOf(prefs.energy);
    penalty += Math.abs(diff);
    if (diff > 0) notes.push('a little more mental effort than you asked for');
    if (diff < 0) notes.push('a little gentler than you asked for');
  }
  if (prefs.where && prefs.where !== 'either' && c.place && !whereOk(prefs.where, c.place)) {
    penalty += 2;
    if (prefs.where === 'home') notes.push('out rather than at home');
    else if (prefs.where === 'local') notes.push(c.place.where === 'home' ? 'at home rather than local' : 'a little further afield than local');
    else notes.push('at home rather than out');
  }
  if (prefs.company) {
    const avail = c.place
      ? c.variant.company.filter(x => c.place.company.includes(x))
      : c.variant.company;
    if (!avail.includes(prefs.company)) {
      penalty += 2;
      notes.push('different company than you asked for');
    }
  }
  const recent = history.some(h => h.variantId === c.variant.id && now - h.ts < 2 * DAY);
  if (recent) penalty += 0.5;
  return { penalty, notes };
}

export function rank(state, prefs, seed) {
  const now = Date.now();
  return candidates(state)
    .map(c => {
      const s = scoreCandidate(c, prefs, state.history, now);
      const key = c.variant.id + '|' + (c.place ? c.place.id : '');
      return { ...c, key, penalty: s.penalty, notes: s.notes, order: s.penalty + jitter(key, seed) * 0.45 };
    })
    .sort((a, b) => a.order - b.order);
}

export function pickItem(activity, variant, seed) {
  if (!activity.items.length) return null;
  const pool = variant.itemKind
    ? activity.items.filter(i => i.kind === variant.itemKind)
    : activity.items;
  if (!pool.length) return null;
  return pool[Math.floor(jitter(variant.id, seed) * pool.length)].name;
}
