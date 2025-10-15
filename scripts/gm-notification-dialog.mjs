const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
import { RolloffManager } from './rolloff-manager.mjs';

/**
 * Dialog to notify GM of initiative ties when auto-rolloff is disabled
 */
export class GMNotificationDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'rollies-gm-notification',
    classes: ['rollies-dialog', 'rollies-gm-notification'],
    tag: 'form',
    position: { width: 400, height: 'auto' },
    window: { resizable: false },
    actions: {
      startRolloffs: GMNotificationDialog._onStartRolloffs,
      keepInitiative: GMNotificationDialog._onKeepInitiative
    }
  };

  static PARTS = {
    form: {
      template: 'modules/rollies/templates/gm-notification.hbs'
    }
  };

  constructor(combat, tieGroups) {
    super();
    this.combat = combat;
    this.tieGroups = tieGroups;
  }

  get title() {
    return game.i18n.localize('Rollies.GMDialog.Title');
  }

  async _prepareContext() {
    const tieData = this.tieGroups.map((group) => ({
      initiative: group[0].initiative,
      combatants: group.map((c) => ({
        name: c.name,
        img: c.img || c.actor?.img || 'icons/svg/mystery-man.svg'
      }))
    }));

    return {
      ties: tieData,
      totalTies: this.tieGroups.length,
      totalCombatants: this.tieGroups.reduce((sum, group) => sum + group.length, 0)
    };
  }

  static async _onStartRolloffs(event, target) {
    const appId = target.closest('[data-application-id]')?.dataset?.applicationId;
    if (!appId) return;

    const app = foundry.applications.instances.get(appId);
    if (app instanceof GMNotificationDialog) {
      RolloffManager.manuallyStartRolloffs(app.combat, app.tieGroups);
      app.close();
    }
  }

  static _onKeepInitiative(event, target) {
    const appId = target.closest('[data-application-id]')?.dataset?.applicationId;
    if (!appId) return;

    const app = foundry.applications.instances.get(appId);
    if (app instanceof GMNotificationDialog) {
      app.close();
    }
  }
}
