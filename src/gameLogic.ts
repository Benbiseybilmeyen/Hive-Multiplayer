import {
  PieceType, PlayerColor, Piece, HexPos, GameState, Move,
  INITIAL_HAND, HEX_DIRS,
} from './types';

// ─── Utility ────────────────────────────────────────────────────────────────

export function posKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function keyToPos(key: string): HexPos {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

export function hexNeighbors(pos: HexPos): HexPos[] {
  return HEX_DIRS.map(d => ({ q: pos.q + d.q, r: pos.r + d.r }));
}

export function hexNeighborKeys(pos: HexPos): string[] {
  return hexNeighbors(pos).map(p => posKey(p.q, p.r));
}



// ─── Initial State ──────────────────────────────────────────────────────────

export function createInitialState(): GameState {
  return {
    board: {},
    currentPlayer: 'white',
    hands: {
      white: { ...INITIAL_HAND },
      black: { ...INITIAL_HAND },
    },
    turnCount: { white: 0, black: 0 },
    queenPlaced: { white: false, black: false },
    gameOver: false,
    winner: null,
    moveCount: 0,
    lastMoves: [],
    history: [],
  };
}

// ─── Board helpers ──────────────────────────────────────────────────────────

export function getTopPiece(state: GameState, key: string): Piece | null {
  const stack = state.board[key];
  if (!stack || stack.length === 0) return null;
  return stack[stack.length - 1];
}

export function getStackHeight(state: GameState, key: string): number {
  return state.board[key]?.length ?? 0;
}

function getAllOccupiedKeys(state: GameState): string[] {
  return Object.keys(state.board).filter(k => state.board[k] && state.board[k].length > 0);
}

function getTopColor(state: GameState, key: string): PlayerColor | null {
  const top = getTopPiece(state, key);
  return top ? top.color : null;
}

// ─── One Hive Check (Articulation Point) ────────────────────────────────────

function isArticulationPoint(state: GameState, removeKey: string): boolean {
  const occupied = new Set(getAllOccupiedKeys(state));
  occupied.delete(removeKey);

  if (occupied.size === 0) return false;

  // BFS from any remaining node
  const start = occupied.values().next().value;
  const visited = new Set<string>();
  const queue: string[] = [start!];
  visited.add(start!);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const pos = keyToPos(cur);
    for (const n of hexNeighborKeys(pos)) {
      if (occupied.has(n) && !visited.has(n)) {
        visited.add(n);
        queue.push(n);
      }
    }
  }

  return visited.size !== occupied.size;
}

// ─── Freedom to Slide ───────────────────────────────────────────────────────

// Can a ground-level piece slide from `from` to `to` (must be adjacent)?
// The two common neighbors of from and to must not both be occupied.
function canSlide(state: GameState, from: HexPos, to: HexPos, removedKey?: string): boolean {
  const fromNeighbors = new Set(hexNeighborKeys(from));
  const toNeighbors = new Set(hexNeighborKeys(to));
  const common: string[] = [];
  for (const n of fromNeighbors) {
    if (toNeighbors.has(n)) common.push(n);
  }
  // Common neighbors should be exactly 2 for adjacent hexes
  let blockedCount = 0;
  for (const c of common) {
    if (c === removedKey) continue;
    if (getStackHeight(state, c) > 0) blockedCount++;
  }
  return blockedCount < 2;
}

// Piece must remain connected to hive while sliding
function isTouchingHive(state: GameState, pos: HexPos, excludeKey?: string): boolean {
  const key = posKey(pos.q, pos.r);
  for (const nk of hexNeighborKeys(pos)) {
    if (nk === excludeKey || nk === key) continue;
    if (getStackHeight(state, nk) > 0) return true;
  }
  return false;
}

// ─── Placement Logic ────────────────────────────────────────────────────────

