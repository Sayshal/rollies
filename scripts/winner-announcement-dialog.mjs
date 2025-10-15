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
  /**
   * Default application options
   * @type {object}
   */
  static DEFAULT_OPTIONS = {
    id: 'rollies-winner-announcement',
    classes: ['rollies-dialog', 'rollies-winner'],
    tag: 'form',
    position: { width: 350, height: 200 },
    window: { resizable: false, minimizable: false },
    actions: {
      close: WinnerAnnouncementDialog._onClose
    }
  };

  /**
   * Template parts configuration
   * @type {object}
   */
  static PARTS = {
    form: {
      template: 'modules/rollies/templates/winner-announcement.hbs'
    }
  };

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

    // Auto-close after 3 seconds
    setTimeout(() => {
      if (this.rendered) this.close();
    }, 3000);
  }

  /**
   * Get the localized title for this dialog
   * @returns {string} The dialog title
   */
  get title() {
    return game.i18n.localize('Rollies.WinnerDialog.Title');
  }

  /**
   * Prepare context data for template rendering
   * @returns {Promise<WinnerContext>} Context data for the template
   */
  async _prepareContext() {
    console.log('Rollies | WinnerAnnouncementDialog _prepareContext', this.winner);
    return {
      winner: {
        name: this.winner.name,
        img: this.winner.img || 'icons/svg/mystery-man.svg',
        initiative: this.winner.initiative
      }
    };
  }

  /**
   * Handle close button click action
   * @param {Event} _event - The click event
   * @param {HTMLElement} _target - The clicked element
   */
  static _onClose(_event, _target) {
    console.log('Rollies | WinnerAnnouncementDialog close button clicked');
    const app = foundry.applications.instances.get('rollies-winner-announcement');

    if (app instanceof WinnerAnnouncementDialog) {
      app.close();
    }
  }
}
