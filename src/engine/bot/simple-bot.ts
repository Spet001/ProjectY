import {
  YGOProMsgResponseBase,
  YGOProMsgSelectIdleCmd,
  YGOProMsgSelectBattleCmd,
  YGOProMsgSelectChain,
  YGOProMsgSelectCard,
  YGOProMsgSelectTribute,
  YGOProMsgSelectSum,
  YGOProMsgSelectUnselectCard,
  YGOProMsgSelectPosition,
  YGOProMsgSelectOption,
  YGOProMsgSelectYesNo,
  YGOProMsgSelectEffectYn,
  YGOProMsgSelectPlace,
  YGOProMsgSelectDisField,
  YGOProMsgRockPaperScissors,
  YGOProMsgAnnounceNumber,
  YGOProMsgAnnounceAttrib,
  YGOProMsgAnnounceRace,
  YGOProMsgAnnounceCard,
  YGOProMsgSortCard,
  IdleCmdType,
  BattleCmdType,
  IndexResponse,
} from 'ygopro-msg-encode';
import { POS } from '../constants';
import type { CardDatabase } from '../card-database';

export class SimpleBot {
  private turnSets = 0;
  private currentTurn = -1;

  constructor(public playerIndex: number, public cardDb?: CardDatabase) {}

  resetTurn(turn: number) {
    if (this.currentTurn !== turn) {
      this.currentTurn = turn;
      this.turnSets = 0;
    }
  }

  /**
   * Generates a response Uint8Array for any prompt message sent to this bot.
   */
  decide(msg: YGOProMsgResponseBase, currentTurn?: number): Uint8Array {
    if (currentTurn !== undefined) {
      this.resetTurn(currentTurn);
    }

    if (msg instanceof YGOProMsgSelectIdleCmd) {
      return this.handleIdleCmd(msg);
    }
    if (msg instanceof YGOProMsgSelectBattleCmd) {
      return this.handleBattleCmd(msg);
    }
    if (msg instanceof YGOProMsgSelectChain) {
      return this.handleChain(msg);
    }
    if (msg instanceof YGOProMsgSelectCard) {
      return this.handleSelectCard(msg);
    }
    if (msg instanceof YGOProMsgSelectTribute) {
      return this.handleSelectTribute(msg);
    }
    if (msg instanceof YGOProMsgSelectSum) {
      return this.handleSelectSum(msg);
    }
    if (msg instanceof YGOProMsgSelectUnselectCard) {
      return this.handleSelectUnselect(msg);
    }
    if (msg instanceof YGOProMsgSelectPosition) {
      return this.handleSelectPosition(msg);
    }
    if (msg instanceof YGOProMsgSelectOption) {
      return msg.prepareResponse(0);
    }
    if (msg instanceof YGOProMsgSelectYesNo || msg instanceof YGOProMsgSelectEffectYn) {
      // By default agree to trigger advantageous effects
      return msg.prepareResponse(true);
    }
    if (msg instanceof YGOProMsgSelectPlace || msg instanceof YGOProMsgSelectDisField) {
      return this.handleSelectPlace(msg);
    }
    if (msg instanceof YGOProMsgRockPaperScissors) {
      return msg.prepareResponse(1); // 1 = Scissors, 2 = Rock, 3 = Paper
    }
    if (msg instanceof YGOProMsgAnnounceNumber) {
      return msg.prepareResponse(0);
    }
    if (msg instanceof YGOProMsgAnnounceAttrib) {
      // Pick first available attribute bit
      let attr = 1;
      while ((msg.availableAttributes & attr) === 0 && attr < 0x80) {
        attr <<= 1;
      }
      return msg.prepareResponse(attr);
    }
    if (msg instanceof YGOProMsgAnnounceRace) {
      let race = 1;
      while ((msg.availableRaces & race) === 0 && race < 0x2000000) {
        race <<= 1;
      }
      return msg.prepareResponse(race);
    }
    if (msg instanceof YGOProMsgAnnounceCard) {
      return msg.prepareResponse(89631139); // Blue-Eyes
    }
    if (msg instanceof YGOProMsgSortCard) {
      return msg.prepareResponse(msg.cards.map((_, i) => IndexResponse(i)));
    }

    const def = msg.defaultResponse();
    if (def) return def;
    throw new Error(`Unhandled prompt message type: ${msg.constructor.name}`);
  }

