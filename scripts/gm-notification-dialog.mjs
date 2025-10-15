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
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: 'rollies-gm-notification',
    classes: ['rollies-dialog', 'rollies-gm-notification'],
    tag: 'div',
    position: { width: 400, height: 'auto' },
    window: { resizable: false, title: 'Rollies.GMDialog.Title' },
    actions: { startRolloffs: GMNotificationDialog.#startRolloffs }
  };

  /**
   * Template parts configuration
   * @type {object}
   */
  static PARTS = { div: { template: 'modules/rollies/templates/gm-notification.hbs' } };

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

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.tieData = this.tieGroups.map((group) => ({ initiative: group[0].initiative, combatants: group.map((c) => ({ name: c.name, img: c.img || c.actor?.img })) }));
    context.totalTies = this.tieGroups.length;
    context.totalCombatants = this.tieGroups.reduce((sum, group) => sum + group.length, 0);
    return context;
  }

  /**
   * Handle start rolloffs button click
   * @param {Event} _event - The click event
   * @param {HTMLElement} _target - The clicked element
   * @private
   * @returns {Promise<void>}
   */
  static async #startRolloffs(_event, _target) {
    RolloffManager.manuallyStartRolloffs(this.combat, this.tieGroups);
    this.close();
  }
}
