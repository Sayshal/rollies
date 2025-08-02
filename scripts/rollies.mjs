import { RolloffManager } from './rolloff-manager.mjs';
import { registerSettings } from './settings.mjs';
import { registerQueries } from './queries.mjs';
import { ROLLIES_CONFIG } from './config.mjs';

/**
 * Main Rollies module initialization
 */
Hooks.once('init', () => {
  console.log('Rollies | Initializing module');
  registerSettings();
  RolloffManager.initialize();
});

Hooks.once('ready', () => {
  console.log('Rollies | Module ready');
  registerQueries();
});
