/**
 * Knockout bracket model shared by the GM's runner and every client's overlay
 * @module bracket
 */

/**
 * A combatant entered into the bracket
 * @typedef {object} BracketEntrant
 * @property {string} id - Combatant ID
 * @property {string} name - Combatant name
 * @property {string|null} img - Portrait image
 * @property {number|null} dex - Dexterity score used for seeding
 * @property {number} seed - Seed number, 1 being the highest
 * @property {boolean} hidden - Whether the combatant is hidden from players
 */

/**
 * One seat in a round
 * @typedef {object} BracketSlot
 * @property {number|null} c - Entrant index, or null for an empty seat
 * @property {number} [roll] - Final roll in this match
 * @property {number} [tie] - Roll that tied before the re-roll
 * @property {'won'|'lost'|'bye'} [result] - How the seat left the round
 */

/**
 * A finishing place
 * @typedef {object} BracketPlace
 * @property {number} c - Entrant index
 * @property {'champion'|'lost'|'rolloff'} why - How the place was decided
 * @property {number} [roll] - Losing roll
 * @property {number} [off] - Roll-off value between equal losing rolls
 */

/**
 * Serializable knockout state
 * @typedef {object} Bracket
 * @property {string} id - Tournament ID
 * @property {string} combatId - Combat ID
 * @property {number} base - Tied initiative value
 * @property {string} die - Die denomination, e.g. 'd20'
 * @property {number} count - Number of entrants
 * @property {number} size - Seats in the first round (power of two)
 * @property {number} R - Number of rounds
 * @property {Array<BracketEntrant>} entrants - Entrants by seed
 * @property {Array<Array<BracketSlot>>} rounds - Seats per round; rounds[R] holds the champion
 * @property {number} current - Round being played; equals R once decided
 * @property {Array<{c: number, round: number, roll: number}>} eliminated - Losers in elimination order
 * @property {Array<BracketPlace|null>} places - Finishing places, first place at index 0
 * @property {Array<number>} rolling - Entrant indices waiting on a roll
 * @property {boolean} done - Whether initiative has been applied
 */

/**
 * Standard bracket seat order, so the top seeds meet last
 * @param {number} size - Seats in the first round
 * @returns {Array<number>} Seed per seat, e.g. 8 -> 1,8,4,5,2,7,3,6
 */
export function seedOrder(size) {
  let order = [1, 2];
  while (order.length < size) {
    const mirror = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, mirror - seed]);
  }
  return order;
}

/**
 * Build a fresh bracket; top seeds take byes when the field is not a power of two
 * @param {object} data - Bracket identity
 * @param {string} data.id - Tournament ID
 * @param {string} data.combatId - Combat ID
 * @param {number} data.base - Tied initiative value
 * @param {string} data.die - Die denomination
 * @param {Array<BracketEntrant>} data.entrants - Entrants sorted by seed
 * @returns {Bracket} The bracket
 */
export function createBracket({ id, combatId, base, die, entrants }) {
  const count = entrants.length;
  const size = 2 ** Math.ceil(Math.log2(count));
  const R = Math.log2(size);
  const rounds = [seedOrder(size).map((seed) => ({ c: seed <= count ? seed - 1 : null }))];
  for (let r = 1; r <= R; r++) rounds.push(Array.from({ length: size >> r }, () => ({ c: null })));
  rounds[0].forEach((slot, k) => {
    if (slot.c === null || rounds[0][k ^ 1].c !== null) return;
    slot.result = 'bye';
    rounds[1][k >> 1].c = slot.c;
  });
  return { id, combatId, base, die, count, size, R, entrants, rounds, current: 0, eliminated: [], places: Array(count).fill(null), rolling: [], done: false };
}

/**
 * Matches in a round that still need rolling
 * @param {Bracket} bracket - The bracket
 * @param {number} r - Round index
 * @returns {Array<Array<number>>} Seat index pairs
 */
export function openMatches(bracket, r) {
  const matches = [];
  const seats = bracket.rounds[r] ?? [];
  for (let k = 0; k < seats.length; k += 2) {
    const [a, b] = [seats[k], seats[k + 1]];
    if (a.c !== null && b.c !== null && !a.result && !b.result) matches.push([k, k + 1]);
  }
  return matches;
}

/**
 * Number of real matches in a round; byes only happen in the first
 * @param {Bracket} bracket - The bracket
 * @param {number} r - Round index
 * @returns {number} Match count
 */
function matchesInRound(bracket, r) {
  return r === 0 ? bracket.count - bracket.size / 2 : bracket.size >> (r + 1);
}

/**
 * Lock in places for a finished round: its losers rank by losing roll, equal rolls roll off
 * @param {Bracket} bracket - The bracket, mutated
 * @param {number} r - Finished round index
 * @param {Function} rollOff - Returns a random tie-break value
 */
export function placeRound(bracket, r, rollOff) {
  let start = 1;
  for (let q = r + 1; q < bracket.R; q++) start += matchesInRound(bracket, q);
  const byRoll = Map.groupBy(
    bracket.eliminated.filter((loser) => loser.round === r),
    (loser) => loser.roll
  );
  const ordered = [...byRoll.keys()]
    .sort((a, b) => b - a)
    .flatMap((roll) => {
      const group = byRoll.get(roll);
      if (group.length === 1) return [{ c: group[0].c, why: 'lost', roll }];
      return group.map((loser) => ({ c: loser.c, why: 'rolloff', roll, off: rollOff() })).sort((a, b) => b.off - a.off);
    });
  ordered.forEach((place, i) => (bracket.places[start + i] = place));
  if (r === bracket.R - 1) bracket.places[0] = { c: bracket.rounds[bracket.R][0].c, why: 'champion' };
}

/**
 * Initiative for a finishing place: the tied value plus a hundredth per place above last
 * @param {Bracket} bracket - The bracket
 * @param {number} place - Zero-based finishing place
 * @returns {number} The new initiative
 */
export function initiativeFor(bracket, place) {
  return Math.round((bracket.base + (bracket.count - 1 - place) / 100) * 1e6) / 1e6;
}
