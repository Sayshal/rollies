import { ROLLIES_CONFIG } from './config.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Simple dialog for a player to make their rolloff roll
 */
export class PlayerRollDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'rollies-player-roll-dialog',
    classes: ['rollies-dialog', 'rollies-player-roll'],
    tag: 'form',
    position: { width: 400, height: 'auto' },
    window: { resizable: false, minimizable: false },
    actions: {
      roll: PlayerRollDialog._onRoll,
      close: PlayerRollDialog._onClose
    }
  };

  static PARTS = {
    form: {
      template: 'modules/rollies/templates/player-roll-dialog.hbs'
    }
  };

  constructor(combatant, dieType, rolloffId, resolveCallback, rejectCallback) {
    super();
    console.log('Rollies | PlayerRollDialog constructor called', { combatant: combatant.name, dieType, rolloffId });
    this.combatant = combatant;
    this.dieType = dieType;
    this.rolloffId = rolloffId;
    this.resolveCallback = resolveCallback;
    this.rejectCallback = rejectCallback;
    this.hasRolled = false;
    this.isClosed = false;

    const timeoutSeconds = game.settings.get(ROLLIES_CONFIG.moduleId, ROLLIES_CONFIG.settings.rolloffTimeout);
    this.timeoutId = setTimeout(() => {
      console.log('Rollies | PlayerRollDialog timeout triggered');
      this._handleTimeout();
    }, timeoutSeconds * 1000);
    console.log(`Rollies | PlayerRollDialog will timeout in ${timeoutSeconds} seconds`);
  }

  get title() {
    return game.i18n.localize('Rollies.PlayerDialog.Title');
  }

  async _prepareContext() {
    console.log('Rollies | PlayerRollDialog _prepareContext');
    return {
      combatant: {
        name: this.combatant.name,
        img: this.combatant.img || this.combatant.actor?.img || 'icons/svg/mystery-man.svg'
      },
      dieType: this.dieType,
      hasRolled: this.hasRolled,
      timeout: game.settings.get(ROLLIES_CONFIG.moduleId, ROLLIES_CONFIG.settings.rolloffTimeout),
      rolloffId: this.rolloffId
    };
  }

  static async _onRoll(event, target) {
    console.log('Rollies | PlayerRollDialog roll button clicked');
    const appId = target.closest('[data-application-id]')?.dataset?.applicationId;
    if (!appId) {
      console.error('Rollies | Could not find application ID');
      return;
    }

    const app = foundry.applications.instances.get(appId);
    if (app instanceof PlayerRollDialog) {
      await app._performRoll();
    } else {
      console.error('Rollies | Application instance not found or wrong type');
    }
  }

  static _onClose(event, target) {
    console.log('Rollies | PlayerRollDialog close button clicked');
    const appId = target.closest('[data-application-id]')?.dataset?.applicationId;
    if (!appId) {
      console.error('Rollies | Could not find application ID');
      return;
    }

    const app = foundry.applications.instances.get(appId);
    if (app instanceof PlayerRollDialog) {
      app._cleanup(new Error('Dialog closed by user'));
      app.close();
    }
  }

  async _performRoll() {
    console.log('Rollies | _performRoll called', {
      hasRolled: this.hasRolled,
      combatant: this.combatant.name,
      rolloffId: this.rolloffId
    });

    if (this.hasRolled || this.isClosed) {
      console.log('Rollies | Already rolled or closed, ignoring');
      return;
    }

    console.log('Rollies | Performing roll for', this.combatant.name);
    this.hasRolled = true;

    const roll = await new Roll(`1${this.dieType}`).evaluate();
    console.log('Rollies | Roll result:', roll.total);

    await this._createRollChatMessage(roll);
    await this.render();

    setTimeout(() => {
      if (!this.isClosed) {
        this._cleanup();
        this.resolveCallback({
          roll: roll,
          total: roll.total
        });
        this.close();
      }
    }, 1500);
  }

  async _handleTimeout() {
    console.log('Rollies | _handleTimeout called', {
      hasRolled: this.hasRolled,
      combatant: this.combatant.name,
      rolloffId: this.rolloffId
    });

    if (this.hasRolled || this.isClosed) {
      console.log('Rollies | Timeout triggered but already rolled or closed');
      return;
    }

    console.log('Rollies | Timeout - auto-rolling for', this.combatant.name);
    const roll = await new Roll(`1${this.dieType}`).evaluate();
    console.log('Rollies | Auto-roll result:', roll.total);

    await this._createRollChatMessage(roll, true);
    this._cleanup();
    this.resolveCallback({
      roll: roll,
      total: roll.total
    });
    this.close();
  }

  async _createRollChatMessage(roll, isAuto = false) {
    const autoText = isAuto ? ` (${game.i18n.localize('Rollies.Chat.AutoRoll')})` : '';
    const content = `<div class="rollies-roll-message">
      <strong>${this.combatant.name}</strong> ${game.i18n.localize('Rollies.Chat.RolledFor')} ${game.i18n.localize('Rollies.Chat.Rolloff')}:
      ${roll.total}${autoText}
    </div>`;

    await ChatMessage.create({
      content: content,
      speaker: ChatMessage.getSpeaker({ actor: this.combatant.actor }),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      rolls: [roll]
    });
  }

  _cleanup(error = null) {
    console.log('Rollies | Cleaning up PlayerRollDialog');
    this.isClosed = true;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (error && this.rejectCallback) {
      this.rejectCallback(error);
    }
  }

  async close(options = {}) {
    this._cleanup();
    return super.close(options);
  }
}
