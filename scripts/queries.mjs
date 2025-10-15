/**
 * Query handler registration for inter-client communication
 * @module queries
 */

import { MODULE } from './config.mjs';
import { PlayerRollDialog } from './dialogs/player-roll.mjs';
import { BracketTournamentDialog } from './dialogs/bracket-tournament.mjs';
import { WinnerAnnouncementDialog } from './dialogs/winner-announcement.mjs';

/**
 * Query data for roll requests
 * @typedef {object} RollRequestQuery
 * @property {string} combatantId - The ID of the combatant rolling
 * @property {string} dieType - The type of die to roll (e.g., 'd20')
 * @property {string} rolloffId - Unique identifier for this rolloff
 * @property {string} mode - Rolloff mode: 'solo', 'pair', or 'bracket'
 * @property {Array<object>} [opponents] - Opponent data for pair mode
 * @property {object} [bracket] - Bracket structure for bracket mode
 */

/**
 * Query data for roll updates
 * @typedef {object} RollUpdateQuery
 * @property {string} rolloffId - The rolloff this update belongs to
 * @property {string} combatantId - The combatant who rolled
 * @property {number} total - The roll result
 * @property {string} name - The combatant's name
 * @property {string} img - The combatant's image
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
 * @property {string} [tournamentId] - Tournament ID if from bracket
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

// Store active bracket dialogs per user
const activeBracketDialogs = new Map();

/**
 * Register query handlers for inter-client communication
 * Sets up handlers for roll requests and winner announcements
 */
export function registerQueries() {
  console.log(`${MODULE.ID} | Registering queries`);
  CONFIG.queries[`${MODULE.ID}.requestRoll`] = handleRollRequest;
  CONFIG.queries[`${MODULE.ID}.createBracketDialog`] = handleCreateBracketDialog;
  CONFIG.queries[`${MODULE.ID}.activateMatch`] = handleActivateMatch;
  CONFIG.queries[`${MODULE.ID}.showWinner`] = handleShowWinner;
  CONFIG.queries[`${MODULE.ID}.rollUpdate`] = handleRollUpdate;
  CONFIG.queries[`${MODULE.ID}.matchComplete`] = handleMatchComplete;
}

/**
 * Handle incoming roll request from GM (pair/solo modes only)
 * @param {RollRequestQuery} queryData - The query data containing roll request information
 * @param {QueryOptions} options - Query options including timeout
 * @returns {Promise<RollResult>} The roll result
 * @throws {Error} If combatant not found or user lacks permission
 */
async function handleRollRequest(queryData, { timeout }) {
  console.log(`${MODULE.ID} | Received roll request:`, queryData);
  const { combatantId, dieType, rolloffId, mode, opponents } = queryData;
  const combatant = game.combat?.combatants?.get(combatantId);
  if (!combatant) throw new Error(`Combatant ${combatantId} not found`);
  if (!game.user.isGM && !combatant.isOwner) throw new Error(`User ${game.user.name} cannot roll for ${combatant.name}`);
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Query timeout exceeded')), timeout);
  });
  const result = await Promise.race([showRollDialog(combatant, dieType, rolloffId, timeout, mode, opponents), timeoutPromise]);
  return { combatantId, rolloffId, roll: result.roll.toJSON(), total: result.total };
}

/**
 * Handle request to create a bracket tournament dialog
 * @param {object} queryData - Query data
 * @param {string} queryData.combatantId - Combatant ID
 * @param {string} queryData.tournamentId - Tournament ID
 * @param {object} queryData.bracket - Bracket structure
 * @param {QueryOptions} _options - Query options
 * @returns {Promise<object>} Acknowledgment
 */
