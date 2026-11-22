// Starter data for Sabbatical Menu. Everything here is editable in the app.

export const ENERGY = ['low', 'medium', 'high'];
export const PHYSICAL = ['none', 'low', 'high'];
export const COMPANY = ['alone', 'around', 'with'];
export const COMPANY_LABEL = {
  alone: 'By myself',
  around: 'Around people',
  with: 'With someone',
};

const V = (id, name, mental, physical, company, needs, extra = {}) => ({
  id, name, mental, physical, company, needs, alsoAt: [], neverAt: [], itemKind: null, ...extra,
});
const A = (id, name, variants, extra = {}) => ({
  id, name, saved: false, itemsLabel: '', items: [], variants, ...extra,
});
const P = (id, name, where, company, offers) => ({
  id, name, where, company, offers, saved: false,
});

export function seedState() {
  return {
    version: 3,
    tags: ['printer', 'games', 'kitchen', 'table', 'desk', 'seat', 'gym', 'spa', 'culture', 'social', 'coffee', 'food'],
    activities: [
      A('3d-printing', '3D printing', [
        V('print-familiar', 'Print a familiar model', 'low', 'low', ['alone'], ['printer']),
        V('print-new', 'Design or tune something new', 'high', 'low', ['alone'], ['printer', 'desk']),
      ]),
      A('gaming', 'Gaming', [
        V('game-familiar', 'Play a familiar game', 'low', 'low', ['alone', 'with'], ['games'], { itemKind: 'familiar' }),
        V('game-new', 'Learn a new game', 'medium', 'low', ['alone', 'with'], ['games'], { itemKind: 'new' }),
      ], { itemsLabel: 'Games' }),
      A('cooking', 'Cooking', [
        V('cook-familiar', 'Cook something familiar', 'low', 'low', ['alone', 'with'], ['kitchen']),
        V('cook-new', 'Try a new recipe', 'medium', 'low', ['alone', 'with'], ['kitchen']),
        V('cook-ferment', 'Tend sourdough or ferments', 'low', 'low', ['alone'], ['kitchen']),
      ]),
      A('reading', 'Reading', [
        V('read-pleasure', 'Read for pleasure', 'low', 'none', ['alone', 'around'], ['seat']),
        V('read-dense', 'Read non-fiction', 'medium', 'none', ['alone', 'around'], ['seat']),
      ]),
      A('crafting', 'Crafting', [
        V('craft-easy', 'Easy making', 'low', 'low', ['alone', 'with'], ['table']),
        V('craft-new', 'New technique or project', 'medium', 'low', ['alone', 'with'], ['table']),
      ]),
      A('gym', 'Gym, classes and spa', [
        V('gym-workout', 'Workout', 'low', 'high', ['alone', 'around'], ['gym']),
        V('gym-class', 'Class', 'low', 'high', ['around'], ['gym']),
        V('gym-spa', 'Spa', 'low', 'none', ['alone', 'around'], ['spa']),
      ]),
      A('coworking', 'Co-working', [
        V('cowork-focus', 'Focused work session', 'medium', 'none', ['around'], ['desk']),
      ]),
      A('museums', 'Museums', [
        V('museum-wander', 'Wander', 'low', 'low', ['around', 'with'], ['culture']),
      ]),
      A('friends', 'Lunch or coffee with work friends', [
        V('friends-catchup', 'Catch-up', 'low', 'none', ['with'], ['social']),
      ]),
      A('learning', 'Learning and coding', [
        V('learn-new', 'Learn something new', 'high', 'none', ['alone', 'around'], ['desk']),
      ]),
    ],
    places: [
      P('home', 'Home', 'home', ['alone', 'with'], ['printer', 'games', 'kitchen', 'table', 'desk', 'seat']),
      P('pret', 'Pret', 'local', ['alone', 'around', 'with'], ['seat', 'desk', 'coffee', 'food']),
      P('gails', "Gail's", 'local', ['alone', 'around', 'with'], ['seat', 'desk', 'coffee', 'food']),
      P('bfi', 'BFI Café', 'out', ['alone', 'around', 'with'], ['seat', 'desk', 'coffee', 'food']),
      P('dauns', 'Dauns', 'out', ['alone', 'around', 'with'], ['seat', 'coffee', 'food']),
      P('southbank', 'Southbank Centre', 'out', ['alone', 'around', 'with'], ['seat', 'desk', 'culture']),
      P('gym', 'Third Space', 'out', ['alone', 'around'], ['gym', 'spa']),
      P('coworking', 'Co-working space', 'out', ['alone', 'around'], ['desk', 'seat']),
      P('museums', 'Museums', 'out', ['alone', 'around', 'with'], ['culture', 'seat']),
      P('canary-wharf', 'Canary Wharf', 'out', ['with'], ['social', 'seat', 'coffee', 'food', 'gym']),
    ],
    extras: [
      { id: 'coffee', name: 'Coffee', needs: ['coffee'] },
      { id: 'bite', name: 'Something to eat', needs: ['food'] },
    ],
    savedCombos: [],
    history: [],
  };
}
