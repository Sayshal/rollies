/**
 * Main Rollies module initialization
 * @module rollies
 */

import { RolloffManager } from './rolloff-manager.mjs';
import { registerSettings } from './settings.mjs';
import { registerQueries } from './queries.mjs';
import { MODULE } from './config.mjs';

/**
 * Initialize the Rollies module on Foundry's init hook
 * Registers settings and initializes the rolloff manager
 */
Hooks.once('init', () => {
  registerSettings();
  RolloffManager.initialize();
  console.log(`${MODULE.ID} | Initialized`);
});

/**
 * Finalize module setup on Foundry's ready hook
 * Registers query handlers for inter-client communication
 */
Hooks.once('ready', () => {
  registerQueries();
  console.log(`${MODULE.ID} | Module ready`);
});