export function getPlacementPositions(state: GameState, color: PlayerColor): HexPos[] {
  const occupied = getAllOccupiedKeys(state);

  // First piece of the game: place at origin
  if (occupied.length === 0) {
    return [{ q: 0, r: 0 }];
  }

  // Second piece (first move of second player): adjacent to first piece
  if (occupied.length === 1) {
    const pos = keyToPos(occupied[0]);
    return hexNeighbors(pos);
  }

  // Normal placement: must touch only own color (top of stack)
  const candidates = new Set<string>();
  for (const key of occupied) {
    const pos = keyToPos(key);
    for (const n of hexNeighbors(pos)) {
      const nk = posKey(n.q, n.r);
      if (getStackHeight(state, nk) === 0) {
        candidates.add(nk);
      }
    }
  }

  const result: HexPos[] = [];
  for (const ck of candidates) {
    const cpos = keyToPos(ck);
    const neighbors = hexNeighborKeys(cpos);
    let touchesOwn = false;
    let touchesEnemy = false;
    for (const nk of neighbors) {
      const topColor = getTopColor(state, nk);
      if (topColor === color) touchesOwn = true;
      if (topColor !== null && topColor !== color) touchesEnemy = true;
    }
    if (touchesOwn && !touchesEnemy) {
      result.push(cpos);
    }
  }

  return result;
}

// ─── Movement Logic per piece type ──────────────────────────────────────────

function getQueenMoves(state: GameState, from: HexPos): HexPos[] {
  const fromKey = posKey(from.q, from.r);
  const moves: HexPos[] = [];

  for (const n of hexNeighbors(from)) {
    const nk = posKey(n.q, n.r);
    if (getStackHeight(state, nk) > 0) continue; // must be empty
    if (!canSlide(state, from, n, fromKey)) continue;
    if (!isTouchingHive(state, n, fromKey)) continue;
    moves.push(n);
  }

  return moves;
}

function getBeetleMoves(state: GameState, from: HexPos): HexPos[] {
  const fromKey = posKey(from.q, from.r);
  const fromHeight = getStackHeight(state, fromKey);
  const moves: HexPos[] = [];

  for (const n of hexNeighbors(from)) {
    const nk = posKey(n.q, n.r);
    const toHeight = getStackHeight(state, nk);

    // Beetle on ground moving to ground: normal slide check
    // Beetle climbing up or down: different check
    if (fromHeight === 1 && toHeight === 0) {
      // Ground to ground: standard slide
      if (!canSlide(state, from, n, fromKey)) continue;
      if (!isTouchingHive(state, n, fromKey)) continue;
    } else {
      // Climbing or descending: check gate (the max height matters)
      // For beetle on top of stack, it can move to adjacent if not blocked by higher structures
      const fromNeighbors = new Set(hexNeighborKeys(from));
      const toNeighbors = new Set(hexNeighborKeys(n));
      const common: string[] = [];
      for (const cn of fromNeighbors) {
        if (toNeighbors.has(cn)) common.push(cn);
      }
      
      // Gate check for elevated movement
      const effectiveFromHeight = fromHeight - 1; // height after removing the beetle
      const gateHeights = common.map(c => c === fromKey ? effectiveFromHeight : getStackHeight(state, c));
      const maxGateHeight = Math.max(...gateHeights);
      const movingHeight = Math.max(effectiveFromHeight, toHeight);
      
      if (maxGateHeight <= movingHeight || gateHeights.some(h => h <= movingHeight)) {
        // Can pass
      } else {
        continue;
      }

      // If descending to ground, must still be connected
      if (toHeight === 0 && !isTouchingHive(state, n, fromKey)) continue;
    }
    moves.push(n);
  }

  return moves;
}

