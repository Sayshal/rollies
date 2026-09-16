/**
 * Winner announcement dialog for rolloffs
 * @module dialogs/winner-announcement
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
 * @extends HandlebarsApplicationMixin(ApplicationV2)
 */
export class WinnerAnnouncementDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    id: 'rollies-winner-announcement',
    classes: ['rollies-dialog', 'rollies-winner'],
    tag: 'div',
    position: { width: 'auto', height: 'auto' },
    window: { resizable: false, minimizable: false, title: 'ROLLIES.WinnerDialog.Title', contentClasses: ['standard-form'] }
  };

  /** @inheritdoc */
  static PARTS = { content: { template: 'modules/rollies/templates/winner-announcement.hbs' }, footer: { template: 'templates/generic/form-footer.hbs' } };

  /**
   * Create a new WinnerAnnouncementDialog
   * @param {object} winner - Winner data object
   * @param {string} winner.name - Winner's name
   * @param {string} winner.img - Winner's image URL
   * @param {number} winner.initiative - Winner's new initiative value
   */
  constructor(winner) {
    super();
    this.winner = winner;
    this.autoCloseId = setTimeout(() => {
      if (this.rendered) this.close();
    }, 3000);
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.winner = { name: this.winner.name, img: this.winner.img, initiative: this.winner.initiative };
    context.buttons = [{ type: 'button', action: 'close', icon: 'fa-solid fa-xmark', label: 'ROLLIES.WinnerDialog.CloseButton' }];
    return context;
  }

  /** @inheritdoc */
  _onClose(options) {
    super._onClose(options);
    clearTimeout(this.autoCloseId);
  }
}
