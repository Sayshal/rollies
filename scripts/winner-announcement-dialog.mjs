const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog to announce rolloff winners
 */
export class WinnerAnnouncementDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'rollies-winner-announcement',
    classes: ['rollies-dialog', 'rollies-winner'],
    title: 'Rollies.WinnerDialog.Title',
    position: { width: 350, height: 200 },
    window: { resizable: false, minimizable: false }
  };

  static PARTS = {
    form: { template: 'modules/rollies/templates/winner-announcement.hbs' }
  };

  constructor(winner) {
    super();
    console.log('Rollies | WinnerAnnouncementDialog constructor called', winner);
    this.winner = winner;

    setTimeout(() => {
      if (this.rendered) this.close();
    }, 3000);
  }

  get title() {
    return game.i18n.localize('Rollies.WinnerDialog.Title');
  }

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

  static _onClose(event, target) {
    console.log('Rollies | WinnerAnnouncementDialog close button clicked');
    const instance = Array.from(foundry.applications.instances.values()).find((app) => app instanceof WinnerAnnouncementDialog);
    if (instance) instance.close();
  }
}