function getGrasshopperMoves(state: GameState, from: HexPos): HexPos[] {
  const moves: HexPos[] = [];

  for (const dir of HEX_DIRS) {
    let cur = { q: from.q + dir.q, r: from.r + dir.r };
    let curKey = posKey(cur.q, cur.r);

    // Must jump over at least one piece
    if (getStackHeight(state, curKey) === 0) continue;

    // Continue in direction until finding empty hex
    while (getStackHeight(state, curKey) > 0) {
      cur = { q: cur.q + dir.q, r: cur.r + dir.r };
      curKey = posKey(cur.q, cur.r);
    }

    moves.push(cur);
  }

  return moves;
}

function getSpiderMoves(state: GameState, from: HexPos): HexPos[] {
  const fromKey = posKey(from.q, from.r);
  const results = new Set<string>();

  // DFS with exactly 3 steps, no backtracking
  function dfs(cur: HexPos, steps: number, visited: Set<string>) {
    if (steps === 3) {
      results.add(posKey(cur.q, cur.r));
      return;
    }

    for (const n of hexNeighbors(cur)) {
      const nk = posKey(n.q, n.r);
      if (visited.has(nk)) continue;
      if (nk === fromKey) continue;
      if (getStackHeight(state, nk) > 0) continue; // must be empty
      if (!canSlide(state, cur, n, fromKey)) continue;
      if (!isTouchingHive(state, n, fromKey)) continue;

      visited.add(nk);
      dfs(n, steps + 1, visited);
      visited.delete(nk);
    }
  }

  const visited = new Set<string>([fromKey]);
  dfs(from, 0, visited);

  return [...results].map(keyToPos);
}

function getAntMoves(state: GameState, from: HexPos): HexPos[] {
  const fromKey = posKey(from.q, from.r);
  const visited = new Set<string>([fromKey]);
  const queue: HexPos[] = [];

  // BFS around the hive perimeter
  for (const n of hexNeighbors(from)) {
    const nk = posKey(n.q, n.r);
    if (getStackHeight(state, nk) > 0) continue;
    if (!canSlide(state, from, n, fromKey)) continue;
    if (!isTouchingHive(state, n, fromKey)) continue;
    if (visited.has(nk)) continue;
    visited.add(nk);
    queue.push(n);
  }

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const n of hexNeighbors(cur)) {
      const nk = posKey(n.q, n.r);
      if (visited.has(nk)) continue;
      if (getStackHeight(state, nk) > 0) continue;
      if (!canSlide(state, cur, n, fromKey)) continue;
      if (!isTouchingHive(state, n, fromKey)) continue;
      visited.add(nk);
      queue.push(n);
    }
  }

  visited.delete(fromKey);
  return [...visited].map(keyToPos);
}

// ─── Get Legal Moves for a piece at position ───────────────────────────────

export function getMovesForPiece(state: GameState, from: HexPos): HexPos[] {
  const key = posKey(from.q, from.r);
  const stack = state.board[key];
  if (!stack || stack.length === 0) return [];

  const piece = stack[stack.length - 1]; // top piece
  const color = piece.color;

  if (color !== state.currentPlayer) return [];

  // Queen must be placed before any movement
  if (!state.queenPlaced[color]) return [];

  // Check if piece is pinned under a beetle (only top piece can move)
  // piece is already the top piece, so if stack > 1, bottom pieces can't move
  // But the top piece CAN move (it's a beetle on top of the stack)

  // One Hive check: only for ground-level pieces (or beetles on top leaving ground)
  if (stack.length === 1) {
    if (isArticulationPoint(state, key)) return [];
  }

  switch (piece.type) {
    case 'queen': return getQueenMoves(state, from);
    case 'beetle': return getBeetleMoves(state, from);
    case 'grasshopper': return getGrasshopperMoves(state, from);
    case 'spider': return getSpiderMoves(state, from);
    case 'ant': return getAntMoves(state, from);
    default: return [];
  }
}

// ─── Get ALL legal moves for current player ─────────────────────────────────

