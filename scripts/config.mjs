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
    SHOW_WINNER_ANNOUNCEMENT: 'showWinnerAnnouncement',
    MANUAL_DICE_TIMEOUT_MULTIPLIER: 'manualDiceTimeoutMultiplier'
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

/**
 * Check if the current user has interactive/manual dice fulfillment configured
 * @returns {boolean} True if user has manual or interactive dice configured
 */
export function hasInteractiveDice() {
  const clientSettings = game.settings.storage?.get('client');
  const diceConfig = clientSettings?.getItem('core.diceConfiguration');
  if (!diceConfig) return false;

  let configObj;
  try {
    configObj = typeof diceConfig === 'string' ? JSON.parse(diceConfig) : diceConfig;
  } catch (e) {
    return false;
  }

  const allMethods = CONFIG.Dice?.fulfillment?.methods;
  if (!allMethods) return false;

  for (const method of Object.values(configObj)) {
    if (!method) continue;
    if (method === 'manual') return true;
    if (method !== 'random') {
      const methodConfig = allMethods[method];
      if (methodConfig?.interactive) return true;
    }
  }

  return false;
}
