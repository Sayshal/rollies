/**
 * Winner announcement dialog for rolloffs
 * @module winner-announcement-dialog
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Winner announcement context data
 * @typedef {object} WinnerContext
 * @property {object} winner - Winner display data
 * @property {string} winner.name - Winner's name
 * @property {string} winner.img - Winner's image URL
 * @property {number} winner.initiative - Winner's new initiative
 */

/**
 * Dialog to announce rolloff winners
 * @extends {HandlebarsApplicationMixin(ApplicationV2)}
 */
export class WinnerAnnouncementDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: 'rollies-winner-announcement',
    classes: ['rollies-dialog', 'rollies-winner'],
    tag: 'div',
    position: { width: 350, height: 200 },
    window: { resizable: false, minimizable: false, title: 'Rollies.WinnerDialog.Title' }
  };

  /**
   * Template parts configuration
   * @type {object}
   */
  static PARTS = { div: { template: 'modules/rollies/templates/winner-announcement.hbs' } };

  /**
   * Create a new WinnerAnnouncementDialog
   * @param {object} winner - Winner data object
   * @param {string} winner.name - Winner's name
   * @param {string} winner.img - Winner's image URL
   * @param {number} winner.initiative - Winner's new initiative value
   */
  constructor(winner) {
    super();
    console.log('Rollies | WinnerAnnouncementDialog constructor called', winner);
    this.winner = winner;
    setTimeout(() => {
      if (this.rendered) this.close();
    }, 3000);
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.winner = { name: this.winner.name, img: this.winner.img, initiative: this.winner.initiative };
    return context;
  }
}
