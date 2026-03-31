export type PieceType = 'queen' | 'beetle' | 'spider' | 'grasshopper' | 'ant';
export type PlayerColor = 'black' | 'white';

export type GameMode = 'local' | 'remote' | 'ai';
export type AIDifficulty = 'novice' | 'intermediate' | 'expert' | 'grandmaster';
export type Theme = 'modern' | 'wood' | 'minimalist';
export type PieceStyle = 'emoji' | 'stick' | 'tribal' | 'neon' | 'rune';

export interface MoveRecord {
  move: Move;
  evaluation?: number;
  isBlunder?: boolean;
  isBest?: boolean;
  state: GameState;
}

export interface Piece {
  type: PieceType;
  color: PlayerColor;
  id: string;
}

export interface HexPos {
  q: number;
  r: number;
}

export interface GameState {
  // board maps "q,r" -> stack of pieces (bottom to top)
  board: Record<string, Piece[]>;
  currentPlayer: PlayerColor;
  hands: Record<PlayerColor, Record<PieceType, number>>;
  turnCount: Record<PlayerColor, number>; // how many pieces placed so far
  queenPlaced: Record<PlayerColor, boolean>;
  gameOver: boolean;
  winner: PlayerColor | 'draw' | null;
  moveCount: number; // total moves for draw detection
  lastMoves: string[]; // for repetition detection
  history?: MoveRecord[]; // History array to store past states and eval.
}

export interface Move {
  type: 'place' | 'move' | 'pass';
  pieceType?: PieceType;
  from?: HexPos;
  to?: HexPos;
}

export const PIECE_NAMES: Record<PieceType, string> = {
  queen: 'Kraliçe Arı',
  beetle: 'Böcek',
  spider: 'Örümcek',
  grasshopper: 'Çekirge',
  ant: 'Asker Karınca',
};

export const PIECE_EMOJI: Record<PieceType, string> = {
  queen: '👑',
  beetle: '🪲',
  spider: '🕷️',
  grasshopper: '🦗',
  ant: '🐜',
};

export const INITIAL_HAND: Record<PieceType, number> = {
  queen: 1,
  beetle: 2,
  spider: 2,
  grasshopper: 3,
  ant: 3,
};

// Axial hex directions (flat-top)
export const HEX_DIRS: HexPos[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];
