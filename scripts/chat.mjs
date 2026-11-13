/**
 * Chat cards for rolloff rolls and results
 * @module chat
 */

import { initiativeFor } from './bracket.mjs';

/**
 * Whisper targets for a card about hidden combatants, or undefined for a public card
 * @param {boolean} hidden - Whether any combatant on the card is hidden
 * @returns {Array<User>|undefined} GM recipients when hidden
 */
function whisperFor(hidden) {
  return hidden ? ChatMessage.getWhisperRecipients('GM') : undefined;
}

/**
 * Post a rolloff roll so Dice So Nice and the chat log show it
 * @param {object} entrant - Bracket entrant
 * @param {Combatant|undefined} combatant - The combatant, when it still exists
 * @param {Roll} roll - The evaluated roll
 * @param {boolean} [isAuto] - Whether the roll was made automatically
 * @returns {Promise<ChatMessage>} The created message
 */
export async function createRollMessage(entrant, combatant, roll, isAuto = false) {
  const autoText = isAuto ? ` (${_loc('ROLLIES.Chat.AutoRoll')})` : '';
  const name = foundry.utils.escapeHTML(entrant.name);
  const content = `<div class="rollies-roll-message"><strong>${name}</strong> ${_loc('ROLLIES.Chat.RolledFor')} ${_loc('ROLLIES.Chat.Rolloff')}: ${roll.total}${autoText}</div>`;
  const speaker = combatant ? ChatMessage.getSpeaker({ actor: combatant.actor, token: combatant.token, alias: entrant.name }) : { alias: entrant.name };
  const message = await ChatMessage.create({ content, speaker, style: CONST.CHAT_MESSAGE_STYLES.OTHER, rolls: [roll], whisper: whisperFor(entrant.hidden) });
  // Hold the result until the 3D dice settle; capped so a throttled tab stays inside the GM's query slack
  if (game.dice3d) await Promise.race([game.dice3d.waitFor3DAnimationByMessageID(message.id), new Promise((resolve) => setTimeout(resolve, 4000))]);
  return message;
}

/**
 * Post the final order of a decided bracket
 * @param {object} bracket - The decided bracket
 * @returns {Promise<ChatMessage>} The created message
 */
export async function createResultsMessage(bracket) {
  const rows = bracket.places
    .map((place, i) => {
      const entrant = bracket.entrants[place.c];
      return `<li><span class="name">${foundry.utils.escapeHTML(entrant.name)}</span><span class="init">${initiativeFor(bracket, i)}</span></li>`;
    })
    .join('');
  const content = `<div class="rollies-results-message"><h3>${_loc('ROLLIES.Chat.Results')}</h3><ol>${rows}</ol></div>`;
  return ChatMessage.create({ content, speaker: { alias: _loc('ROLLIES.Chat.Speaker') }, style: CONST.CHAT_MESSAGE_STYLES.OTHER, whisper: whisperFor(bracket.entrants.some((e) => e.hidden)) });
}
