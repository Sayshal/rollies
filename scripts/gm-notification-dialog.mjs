/**
 * GM notification dialog for initiative ties
 * @module gm-notification-dialog
 */

import { RolloffManager } from './rolloff-manager.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Tie group display data
 * @typedef {object} TieGroupData
 * @property {number} initiative - The tied initiative value
 * @property {Array<object>} combatants - Array of combatant display data
 */

/**
 * GM notification dialog context
 * @typedef {object} GMNotificationContext
 * @property {Array<TieGroupData>} ties - Array of tie group data
 * @property {number} totalTies - Total number of tie groups
 * @property {number} totalCombatants - Total number of tied combatants
 */

/**
 * Dialog to notify GM of initiative ties when auto-rolloff is disabled
 * @extends {HandlebarsApplicationMixin(ApplicationV2)}
 */
export class GMNotificationDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * Default application options
   * @type {object}
   */
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

  /**
   * Template parts configuration
   * @type {object}
   */
  static PARTS = {
    form: {
      template: 'modules/rollies/templates/gm-notification.hbs'
    }
  };

  /**
   * Create a new GMNotificationDialog
   * @param {Combat} combat - The combat encounter with ties
   * @param {Array<Array<Combatant>>} tieGroups - Array of combatant groups that are tied
   */
  constructor(combat, tieGroups) {
    super();
    this.combat = combat;
    this.tieGroups = tieGroups;
  }

  /**
   * Get the localized title for this dialog
   * @returns {string} The dialog title
   */
  get title() {
    return game.i18n.localize('Rollies.GMDialog.Title');
  }

  /**
   * Prepare context data for template rendering
   * @returns {Promise<GMNotificationContext>} Context data for the template
   */
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

  /**
   * Handle start rolloffs button click
   * @param {Event} _event - The click event
   * @param {HTMLElement} _target - The clicked element
   * @returns {Promise<void>}
   */
  static async _onStartRolloffs(_event, _target) {
    const app = foundry.applications.instances.get('rollies-gm-notification');

    if (app instanceof GMNotificationDialog) {
      RolloffManager.manuallyStartRolloffs(app.combat, app.tieGroups);
      app.close();
    }
  }

  /**
   * Handle keep initiative button click
   * @param {Event} _event - The click event
   * @param {HTMLElement} _target - The clicked element
   */
  static _onKeepInitiative(_event, _target) {
    const app = foundry.applications.instances.get('rollies-gm-notification');

    if (app instanceof GMNotificationDialog) {
      app.close();
    }
  }
}
