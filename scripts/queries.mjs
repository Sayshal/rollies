/**
 * Query handlers the GM uses to drive every client's knockout overlay
 * @module queries
 */

import { MODULE } from './config.mjs';
import { KnockoutOverlay } from './dialogs/knockout-overlay.mjs';

/**
 * Register query handlers for inter-client communication
 */
export function registerQueries() {
  CONFIG.queries[`${MODULE.ID}.knockoutState`] = handleKnockoutState;
  CONFIG.queries[`${MODULE.ID}.knockoutRoll`] = handleKnockoutRoll;
}

/**
 * Show the latest bracket state
 * @param {object} bracket - Bracket state from the GM
 * @returns {Promise<{acknowledged: boolean}>} Acknowledgment
 */
async function handleKnockoutState(bracket) {
  KnockoutOverlay.show(bracket);
  return { acknowledged: true };
}

/**
 * Ask this client to roll for one of its combatants
 * @param {object} queryData - Query data
 * @param {object} queryData.bracket - Bracket state from the GM
 * @param {number} queryData.entrant - Entrant index to roll for
 * @returns {Promise<{roll: object, total: number}>} The serialized roll and its total
 */
async function handleKnockoutRoll({ bracket, entrant }) {
  return KnockoutOverlay.show(bracket).requestRoll(entrant);
}
