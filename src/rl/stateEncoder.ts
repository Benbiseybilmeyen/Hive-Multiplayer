/**
 * State Encoder — Converts Hive GameState into a fixed-size feature vector
 * for the DQN neural network input.
 *
 * Output: Float32Array of length STATE_SIZE (128 features)
 */
import { GameState, PieceType, PlayerColor, HEX_DIRS } from '../types';
import { posKey, keyToPos, hexNeighborKeys, getTopPiece, getStackHeight } from '../gameLogic';

export const STATE_SIZE = 128;

const PIECE_TYPES: PieceType[] = ['queen', 'beetle', 'spider', 'grasshopper', 'ant'];
const PIECE_TYPE_INDEX: Record<PieceType, number> = {
  queen: 0, beetle: 1, spider: 2, grasshopper: 3, ant: 4,
};

/**
 * Encode the full game state into a 128-dimensional feature vector.
 * 
 * Feature breakdown:
 * [0-49]    Board ring encoding (pieces in concentric rings around center)
 * [50-59]   Hand pieces for current player (5 types × 2 normalized)
 * [60-69]   Hand pieces for opponent
 * [70-71]   Queen placed flags
 * [72-73]   Turn counts (normalized)
 * [74-75]   Queen surrounding counts (current player's queen, opponent's queen)
 * [76-77]   Mobility estimates
 * [78-79]   Board piece count ratio
 * [80-95]   Local pattern features around queens
 * [96-111]  Piece adjacency features
 * [112-127] Strategic features (connectivity, threats, etc.)
 */
export function encodeState(state: GameState, perspective: PlayerColor): Float32Array {
  const features = new Float32Array(STATE_SIZE);
  const opponent: PlayerColor = perspective === 'white' ? 'black' : 'white';
  let idx = 0;

  // ─── Board ring encoding (0-49) ──────────────────────────────────────
  // Encode pieces in rings 0-4 around center (0,0)
  const occupied = Object.keys(state.board).filter(k => state.board[k]?.length > 0);

  for (let ring = 0; ring < 5; ring++) {
    let friendlyCount = 0;
    let enemyCount = 0;
    let totalPieces = 0;
    let queenPresent = 0;
    let beetleOnTop = 0;

    for (const key of occupied) {
      const pos = keyToPos(key);
      const dist = hexDistance(pos.q, pos.r);
      if (dist !== ring) continue;

      const stack = state.board[key];
      totalPieces += stack.length;
      const top = stack[stack.length - 1];

      if (top.color === perspective) friendlyCount++;
      else enemyCount++;

      if (top.type === 'queen') queenPresent = top.color === perspective ? 1 : -1;
      if (stack.length > 1 && top.type === 'beetle') beetleOnTop++;
    }

    features[idx++] = friendlyCount / 6;   // normalize
    features[idx++] = enemyCount / 6;
    features[idx++] = totalPieces / 12;
    features[idx++] = queenPresent;
    features[idx++] = beetleOnTop / 3;

    // Piece type distribution in this ring
    for (const pt of PIECE_TYPES) {
      let count = 0;
      for (const key of occupied) {
        const pos = keyToPos(key);
        if (hexDistance(pos.q, pos.r) !== ring) continue;
        const top = getTopPiece(state, key);
        if (top && top.type === pt && top.color === perspective) count++;
      }
      features[idx++] = count / 3;
    }
  }

  idx = 50; // Ensure alignment

  // ─── Hand pieces (50-69) ─────────────────────────────────────────────
  for (const pt of PIECE_TYPES) {
    features[idx++] = state.hands[perspective][pt] / 3;
    features[idx++] = state.hands[opponent][pt] / 3;
  }

  // ─── Queen flags (70-71) ─────────────────────────────────────────────
  features[70] = state.queenPlaced[perspective] ? 1 : 0;
  features[71] = state.queenPlaced[opponent] ? 1 : 0;
  idx = 72;

  // ─── Turn counts (72-73) ─────────────────────────────────────────────
  features[72] = Math.min(state.turnCount[perspective] / 11, 1);
  features[73] = Math.min(state.turnCount[opponent] / 11, 1);
  idx = 74;

  // ─── Queen surrounding (74-75) ───────────────────────────────────────
  features[74] = getQueenSurroundings(state, perspective) / 6;
  features[75] = getQueenSurroundings(state, opponent) / 6;
  idx = 76;

  // ─── Mobility (76-77) ────────────────────────────────────────────────
  features[76] = Math.min(occupied.filter(k => {
    const top = getTopPiece(state, k);
    return top && top.color === perspective;
  }).length / 11, 1);
  features[77] = Math.min(occupied.filter(k => {
    const top = getTopPiece(state, k);
    return top && top.color === opponent;
  }).length / 11, 1);
  idx = 78;

  // ─── Board count ratio (78-79) ───────────────────────────────────────
  const totalOnBoard = occupied.length;
  features[78] = totalOnBoard / 22;
  features[79] = state.moveCount / 100;
  idx = 80;

  // ─── Queen neighbor features (80-95) ─────────────────────────────────
  for (const color of [perspective, opponent] as PlayerColor[]) {
    const queenKey = findQueenKey(state, color);
    if (queenKey) {
      const pos = keyToPos(queenKey);
      const neighbors = hexNeighborKeys(pos);
      for (let i = 0; i < 6; i++) {
        const nk = neighbors[i];
        const top = getTopPiece(state, nk);
        if (top) {
          features[idx] = top.color === perspective ? 0.5 : -0.5;
          features[idx] += (PIECE_TYPE_INDEX[top.type] + 1) / 10;
        }
        idx++;
      }
      // Additional queen metrics
      features[idx++] = getStackHeight(state, queenKey) > 1 ? 1 : 0; // beetle on queen
      features[idx++] = neighbors.filter(nk => getStackHeight(state, nk) === 0).length / 6; // escape routes
    } else {
      idx += 8;
    }
  }

  idx = 96;

  // ─── Piece adjacency features (96-111) ───────────────────────────────
  for (const pt of PIECE_TYPES) {
    let friendlyAdj = 0;
    let enemyAdj = 0;
    for (const key of occupied) {
      const top = getTopPiece(state, key);
      if (!top || top.type !== pt) continue;
      const pos = keyToPos(key);
      for (const nk of hexNeighborKeys(pos)) {
        const nt = getTopPiece(state, nk);
        if (nt) {
          if (nt.color === top.color) friendlyAdj++;
          else enemyAdj++;
        }
      }
    }
    features[idx++] = friendlyAdj / 12;
    features[idx++] = enemyAdj / 12;

    // Piece mobility indicator in the current position
    features[idx++] = Math.min(friendlyAdj + enemyAdj, 10) / 10;
  }

  idx = Math.min(idx, 112);

  // ─── Strategic features (112-127) ────────────────────────────────────
  // Hive connectivity
  features[112] = occupied.length > 0 ? 1 : 0;

  // Current player advantage
  features[113] = state.currentPlayer === perspective ? 1 : -1;

  // Game phase (opening / middlegame / endgame)
  const phase = state.moveCount < 8 ? 0 : state.moveCount < 30 ? 0.5 : 1;
  features[114] = phase;

  // Must-place-queen urgency
  features[115] = (state.turnCount[perspective] === 3 && !state.queenPlaced[perspective]) ? 1 : 0;
  features[116] = (state.turnCount[opponent] === 3 && !state.queenPlaced[opponent]) ? 1 : 0;

  // Hand advantage
  const myHandSize = Object.values(state.hands[perspective]).reduce((a, b) => a + b, 0);
  const oppHandSize = Object.values(state.hands[opponent]).reduce((a, b) => a + b, 0);
  features[117] = (myHandSize - oppHandSize) / 11;

  // Beetle advantage
  features[118] = (state.hands[perspective].beetle - state.hands[opponent].beetle) / 2;

  // Ant count on board (powerful piece)
  let antOnBoard = 0;
  for (const key of occupied) {
    const top = getTopPiece(state, key);
    if (top && top.type === 'ant' && top.color === perspective) antOnBoard++;
  }
  features[119] = antOnBoard / 3;

  // Fill remaining with zeros (already default)
  // features[120-127] = 0 (reserved for future features)

  return features;
}

