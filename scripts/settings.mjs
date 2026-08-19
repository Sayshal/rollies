/**
 * Module settings registration and management
 * @module settings
 */

import { MODULE, getDieTypes } from './config.mjs';

/**
 * Register all module settings with Foundry VTT
 * Configures world-level settings for rolloff behavior
 */
export function registerSettings() {
  game.settings.register(MODULE.ID, MODULE.SETTINGS.AUTO_ROLLOFF, {
    name: 'ROLLIES.Settings.AutoRolloff.Name',
    hint: 'ROLLIES.Settings.AutoRolloff.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, MODULE.SETTINGS.ROLLOFF_DIE, {
    name: 'ROLLIES.Settings.RolloffDie.Name',
    hint: 'ROLLIES.Settings.RolloffDie.Hint',
    scope: 'world',
    config: true,
    type: String,
    choices: getDieTypes(),
    default: 'd20'
  });

  game.settings.register(MODULE.ID, MODULE.SETTINGS.INCLUDE_NPCS, {
    name: 'ROLLIES.Settings.IncludeNPCs.Name',
    hint: 'ROLLIES.Settings.IncludeNPCs.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE.ID, MODULE.SETTINGS.ROLLOFF_TIMEOUT, {
    name: 'ROLLIES.Settings.RolloffTimeout.Name',
    hint: 'ROLLIES.Settings.RolloffTimeout.Hint',
    scope: 'world',
    config: true,
    type: Number,
    default: 30,
    range: { min: 3, max: 60, step: 1 }
  });

  game.settings.register(MODULE.ID, MODULE.SETTINGS.SHOW_WINNER_ANNOUNCEMENT, {
    name: 'ROLLIES.Settings.ShowWinnerAnnouncement.Name',
    hint: 'ROLLIES.Settings.ShowWinnerAnnouncement.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, MODULE.SETTINGS.MANUAL_DICE_TIMEOUT_MULTIPLIER, {
    name: 'ROLLIES.Settings.ManualDiceTimeoutMultiplier.Name',
    hint: 'ROLLIES.Settings.ManualDiceTimeoutMultiplier.Hint',
    scope: 'world',
    config: true,
    type: Number,
    default: 2,
    range: { min: 1, max: 5, step: 0.5 }
  });
}
