/**
 * Query handler registration for inter-client communication
 * @module queries
 */

import { MODULE } from './config.mjs';
import { PlayerRollDialog } from './player-roll-dialog.mjs';
import { WinnerAnnouncementDialog } from './winner-announcement-dialog.mjs';

/**
 * Query data for roll requests
 * @typedef {object} RollRequestQuery
 * @property {string} combatantId - The ID of the combatant rolling
 * @property {string} dieType - The type of die to roll (e.g., 'd20')
 * @property {string} rolloffId - Unique identifier for this rolloff
 */

/**
 * Query data for winner announcements
 * @typedef {object} ShowWinnerQuery
 * @property {WinnerData} winner - Data about the rolloff winner
 */

/**
 * Winner data structure
 * @typedef {object} WinnerData
 * @property {string} name - Name of the winner
 * @property {string} img - Image URL for the winner
 * @property {number} initiative - New initiative value
 */

/**
 * Roll result response
 * @typedef {object} RollResult
 * @property {string} combatantId - ID of the combatant who rolled
 * @property {string} rolloffId - ID of the rolloff
 * @property {object} roll - Serialized Roll object
 * @property {number} total - Total value of the roll
 */

/**
 * Query options object
 * @typedef {object} QueryOptions
 * @property {number} timeout - Timeout duration in milliseconds
 */

/**
 * Register query handlers for inter-client communication
 * Sets up handlers for roll requests and winner announcements
 */
export function registerQueries() {
  console.log(`${MODULE.ID} | Registering queries`);
  CONFIG.queries[`${MODULE.ID}.requestRoll`] = handleRollRequest;
  CONFIG.queries[`${MODULE.ID}.showWinner`] = handleShowWinner;
}

/**
 * Handle incoming roll request from GM
 * @param {RollRequestQuery} queryData - The query data containing roll request information
 * @param {QueryOptions} options - Query options including timeout
 * @returns {Promise<RollResult>} The roll result
 * @throws {Error} If combatant not found or user lacks permission
 */
async function handleRollRequest(queryData, { timeout }) {
  console.log(`${MODULE.ID} | Received roll request:`, queryData);
  const { combatantId, dieType, rolloffId } = queryData;
  const combatant = game.combat?.combatants?.get(combatantId);

  if (!combatant) {
    throw new Error(`Combatant ${combatantId} not found`);
  }

  if (!game.user.isGM && !combatant.isOwner) {
    throw new Error(`User ${game.user.name} cannot roll for ${combatant.name}`);
  }

  console.log(`${MODULE.ID} | Showing roll dialog for`, combatant.name);

  // Create a promise that will reject if the timeout is exceeded
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Query timeout exceeded')), timeout);
  });

  // Race between the dialog response and the timeout
  const result = await Promise.race([showRollDialog(combatant, dieType, rolloffId, timeout), timeoutPromise]);

  console.log(`${MODULE.ID} | Roll result:`, result);

  return {
    combatantId,
    rolloffId,
    roll: result.roll.toJSON(),
    total: result.total
  };
}

/**
 * Handle incoming winner announcement request
 * @param {ShowWinnerQuery} queryData - The query data containing winner information
 * @param {QueryOptions} options - Query options including timeout
 * @returns {Promise<object>} Acknowledgment response
 */
async function handleShowWinner(queryData, { timeout }) {
  const { winner } = queryData;
  const showAnnouncement = game.settings.get(MODULE.ID, MODULE.SETTINGS.SHOW_WINNER_ANNOUNCEMENT);

  if (showAnnouncement) {
    // Use timeout to ensure we don't hang indefinitely
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        console.warn(`${MODULE.ID} | Winner announcement dialog timed out`);
        resolve({ acknowledged: true, timedOut: true });
      }, timeout);
    });

    const showDialogPromise = (async () => {
      const dialog = new WinnerAnnouncementDialog(winner);
      dialog.render(true);
      return { acknowledged: true };
    })();

    return await Promise.race([showDialogPromise, timeoutPromise]);
  }

  return { acknowledged: true };
}

/**
 * Show roll dialog to player
 * @param {Combatant} combatant - The combatant performing the roll
 * @param {string} dieType - Type of die to roll
 * @param {string} rolloffId - Unique rolloff identifier
 * @param {number} timeout - Maximum time to wait for roll in milliseconds
 * @returns {Promise<object>} Promise that resolves with roll result
 */
async function showRollDialog(combatant, dieType, rolloffId, timeout) {
  return new Promise((resolve, reject) => {
    console.log(`${MODULE.ID} | Creating PlayerRollDialog with timeout: ${timeout}ms`);
    const dialog = new PlayerRollDialog(combatant, dieType, rolloffId, resolve, reject);
    dialog.render(true);
  });
}