async function handleCreateBracketDialog(queryData, _options) {
  console.log(`${MODULE.ID} | Creating bracket dialog:`, queryData);
  const { combatantId, tournamentId, bracket } = queryData;
  const combatant = game.combat?.combatants?.get(combatantId);
  if (!combatant) throw new Error(`Combatant ${combatantId} not found`);
  const dieType = game.settings.get(MODULE.ID, MODULE.SETTINGS.ROLLOFF_DIE);
  const dialog = new BracketTournamentDialog(combatant, dieType, tournamentId, bracket);
  activeBracketDialogs.set(tournamentId, dialog);
  dialog.render(true);
  return { acknowledged: true };
}

/**
 * Handle request to activate a match in the bracket dialog
 * @param {object} queryData - Query data
 * @param {string} queryData.matchId - Match ID
 * @param {string} queryData.tournamentId - Tournament ID
 * @param {QueryOptions} options - Query options
 * @returns {Promise<RollResult>} The roll result
 */
async function handleActivateMatch(queryData) {
  console.log(`${MODULE.ID} | Activating match:`, queryData);
  const { matchId, tournamentId } = queryData;
  const dialog = activeBracketDialogs.get(tournamentId);
  if (!dialog) throw new Error(`No active bracket dialog for tournament ${tournamentId}`);
  console.log(`${MODULE.ID} | 📍 Found dialog, calling activateMatch`);
  return new Promise((resolve, reject) => {
    dialog.activateMatch(matchId, resolve, reject);
    console.log(`${MODULE.ID} | ✅ Match activated, waiting for player roll`);
  });
}

/**
 * Handle incoming winner announcement request
 * @param {ShowWinnerQuery} queryData - The query data containing winner information
 * @param {QueryOptions} options - Query options including timeout
 * @returns {Promise<object>} Acknowledgment response
 */
async function handleShowWinner(queryData, { timeout }) {
  const { winner } = queryData;
  if (winner.tournamentId) {
    Hooks.call(`${MODULE.ID}.winnerAnnounced`, { tournamentId: winner.tournamentId });
    if (activeBracketDialogs.has(winner.tournamentId)) activeBracketDialogs.delete(winner.tournamentId);
  }
  const showAnnouncement = game.settings.get(MODULE.ID, MODULE.SETTINGS.SHOW_WINNER_ANNOUNCEMENT);
  if (showAnnouncement) {
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
 * Handle incoming roll update broadcast
 * @param {RollUpdateQuery} queryData - The query data containing roll update
 * @param {QueryOptions} _options - Query options
 * @returns {Promise<object>} Acknowledgment response
 */
async function handleRollUpdate(queryData, _options) {
  console.log(`${MODULE.ID} | 📨 handleRollUpdate received by ${game.user.name}:`, queryData);
  Hooks.call(`${MODULE.ID}.rollUpdate`, queryData);
  console.log(`${MODULE.ID} | 🎣 Hooks.call result: true`);
  return { acknowledged: true };
}

/**
 * Handle incoming match complete broadcast
 * @param {object} queryData - Match completion data
 * @param {QueryOptions} _options - Query options
 * @returns {Promise<object>} Acknowledgment response
 */
async function handleMatchComplete(queryData, _options) {
  console.log(`${MODULE.ID} | 📨 handleMatchComplete received:`, queryData);
  Hooks.call(`${MODULE.ID}.matchComplete`, queryData);
  return { acknowledged: true };
}

/**
 * Show roll dialog to player (pair/solo modes)
 * @param {Combatant} combatant - The combatant performing the roll
 * @param {string} dieType - Type of die to roll
 * @param {string} rolloffId - Unique rolloff identifier
 * @param {number} timeout - Maximum time to wait for roll in milliseconds
 * @param {string} mode - Rolloff mode
 * @param {Array<object>} opponents - Opponent data
 * @returns {Promise<object>} Promise that resolves with roll result
 */
async function showRollDialog(combatant, dieType, rolloffId, timeout, mode = 'solo', opponents = null) {
  return new Promise((resolve, reject) => {
    console.log(`${MODULE.ID} | Creating PlayerRollDialog with timeout: ${timeout}ms`);
    const dialog = new PlayerRollDialog(combatant, dieType, rolloffId, resolve, reject, mode, opponents);
    dialog.render(true);
  });
}
