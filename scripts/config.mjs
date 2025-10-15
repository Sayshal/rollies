/**
 * Configuration constants for the Rollies module
 * @module config
 */

/**
 * Main module configuration object
 * @typedef {object} ModuleConfig
 * @property {string} ID - The module identifier
 * @property {SettingsConfig} SETTINGS - Settings configuration keys
 */

/**
 * Settings configuration keys
 * @typedef {object} SettingsConfig
 * @property {string} AUTO_ROLLOFF - Auto-trigger rolloffs setting key
 * @property {string} ROLLOFF_DIE - Rolloff die type setting key
 * @property {string} INCLUDE_NPCS - Include NPCs setting key
 * @property {string} ROLLOFF_TIMEOUT - Rolloff timeout setting key
 * @property {string} SHOW_WINNER_ANNOUNCEMENT - Show winner announcement setting key
 */

/**
 * Module configuration constants
 * @type {ModuleConfig}
 */
export const MODULE = {
  ID: 'rollies',
  SETTINGS: {
    AUTO_ROLLOFF: 'autoRolloff',
    ROLLOFF_DIE: 'rolloffDie',
    INCLUDE_NPCS: 'includeNPCs',
    ROLLOFF_TIMEOUT: 'rolloffTimeout',
    SHOW_WINNER_ANNOUNCEMENT: 'showWinnerAnnouncement'
  }
};

/**
 * Get available die types from Foundry's dice configuration
 * @returns {object} Object containing die type labels keyed by die denomination
 */
export function getDieTypes() {
  const dieTypes = {};
  const availableDice = CONFIG.Dice?.fulfillment?.dice;
  for (const [key, value] of Object.entries(availableDice)) dieTypes[key] = value.label;
  return dieTypes;
}
