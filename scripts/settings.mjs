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
    name: game.i18n.localize('Rollies.Settings.AutoRolloff.Name'),
    hint: game.i18n.localize('Rollies.Settings.AutoRolloff.Hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE.ID, MODULE.SETTINGS.ROLLOFF_DIE, {
    name: game.i18n.localize('Rollies.Settings.RolloffDie.Name'),
    hint: game.i18n.localize('Rollies.Settings.RolloffDie.Hint'),
    scope: 'world',
    config: true,
    type: String,
    choices: getDieTypes(),
    default: 'd20'
  });

  game.settings.register(MODULE.ID, MODULE.SETTINGS.INCLUDE_NPCS, {
    name: game.i18n.localize('Rollies.Settings.IncludeNPCs.Name'),
    hint: game.i18n.localize('Rollies.Settings.IncludeNPCs.Hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE.ID, MODULE.SETTINGS.ROLLOFF_TIMEOUT, {
    name: game.i18n.localize('Rollies.Settings.RolloffTimeout.Name'),
    hint: game.i18n.localize('Rollies.Settings.RolloffTimeout.Hint'),
    scope: 'world',
    config: true,
    type: Number,
    default: 30,
    range: { min: 3, max: 60, step: 1 }
  });

  game.settings.register(MODULE.ID, MODULE.SETTINGS.SHOW_WINNER_ANNOUNCEMENT, {
    name: game.i18n.localize('Rollies.Settings.ShowWinnerAnnouncement.Name'),
    hint: game.i18n.localize('Rollies.Settings.ShowWinnerAnnouncement.Hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });
}