export function getAllLegalMoves(state: GameState): Move[] {
  if (state.gameOver) return [];

  const color = state.currentPlayer;
  const moves: Move[] = [];
  const tc = state.turnCount[color];

  // Check if queen MUST be placed on turn 4 (index 3)
  const mustPlaceQueen = tc === 3 && !state.queenPlaced[color];

  // Placement moves
  const hand = state.hands[color];
  const placementPositions = getPlacementPositions(state, color);

  if (mustPlaceQueen) {
    // Only queen placement allowed
    if (hand.queen > 0) {
      for (const pos of placementPositions) {
        moves.push({ type: 'place', pieceType: 'queen', to: pos });
      }
    }
  } else {
    // All piece types can be placed
    const placedTypes = new Set<PieceType>();
    for (const pt of Object.keys(hand) as PieceType[]) {
      if (hand[pt] > 0 && !placedTypes.has(pt)) {
        placedTypes.add(pt);
        for (const pos of placementPositions) {
          moves.push({ type: 'place', pieceType: pt, to: pos });
        }
      }
    }

    // Movement moves (only if queen is placed)
    if (state.queenPlaced[color]) {
      const occupied = getAllOccupiedKeys(state);
      for (const key of occupied) {
        const topPiece = getTopPiece(state, key);
        if (!topPiece || topPiece.color !== color) continue;

        const from = keyToPos(key);
        const destinations = getMovesForPiece(state, from);
        for (const to of destinations) {
          moves.push({ type: 'move', from, to, pieceType: topPiece.type });
        }
      }
    }
  }

  // If no moves available, must pass
  if (moves.length === 0) {
    moves.push({ type: 'pass' });
  }

  return moves;
}

// ─── Apply Move ─────────────────────────────────────────────────────────────

let pieceIdCounter = 0;

export function applyMove(state: GameState, move: Move): GameState {
  const newState: GameState = {
    board: {},
    currentPlayer: state.currentPlayer === 'white' ? 'black' : 'white',
    hands: {
      white: { ...state.hands.white },
      black: { ...state.hands.black },
    },
    turnCount: { ...state.turnCount },
    queenPlaced: { ...state.queenPlaced },
    gameOver: false,
    winner: null,
    moveCount: state.moveCount + 1,
    lastMoves: [...state.lastMoves],
  };

  // Deep copy board
  for (const key of Object.keys(state.board)) {
    newState.board[key] = [...state.board[key]];
  }

  const color = state.currentPlayer;

  if (move.type === 'place' && move.pieceType && move.to) {
    const toKey = posKey(move.to.q, move.to.r);
    const piece: Piece = {
      type: move.pieceType,
      color,
      id: `${color}-${move.pieceType}-${pieceIdCounter++}`,
    };
    if (!newState.board[toKey]) newState.board[toKey] = [];
    newState.board[toKey].push(piece);
    newState.hands[color][move.pieceType]--;
    newState.turnCount[color]++;
    if (move.pieceType === 'queen') {
      newState.queenPlaced[color] = true;
    }
  } else if (move.type === 'move' && move.from && move.to) {
    const fromKey = posKey(move.from.q, move.from.r);
    const toKey = posKey(move.to.q, move.to.r);

    const piece = newState.board[fromKey].pop()!;
    if (newState.board[fromKey].length === 0) {
      delete newState.board[fromKey];
    }
    if (!newState.board[toKey]) newState.board[toKey] = [];
    newState.board[toKey].push(piece);
  }

  // Move serialization for repetition
  const moveStr = `${color}:${move.type}:${move.from?.q},${move.from?.r}->${move.to?.q},${move.to?.r}`;
  newState.lastMoves.push(moveStr);
  if (newState.lastMoves.length > 12) {
    newState.lastMoves = newState.lastMoves.slice(-12);
  }

  // Check game end
  checkGameEnd(newState);

  return newState;
}

// ─── Game End Check ─────────────────────────────────────────────────────────

