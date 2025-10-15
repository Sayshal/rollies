import { ROLLIES_CONFIG } from './config.mjs';

/**
 * Register all module settings
 */
export function registerSettings() {
  game.settings.register(ROLLIES_CONFIG.moduleId, ROLLIES_CONFIG.settings.autoRolloff, {
    name: game.i18n.localize('Rollies.Settings.AutoRolloff.Name'),
    hint: game.i18n.localize('Rollies.Settings.AutoRolloff.Hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(ROLLIES_CONFIG.moduleId, ROLLIES_CONFIG.settings.rolloffDie, {
    name: game.i18n.localize('Rollies.Settings.RolloffDie.Name'),
    hint: game.i18n.localize('Rollies.Settings.RolloffDie.Hint'),
    scope: 'world',
    config: true,
    type: String,
    choices: {
      d4: 'd4',
      d6: 'd6',
      d8: 'd8',
      d10: 'd10',
      d12: 'd12',
      d20: 'd20'
    },
    default: 'd20'
  });

  game.settings.register(ROLLIES_CONFIG.moduleId, ROLLIES_CONFIG.settings.includeNPCs, {
    name: game.i18n.localize('Rollies.Settings.IncludeNPCs.Name'),
    hint: game.i18n.localize('Rollies.Settings.IncludeNPCs.Hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(ROLLIES_CONFIG.moduleId, ROLLIES_CONFIG.settings.rolloffTimeout, {
    name: game.i18n.localize('Rollies.Settings.RolloffTimeout.Name'),
    hint: game.i18n.localize('Rollies.Settings.RolloffTimeout.Hint'),
    scope: 'world',
    config: true,
    type: Number,
    default: 30,
    range: { min: 3, max: 60, step: 1 }
  });

  game.settings.register(ROLLIES_CONFIG.moduleId, ROLLIES_CONFIG.settings.showWinnerAnnouncement, {
    name: game.i18n.localize('Rollies.Settings.ShowWinnerAnnouncement.Name'),
    hint: game.i18n.localize('Rollies.Settings.ShowWinnerAnnouncement.Hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });
}