// ─── Action Encoding ────────────────────────────────────────────────────────

/**
 * Maximum action space size.
 * We use a flat encoding:
 * - Place actions: 5 piece types × MAX_POSITIONS = 5 × 60 = 300
 * - Move actions: MAX_POSITIONS × 6 directions × MAX_RANGE = 60 × 6 × 5 = 1800
 * - Pass: 1
 * Total: 2101 (we cap at a smaller number and use hashing)
 * 
 * For practical purposes, we use a compact action space of 512
 * and hash moves into action indices.
 */
export const ACTION_SIZE = 512;

export function moveToActionIndex(move: import('../types').Move): number {
  if (move.type === 'pass') return 0;

  let hash = 0;
  if (move.type === 'place' && move.pieceType && move.to) {
    hash = 1 + PIECE_TYPE_INDEX[move.pieceType] * 100 +
      ((move.to.q + 20) * 41 + (move.to.r + 20));
  } else if (move.type === 'move' && move.from && move.to) {
    hash = 301 +
      ((move.from.q + 20) * 41 + (move.from.r + 20)) * 41 +
      ((move.to.q + 20) * 41 + (move.to.r + 20));
  }

  return ((hash % (ACTION_SIZE - 1)) + (ACTION_SIZE - 1)) % (ACTION_SIZE - 1) + 1;
}

/**
 * Create action mask: Float32Array with 1 for legal actions, -Infinity for illegal
 */
export function createActionMask(legalMoves: import('../types').Move[]): Float32Array {
  const mask = new Float32Array(ACTION_SIZE).fill(-1e9); // large negative
  for (const move of legalMoves) {
    const idx = moveToActionIndex(move);
    mask[idx] = 0; // allow this action
  }
  return mask;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function hexDistance(q: number, r: number): number {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
}

function findQueenKey(state: GameState, color: PlayerColor): string | null {
  for (const key of Object.keys(state.board)) {
    const stack = state.board[key];
    for (const piece of stack) {
      if (piece.type === 'queen' && piece.color === color) return key;
    }
  }
  return null;
}

function getQueenSurroundings(state: GameState, color: PlayerColor): number {
  const queenKey = findQueenKey(state, color);
  if (!queenKey) return 0;
  const pos = keyToPos(queenKey);
  return hexNeighborKeys(pos).filter(nk => getStackHeight(state, nk) > 0).length;
}