  private handleIdleCmd(msg: YGOProMsgSelectIdleCmd): Uint8Array {
    // 1. Try to Special Summon if possible
    if (msg.spSummonableCount > 0) {
      return msg.prepareResponse(IdleCmdType.SPSUMMON, IndexResponse(0));
    }

    // 2. Try to Normal Summon if possible
    if (msg.summonableCount > 0) {
      return msg.prepareResponse(IdleCmdType.SUMMON, IndexResponse(0));
    }

    // 3. Try to activate any Spells/Effects
    if (msg.activatableCount > 0) {
      return msg.prepareResponse(IdleCmdType.ACTIVATE, IndexResponse(0));
    }

    // 4. Try to Set a Spell/Trap (limit to 1 per turn)
    if (msg.ssetableCount > 0 && this.turnSets < 1) {
      this.turnSets++;
      return msg.prepareResponse(IdleCmdType.SSET, IndexResponse(0));
    }

    // 5. Try to Set a Monster if cannot summon
    if (msg.msetableCount > 0 && this.turnSets < 1) {
      this.turnSets++;
      return msg.prepareResponse(IdleCmdType.MSET, IndexResponse(0));
    }

    // 6. Enter Battle Phase if permitted
    if (msg.canBp) {
      return msg.prepareResponse(IdleCmdType.TO_BP);
    }

    // 7. End Phase
    if (msg.canEp) {
      this.turnSets = 0;
      return msg.prepareResponse(IdleCmdType.TO_EP);
    }

    return msg.prepareResponse(IdleCmdType.TO_EP);
  }

  private handleBattleCmd(msg: YGOProMsgSelectBattleCmd): Uint8Array {
    // 1. Attack with any available monster
    if (msg.attackableCount > 0) {
      return msg.prepareResponse(BattleCmdType.ATTACK, IndexResponse(0));
    }

    // 2. Go to Main Phase 2 if possible
    if (msg.canM2) {
      return msg.prepareResponse(BattleCmdType.TO_M2);
    }

    // 3. End Phase
    if (msg.canEp) {
      return msg.prepareResponse(BattleCmdType.TO_EP);
    }

    return msg.prepareResponse(BattleCmdType.TO_EP);
  }

  private handleChain(msg: YGOProMsgSelectChain): Uint8Array {
    // By default, chain with first activatable effect if available, or cancel/pass
    if (msg.count > 0 && msg.chains.length > 0) {
      return msg.prepareResponse(IndexResponse(0));
    }
    return msg.prepareResponse(null);
  }

  private handleSelectCard(msg: YGOProMsgSelectCard): Uint8Array {
    const count = Math.min(msg.min, msg.cards.length);
    const chosen = [];
    for (let i = 0; i < count; i++) {
      chosen.push(IndexResponse(i));
    }
    return msg.prepareResponse(chosen);
  }

  private handleSelectTribute(msg: YGOProMsgSelectTribute): Uint8Array {
    const count = Math.min(msg.min, msg.cards.length);
    const chosen = [];
    for (let i = 0; i < count; i++) {
      chosen.push(IndexResponse(i));
    }
    return msg.prepareResponse(chosen);
  }

  private handleSelectSum(msg: YGOProMsgSelectSum): Uint8Array {
    const chosen = [];
    for (let i = 0; i < Math.min(msg.min, msg.cards.length); i++) {
      chosen.push(IndexResponse(i));
    }
    return msg.prepareResponse(chosen);
  }

  private handleSelectUnselect(msg: YGOProMsgSelectUnselectCard): Uint8Array {
    if (msg.finishable) {
      return msg.prepareResponse(null);
    }
    if (msg.selectableCount > 0) {
      return msg.prepareResponse(IndexResponse(0));
    }
    return msg.defaultResponse();
  }

  private handleSelectPosition(msg: YGOProMsgSelectPosition): Uint8Array {
    // Prefer Attack position if available, else Defense
    if (msg.positions & POS.FACEUP_ATTACK) {
      return msg.prepareResponse(POS.FACEUP_ATTACK);
    }
    if (msg.positions & POS.FACEUP_DEFENSE) {
      return msg.prepareResponse(POS.FACEUP_DEFENSE);
    }
    if (msg.positions & POS.FACEDOWN_DEFENSE) {
      return msg.prepareResponse(POS.FACEDOWN_DEFENSE);
    }
    return msg.prepareResponse(POS.FACEUP_ATTACK);
  }

  private handleSelectPlace(msg: YGOProMsgSelectPlace | YGOProMsgSelectDisField): Uint8Array {
    const places = msg.getSelectablePlaces();
    const needed = Math.min(msg.count, places.length);
    return msg.prepareResponse(places.slice(0, needed));
  }
}
