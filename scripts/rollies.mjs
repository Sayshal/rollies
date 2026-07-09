/**
 * Main Rollies module initialization
 * @module rollies
 */

import { registerQueries } from './queries.mjs';
import { RolloffManager } from './rolloff-manager.mjs';
import { registerSettings } from './settings.mjs';

/**
 * Initialize the Rollies module on Foundry's init hook
 * Registers settings and initializes the rolloff manager
 */
Hooks.once('init', () => {
  ATLAS.register('rollies', { title: 'Rollies', github: 'Sayshal/rollies' });
  registerSettings();
  RolloffManager.initialize();
});

/**
 * Finalize module setup on Foundry's ready hook
 * Registers query handlers for inter-client communication
 */
Hooks.once('ready', () => {
  registerQueries();
});
