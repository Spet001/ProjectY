export const CARD_WIDTH = 0.85;
export const CARD_HEIGHT = 1.24;
export const CARD_THICKNESS = 0.01;

export interface ZoneCoord {
  x: number;
  y: number;
  z: number;
  player: number;
  location: number;
  sequence: number;
  label: string;
}

export function getZonePosition(player: number, location: number, sequence: number): { x: number; y: number; z: number } {
  // LOCATION: 0x04 = MZONE, 0x08 = SZONE, 0x10 = GRAVE, 0x20 = REMOVED, 0x01 = DECK, 0x40 = EXTRA
  // CARD_HEIGHT is 1.24 (half = 0.62). EMZ is at z = 0 (-0.65..+0.65).
  // MZONE is placed at z = ±1.48 (±0.83..±2.13) so there is a clean gap between EMZ and both fields!
  // SZONE is placed at z = ±2.92 (±2.27..±3.57) so there is a clean gap between MZONE and SZONE!
  const mzoneX = [-2.6, -1.3, 0, 1.3, 2.6];
  const szoneX = [-2.6, -1.3, 0, 1.3, 2.6];

  if (player === 0) {
    if (location === 0x04) {
      // MZONE (seq 0-4 main monster zones, seq 5-6 extra monster zones)
      if (sequence === 5) return { x: -1.3, y: 0.08, z: 0 };
      if (sequence === 6) return { x: 1.3, y: 0.08, z: 0 };
      return { x: mzoneX[sequence] ?? 0, y: 0.08, z: 1.48 };
    }
    if (location === 0x08) {
      // SZONE (seq 0-4 are Spell/Trap zones, seq 5 is Field Zone)
      if (sequence === 5) {
        return { x: -3.85, y: 0.08, z: 1.48 };
      }
      return { x: szoneX[sequence] ?? 0, y: 0.08, z: 2.92 };
    }
    if (location === 0x01) {
      // DECK
      return { x: 3.85, y: 0.40, z: 2.92 };
    }
    if (location === 0x10) {
      // GRAVEYARD
      return { x: 3.85, y: 0.08, z: 1.48 };
    }
    if (location === 0x20) {
      // BANISHED
      return { x: 4.88, y: 0.08, z: 1.48 };
    }
    if (location === 0x40) {
      // EXTRA
      return { x: -3.85, y: 0.22, z: 2.92 };
    }
    if (location === 0x02) {
      // HAND (arc calculation done separately)
      return { x: -1.5 + sequence * 0.7, y: 0.5, z: 4.45 };
    }
  } else {
    // Opponent (Player 1)
    if (location === 0x04) {
      // MZONE (seq 5-6 EMZ)
      if (sequence === 5) return { x: 1.3, y: 0.08, z: 0 };
      if (sequence === 6) return { x: -1.3, y: 0.08, z: 0 };
      return { x: -(mzoneX[sequence] ?? 0), y: 0.08, z: -1.48 };
    }
    if (location === 0x08) {
      // SZONE (seq 0-4 are Spell/Trap zones, seq 5 is Field Zone)
      if (sequence === 5) {
        return { x: 3.85, y: 0.08, z: -1.48 };
      }
      return { x: -(szoneX[sequence] ?? 0), y: 0.08, z: -2.92 };
    }
    if (location === 0x01) {
      // DECK
      return { x: -3.85, y: 0.40, z: -2.92 };
    }
    if (location === 0x10) {
      // GRAVEYARD
      return { x: -3.85, y: 0.08, z: -1.48 };
    }
    if (location === 0x20) {
      // BANISHED
      return { x: -4.88, y: 0.08, z: -1.48 };
    }
    if (location === 0x40) {
      // EXTRA
      return { x: 3.85, y: 0.22, z: -2.92 };
    }
    if (location === 0x02) {
      // HAND
      return { x: 1.5 - sequence * 0.7, y: 0.5, z: -4.15 };
    }
  }

  return { x: 0, y: 0, z: 0 };
}