function checkGameEnd(state: GameState): void {
  let whiteSurrounded = false;
  let blackSurrounded = false;

  // Find queens
  for (const key of Object.keys(state.board)) {
    const stack = state.board[key];
    for (const piece of stack) {
      if (piece.type === 'queen') {
        const pos = keyToPos(key);
        const neighbors = hexNeighborKeys(pos);
        const allSurrounded = neighbors.every(nk => getStackHeight(state, nk) > 0);
        if (piece.color === 'white') whiteSurrounded = allSurrounded;
        if (piece.color === 'black') blackSurrounded = allSurrounded;
      }
    }
  }

  if (whiteSurrounded && blackSurrounded) {
    state.gameOver = true;
    state.winner = 'draw';
  } else if (whiteSurrounded) {
    state.gameOver = true;
    state.winner = 'black';
  } else if (blackSurrounded) {
    state.gameOver = true;
    state.winner = 'white';
  }

  // Draw by excessive moves
  if (state.moveCount >= 100) {
    state.gameOver = true;
    state.winner = 'draw';
  }

  // Repetition detection (simplified: same 4-move sequence repeats)
  if (state.lastMoves.length >= 8) {
    const last4 = state.lastMoves.slice(-4).join('|');
    const prev4 = state.lastMoves.slice(-8, -4).join('|');
    if (last4 === prev4) {
      state.gameOver = true;
      state.winner = 'draw';
    }
  }
}

// ─── Evaluation for AI ─────────────────────────────────────────────────────

export function evaluateState(state: GameState, aiColor: PlayerColor): number {
  if (state.gameOver) {
    if (state.winner === aiColor) return 10000;
    if (state.winner === 'draw') return 0;
    return -10000;
  }

  const opponent: PlayerColor = aiColor === 'white' ? 'black' : 'white';
  let score = 0;

  // Count surrounding of queens
  for (const key of Object.keys(state.board)) {
    const stack = state.board[key];
    for (const piece of stack) {
      if (piece.type === 'queen') {
        const pos = keyToPos(key);
        const neighbors = hexNeighborKeys(pos);
        const surroundCount = neighbors.filter(nk => getStackHeight(state, nk) > 0).length;
        if (piece.color === aiColor) {
          score -= surroundCount * 30; // Slightly bad: our queen surrounded
        } else {
          score += surroundCount * 80; // Very Good: opponent queen surrounded
        }
      }
    }
  }

  // Mobility advantage
  // Count AI moves
  const aiState = { ...state, currentPlayer: aiColor };
  const aiMoves = getAllLegalMoves(aiState).filter(m => m.type !== 'pass');

  // Count opponent moves
  const oppState = { ...state, currentPlayer: opponent };
  const oppMoves = getAllLegalMoves(oppState).filter(m => m.type !== 'pass');

  score += (aiMoves.length - oppMoves.length) * 2;

  // Pieces in hand (fewer is generally better - means more on board)
  const aiHand = Object.values(state.hands[aiColor]).reduce((a, b) => a + b, 0);
  const oppHand = Object.values(state.hands[opponent]).reduce((a, b) => a + b, 0);
  score += (oppHand - aiHand) * 3;

  // Queen not placed yet is bad
  if (!state.queenPlaced[aiColor] && state.turnCount[aiColor] >= 2) score -= 20;
  if (!state.queenPlaced[opponent] && state.turnCount[opponent] >= 2) score += 20;

  // Beetles on top of opponent queen are great
  for (const key of Object.keys(state.board)) {
    const stack = state.board[key];
    if (stack.length > 1) {
      const bottom = stack[0];
      const top = stack[stack.length - 1];
      if (bottom.type === 'queen' && bottom.color === opponent && top.color === aiColor) {
        score += 250; // Aggressive: Beetle on opponent queen is extremely good
      }
      if (bottom.type === 'queen' && bottom.color === aiColor && top.color === opponent) {
        score -= 150; // Defensive: Beetle on our queen is bad, but less so than offensive reward
      }
    }
  }

  return score;
}
