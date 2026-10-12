import {
  type OcgcoreDuel,
  type OcgcoreWrapper,
} from 'koishipro-core.js';
import {
  YGOProMsgBase,
  YGOProMsgResponseBase,
  YGOProMsgDraw,
  YGOProMsgMove,
  YGOProMsgDamage,
  YGOProMsgRecover,
  YGOProMsgLpUpdate,
  YGOProMsgPayLpCost,
  YGOProMsgNewTurn,
  YGOProMsgNewPhase,
  YGOProMsgWin,
  YGOProMsgSummoned,
  YGOProMsgSpSummoned,
  YGOProMsgChaining,
  YGOProMsgChainSolving,
  YGOProMsgChainSolved,
  YGOProMsgChainEnd,
  YGOProMsgAttack,
  YGOProMsgBattle,
  YGOProMsgPosChange,
  YGOProMsgSelectChain,
  OcgcoreCommonConstants,
} from 'ygopro-msg-encode';
import { LOCATION, POS, DUEL_RULE_MR5, PHASE } from './constants';
import type { Deck } from './ydk';
import type { CardDatabase } from './card-database';
import { SimpleBot } from './bot/simple-bot';

/**
 * Cryptographic / seeded Fisher-Yates shuffle for initial deck randomization.
 */
function shuffleCards(cards: number[], seed?: number): number[] {
  const arr = [...cards];
  let state = seed !== undefined ? seed >>> 0 : 0;
  const nextRand = (): number => {
    if (seed !== undefined) {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return buf[0] / 4294967296;
    }
    return Math.random();
  };

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export interface BoardCardSnapshot {
  player: number;
  location: number;
  sequence: number;
  code: number;
  position: number;
  attack?: number;
  defense?: number;
  level?: number;
  type?: number;
  overlayCards?: number[];
}

export interface DuelRunnerOptions {
  wrapper: OcgcoreWrapper;
  cardDb?: CardDatabase;
  player0Deck: Deck;
  player1Deck: Deck;
  player0Name?: string;
  player1Name?: string;
  isPlayer0Bot?: boolean;
  isPlayer1Bot?: boolean;
  seed?: number;
  lp?: number;
  startHand?: number;
  drawCount?: number;
}

export type DuelEventListener = (event: DuelEvent) => void;

export type DuelEvent =
  | { type: 'start'; player0Name: string; player1Name: string }
  | { type: 'turn'; player: number; turnCount: number }
  | { type: 'phase'; phase: number; phaseName: string }
  | { type: 'draw'; player: number; count: number; cards: number[] }
  | { type: 'move'; code: number; cardName: string; from: any; to: any; reason: number }
  | { type: 'summon'; code: number; cardName: string; player: number; location: number }
  | { type: 'spsummon'; code: number; cardName: string; player: number; location: number }
  | { type: 'set'; code: number; cardName: string; player: number }
  | { type: 'chain'; code: number; cardName: string; player: number; chainCount: number; desc: number }
  | { type: 'chainSolving'; chainCount: number }
  | { type: 'chainSolved'; chainCount: number }
  | { type: 'chainEnd' }
  | { type: 'attack'; attacker: any; target?: any }
  | { type: 'battle'; attacker: any; defender?: any }
  | { type: 'posChange'; code: number; cardName: string; prevPos: number; currentPos: number }
  | { type: 'lp'; player: number; lp: number }
  | { type: 'damage'; player: number; amount: number }
  | { type: 'recover'; player: number; amount: number }
  | { type: 'win'; winner: number; reason: number; winnerName: string }
  | { type: 'prompt'; message: YGOProMsgResponseBase; respondingPlayer: number }
  | { type: 'sync'; snapshot: BoardCardSnapshot[] }
  | { type: 'log'; text: string };

export class DuelRunner {
  private duel: OcgcoreDuel;
  private cardDb?: CardDatabase;
  private bot0?: SimpleBot;
  private bot1?: SimpleBot;
  public isPlayer0Bot: boolean;
  public isPlayer1Bot: boolean;
  public playerNames: [string, string];
  private listeners: DuelEventListener[] = [];

  public lp: [number, number] = [8000, 8000];
  public turn = 0;
  public currentPhase: number = PHASE.DRAW;
  public activePlayer = 0;
  public isEnded = false;
  public winner: number | null = null;
  public currentPrompt?: YGOProMsgResponseBase;
  private winEmitted = false;

  constructor(private options: DuelRunnerOptions) {
    this.cardDb = options.cardDb;
    this.playerNames = [
      options.player0Name ?? 'Player 1',
      options.player1Name ?? 'Player 2',
    ];
    this.isPlayer0Bot = options.isPlayer0Bot ?? false;
    this.isPlayer1Bot = options.isPlayer1Bot ?? true;

    if (this.isPlayer0Bot) {
      this.bot0 = new SimpleBot(0, this.cardDb);
    }
    if (this.isPlayer1Bot) {
      this.bot1 = new SimpleBot(1, this.cardDb);
    }

    if (options.seed !== undefined) {
      this.duel = options.wrapper.createDuel(options.seed);
    } else if (typeof options.wrapper.createDuelV2 === 'function' && typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const seedSeq = new Uint32Array(4);
      crypto.getRandomValues(seedSeq);
      this.duel = options.wrapper.createDuelV2(Array.from(seedSeq));
    } else {
      const seed = Math.floor(Math.random() * 0xffffffff);
      this.duel = options.wrapper.createDuel(seed);
    }
    this.setupDuel();
  }

  on(listener: DuelEventListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  emit(event: DuelEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  setPlayer0Bot(isBot: boolean) {
    this.isPlayer0Bot = isBot;
    if (isBot) {
      if (!this.bot0) {
        this.bot0 = new SimpleBot(0, this.cardDb);
      }
      if (this.currentPrompt && this.currentPrompt.responsePlayer() === 0) {
        const respBytes = this.bot0.decide(this.currentPrompt, this.turn);
        this.duel.setResponse(respBytes);
        this.currentPrompt = undefined;
      }
    } else {
      this.bot0 = undefined;
    }
  }

  setPlayer1Bot(isBot: boolean) {
    this.isPlayer1Bot = isBot;
    if (isBot) {
      if (!this.bot1) {
        this.bot1 = new SimpleBot(1, this.cardDb);
      }
    } else {
      this.bot1 = undefined;
    }
  }

  private setupDuel() {
    const lp = this.options.lp ?? 8000;
    const startHand = this.options.startHand ?? 5;
    const drawCount = this.options.drawCount ?? 1;

    this.lp = [lp, lp];
    this.duel.setPlayerInfo({ player: 0, lp, startHand, drawCount });
    this.duel.setPlayerInfo({ player: 1, lp, startHand, drawCount });

    // Load & shuffle Player 0 deck
    this.loadDeckCards(0, this.options.player0Deck);
    // Load & shuffle Player 1 deck
    this.loadDeckCards(1, this.options.player1Deck);

    // Start duel with Master Rule 2020
    this.duel.startDuel(DUEL_RULE_MR5);
    this.emit({
      type: 'start',
      player0Name: this.playerNames[0],
      player1Name: this.playerNames[1],
    });
  }

  private loadDeckCards(player: number, deck: Deck) {
    // Shuffle the Main Deck before inserting into OCGCore so every duel has a fresh opening hand
    const seedForPlayer =
      this.options.seed !== undefined ? this.options.seed + player * 9973 : undefined;
    const mainCards = shuffleCards(deck.main, seedForPlayer);

    for (let seq = 0; seq < mainCards.length; seq++) {
      this.duel.newCard({
        code: mainCards[seq],
        owner: player,
        player,
        location: LOCATION.DECK,
        sequence: seq,
        position: POS.FACEDOWN_ATTACK,
      });
    }

    for (let seq = 0; seq < deck.extra.length; seq++) {
      this.duel.newCard({
        code: deck.extra[seq],
        owner: player,
        player,
        location: LOCATION.EXTRA,
        sequence: seq,
        position: POS.FACEDOWN_ATTACK,
      });
    }
  }

  /**
   * Executes a single processing step in the duel engine.
   * If a prompt arrives for an AI bot, answers automatically.
   * If a prompt arrives for a human player, returns { awaitingHuman: true, prompt }.
   */
  async step(): Promise<{ awaitingHuman: boolean; prompt?: YGOProMsgResponseBase; messages: YGOProMsgBase[] }> {
    if (this.isEnded) {
      return { awaitingHuman: false, messages: [] };
    }

    const res = this.duel.process();
    const messages = res.messages ?? [];

    for (const msg of messages) {
      this.handleGameMessage(msg);
    }

    if (res.status === 2 || this.isEnded || this.duel.ended) {
      this.isEnded = true;
      const snapshot = this.getBoardSnapshot();
      this.emit({ type: 'sync', snapshot });

      if (!this.winEmitted) {
        this.winEmitted = true;
        const w =
          this.winner !== null
            ? this.winner
            : this.lp[0] <= 0 && this.lp[1] <= 0
            ? 2
            : this.lp[1] <= 0
            ? 0
            : this.lp[0] <= 0
            ? 1
            : 0;
        this.winner = w;
        const winnerName = w === 2 ? 'Draw' : this.playerNames[w];
        this.emit({
          type: 'win',
          winner: w,
          reason: 1,
          winnerName,
        });
      }
      return { awaitingHuman: false, messages };
    }

    if (res.status === 1) {
      const promptMsg = messages.find((m) => m instanceof YGOProMsgResponseBase) as
        | YGOProMsgResponseBase
        | undefined;

      if (!promptMsg) {
        const snapshot = this.getBoardSnapshot();
        this.emit({ type: 'sync', snapshot });
        return { awaitingHuman: false, messages };
      }

      const respPlayer = promptMsg.responsePlayer();
      const bot = respPlayer === 0 ? this.bot0 : this.bot1;

      if (bot) {
        const respBytes = bot.decide(promptMsg, this.turn);
        this.duel.setResponse(respBytes);
        const snapshot = this.getBoardSnapshot();
        this.emit({ type: 'sync', snapshot });
        return { awaitingHuman: false, messages };
      } else {
        // Auto-pass empty SelectChain for human: avoids freezing/blocking when player has nothing to activate
        if (promptMsg instanceof YGOProMsgSelectChain && promptMsg.chains.length === 0) {
          this.duel.setResponse(promptMsg.prepareResponse(null));
          const snapshot = this.getBoardSnapshot();
          this.emit({ type: 'sync', snapshot });
          return { awaitingHuman: false, messages };
        }

        this.currentPrompt = promptMsg;
        const snapshot = this.getBoardSnapshot();
        this.emit({ type: 'sync', snapshot });
        this.emit({
          type: 'prompt',
          message: promptMsg,
          respondingPlayer: respPlayer,
        });
        return { awaitingHuman: true, prompt: promptMsg, messages };
      }
    }

    const snapshot = this.getBoardSnapshot();
    this.emit({ type: 'sync', snapshot });
    return { awaitingHuman: false, messages };
  }

  public getBoardSnapshot(): BoardCardSnapshot[] {
    const snapshots: BoardCardSnapshot[] = [];
    const flag =
      OcgcoreCommonConstants.QUERY_CODE |
      OcgcoreCommonConstants.QUERY_POSITION |
      OcgcoreCommonConstants.QUERY_TYPE |
      OcgcoreCommonConstants.QUERY_LEVEL |
      OcgcoreCommonConstants.QUERY_RANK |
      OcgcoreCommonConstants.QUERY_ATTACK |
      OcgcoreCommonConstants.QUERY_DEFENSE |
      OcgcoreCommonConstants.QUERY_OVERLAY_CARD;

    for (const p of [0, 1]) {
      for (const loc of [LOCATION.MZONE, LOCATION.SZONE, LOCATION.HAND]) {
        try {
          const res = this.duel.queryFieldCard({
            player: p,
            location: loc,
            queryFlag: flag,
          });
          const cards = res.cards ?? [];
          cards.forEach((cq, seq) => {
            if (cq.empty) return;
            if (loc !== LOCATION.HAND && !cq.code && !cq.position) return;
            snapshots.push({
              player: p,
              location: loc,
              sequence: cq.sequence ?? seq,
              code: cq.code ?? 0,
              position: cq.position ?? (loc === LOCATION.HAND ? POS.FACEDOWN : POS.FACEUP_ATTACK),
              attack: cq.attack,
              defense: cq.defense,
              level: cq.level ?? cq.rank,
              type: cq.type,
              overlayCards: cq.overlayCards,
            });
          });
        } catch {
          // Ignore location query errors
        }
      }
    }
    return snapshots;
  }

  public queryLocationCards(player: number, location: number): BoardCardSnapshot[] {
    const list: BoardCardSnapshot[] = [];
    const flag =
      OcgcoreCommonConstants.QUERY_CODE |
      OcgcoreCommonConstants.QUERY_POSITION |
      OcgcoreCommonConstants.QUERY_TYPE |
      OcgcoreCommonConstants.QUERY_LEVEL |
      OcgcoreCommonConstants.QUERY_RANK |
      OcgcoreCommonConstants.QUERY_ATTACK |
      OcgcoreCommonConstants.QUERY_DEFENSE;
    try {
      const res = this.duel.queryFieldCard({
        player,
        location,
        queryFlag: flag,
      });
      const cards = res.cards ?? [];
      cards.forEach((cq, seq) => {
        if (cq.empty || !cq.code) return;
        list.push({
          player,
          location,
          sequence: cq.sequence ?? seq,
          code: cq.code,
          position: cq.position ?? POS.FACEDOWN_ATTACK,
          attack: cq.attack,
          defense: cq.defense,
          level: cq.level ?? cq.rank,
          type: cq.type,
        });
      });
    } catch {
      // ignore
    }
    return list;
  }

  /**
   * Submits a human player's response to the active prompt.
   */
  respond(response: Uint8Array | number) {
    this.currentPrompt = undefined;
    this.duel.setResponse(response);
  }

  private handleGameMessage(msg: YGOProMsgBase) {
    try {
      if (msg instanceof YGOProMsgNewTurn) {
        this.turn++;
        this.activePlayer = msg.player;
        this.emit({
          type: 'turn',
          player: msg.player,
          turnCount: this.turn,
        });
        this.emit({
          type: 'log',
          text: `\n=== Turn ${this.turn}: ${this.playerNames[msg.player]}'s Turn ===`,
        });
      } else if (msg instanceof YGOProMsgNewPhase) {
        this.currentPhase = msg.phase;
        const phaseNames: Record<number, string> = {
          [PHASE.DRAW]: 'Draw Phase',
          [PHASE.STANDBY]: 'Standby Phase',
          [PHASE.MAIN1]: 'Main Phase 1',
          [PHASE.BATTLE_START]: 'Battle Phase (Start)',
          [PHASE.BATTLE_STEP]: 'Battle Step',
          [PHASE.DAMAGE]: 'Damage Step',
          [PHASE.DAMAGE_CAL]: 'Damage Calculation',
          [PHASE.BATTLE]: 'Battle Phase',
          [PHASE.MAIN2]: 'Main Phase 2',
          [PHASE.END]: 'End Phase',
        };
        const phaseName = phaseNames[msg.phase] ?? `Phase 0x${msg.phase.toString(16)}`;
        this.emit({ type: 'phase', phase: msg.phase, phaseName });
        this.emit({ type: 'log', text: `>> ${phaseName}` });
      } else if (msg instanceof YGOProMsgDraw) {
        this.emit({
          type: 'draw',
          player: msg.player,
          count: msg.count,
          cards: msg.cards,
        });
        // Do not leak opponent's drawn card names in the duel log!
        const names =
          msg.player === 0
            ? msg.cards.map((c) => this.cardDb?.getName(c) ?? `#${c}`).join(', ')
            : '';
        this.emit({
          type: 'log',
          text: `[Draw] ${this.playerNames[msg.player]} drew ${msg.count} card(s)${names ? `: ${names}` : ''}`,
        });
      } else if (msg instanceof YGOProMsgMove) {
        const isOpponentSecret =
          msg.current.controller === 1 &&
          (msg.current.location === LOCATION.HAND ||
            ((msg.current.location & (LOCATION.MZONE | LOCATION.SZONE | LOCATION.REMOVED)) !== 0 &&
              (msg.current.position & POS.FACEDOWN) !== 0));
        const visibleCode = isOpponentSecret ? 0 : msg.code;
        const name = visibleCode > 0 ? (this.cardDb?.getName(visibleCode) ?? `#${visibleCode}`) : 'a face-down card';
        const prevLoc = msg.previous.location;
        const currLoc = msg.current.location;
        const pName = this.playerNames[msg.current.controller];

        let actionDesc = '';
        if (currLoc === LOCATION.MZONE) {
          if (prevLoc === LOCATION.HAND || prevLoc === LOCATION.EXTRA || prevLoc === LOCATION.GRAVE) {
            actionDesc = `${pName} played ${name} to Monster Zone`;
          }
        } else if (currLoc === LOCATION.SZONE) {
          actionDesc = `${pName} placed ${name} in Spell/Trap Zone`;
        } else if (currLoc === LOCATION.GRAVE) {
          const gyName = this.cardDb?.getName(msg.code) ?? `#${msg.code}`;
          actionDesc = `${gyName} sent to ${this.playerNames[msg.current.controller]}'s Graveyard`;
        } else if (currLoc === LOCATION.REMOVED) {
          actionDesc = `${name} was banished`;
        }

        if (actionDesc) {
          this.emit({ type: 'log', text: `[Move] ${actionDesc}` });
        }

        this.emit({
          type: 'move',
          code: visibleCode,
          cardName: name,
          from: msg.previous,
          to: msg.current,
          reason: msg.reason,
        });
      } else if (msg instanceof YGOProMsgSummoned) {
        this.emit({ type: 'log', text: `[Summon] Normal Summon resolved.` });
      } else if (msg instanceof YGOProMsgSpSummoned) {
        this.emit({ type: 'log', text: `[SpSummon] Special Summon resolved.` });
      } else if (msg instanceof YGOProMsgChaining) {
        const name = this.cardDb?.getName(msg.code) ?? `#${msg.code}`;
        const chainCount = (msg as any).chainCount ?? (msg as any).ct ?? 1;
        const desc = (msg as any).desc ?? 0;
        this.emit({
          type: 'chain',
          code: msg.code,
          cardName: name,
          player: msg.controller,
          chainCount,
          desc,
        });
        this.emit({
          type: 'log',
          text: `[Chain ${chainCount}] ${this.playerNames[msg.controller]} activates effect of ${name}!`,
        });
      } else if (msg instanceof YGOProMsgChainSolving) {
        const chainCount = (msg as any).chainCount ?? (msg as any).ct ?? 1;
        this.emit({ type: 'chainSolving', chainCount });
        this.emit({
          type: 'log',
          text: `[Chain Resolving] Resolving Chain Link ${chainCount}...`,
        });
      } else if (msg instanceof YGOProMsgChainSolved) {
        const chainCount = (msg as any).chainCount ?? (msg as any).ct ?? 1;
        this.emit({ type: 'chainSolved', chainCount });
      } else if (msg instanceof YGOProMsgChainEnd) {
        this.emit({ type: 'chainEnd' });
        this.emit({
          type: 'log',
          text: `[Chain End] Chain resolution finished.`,
        });
      } else if (msg instanceof YGOProMsgAttack) {
        this.emit({
          type: 'attack',
          attacker: (msg as any).attacker,
          target: (msg as any).target,
        });
        this.emit({
          type: 'log',
          text: `[Attack] Attack declared!`,
        });
      } else if (msg instanceof YGOProMsgBattle) {
        this.emit({
          type: 'battle',
          attacker: (msg as any).attacker,
          defender: (msg as any).defender,
        });
        this.emit({
          type: 'log',
          text: `[Battle] Damage calculation resolved!`,
        });
      } else if (msg instanceof YGOProMsgPosChange) {
        const name = this.cardDb?.getName(msg.code) ?? `#${msg.code}`;
        this.emit({
          type: 'posChange',
          code: msg.code,
          cardName: name,
          prevPos: msg.previousPosition,
          currentPos: msg.currentPosition,
        });
        this.emit({
          type: 'log',
          text: `[Position] ${name} changed battle position.`,
        });
      } else if (msg instanceof YGOProMsgLpUpdate) {
        this.lp[msg.player] = Math.max(0, msg.lp);
        this.emit({ type: 'lp', player: msg.player, lp: this.lp[msg.player] });
        this.emit({
          type: 'log',
          text: `[LP Update] ${this.playerNames[msg.player]} LP: ${this.lp[msg.player]}`,
        });
      } else if (msg instanceof YGOProMsgDamage) {
        this.lp[msg.player] = Math.max(0, this.lp[msg.player] - msg.value);
        this.emit({ type: 'damage', player: msg.player, amount: msg.value });
        this.emit({ type: 'lp', player: msg.player, lp: this.lp[msg.player] });
        this.emit({
          type: 'log',
          text: `[Damage] ${this.playerNames[msg.player]} takes ${msg.value} damage! Remaining LP: ${this.lp[msg.player]}`,
        });
      } else if (msg instanceof YGOProMsgRecover) {
        this.lp[msg.player] += msg.value;
        this.emit({ type: 'recover', player: msg.player, amount: msg.value });
        this.emit({ type: 'lp', player: msg.player, lp: this.lp[msg.player] });
        this.emit({
          type: 'log',
          text: `[Recover] ${this.playerNames[msg.player]} gains ${msg.value} LP! Remaining LP: ${this.lp[msg.player]}`,
        });
      } else if (msg instanceof YGOProMsgPayLpCost) {
        this.lp[msg.player] = Math.max(0, this.lp[msg.player] - msg.cost);
        this.emit({ type: 'damage', player: msg.player, amount: msg.cost });
        this.emit({ type: 'lp', player: msg.player, lp: this.lp[msg.player] });
        this.emit({
          type: 'log',
          text: `[LP Cost] ${this.playerNames[msg.player]} pays ${msg.cost} LP! Remaining LP: ${this.lp[msg.player]}`,
        });
      } else if (msg instanceof YGOProMsgWin) {
        this.isEnded = true;
        this.winner = msg.player;
        this.winEmitted = true;
        const winnerName = msg.player === 2 ? 'Draw' : this.playerNames[msg.player];
        this.emit({
          type: 'win',
          winner: msg.player,
          reason: msg.type,
          winnerName,
        });
        this.emit({
          type: 'log',
          text: `*** DUEL OVER! ${winnerName} Wins! ***`,
        });
      }
    } catch (err) {
      console.error('Error handling game message:', err);
    }
  }

  destroy() {
    this.duel.endDuel();
  }
}
