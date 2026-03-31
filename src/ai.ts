import { GameState, Move, PlayerColor, AIDifficulty } from './types';
import { getAllLegalMoves, applyMove, evaluateState } from './gameLogic';

export interface AIMoveResult {
  move: Move;
  evaluation: number;
  isBest?: boolean;
  isBlunder?: boolean;
}

function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  aiColor: PlayerColor
): number {
  if (depth === 0 || state.gameOver) {
    return evaluateState(state, aiColor);
  }

  const moves = getAllLegalMoves(state);

  if (maximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const newState = applyMove(state, move);
      const eval_ = minimax(newState, depth - 1, alpha, beta, newState.currentPlayer === aiColor, aiColor);
      maxEval = Math.max(maxEval, eval_);
      alpha = Math.max(alpha, eval_);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const newState = applyMove(state, move);
      const eval_ = minimax(newState, depth - 1, alpha, beta, newState.currentPlayer === aiColor, aiColor);
      minEval = Math.min(minEval, eval_);
      beta = Math.min(beta, eval_);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

export function getAIMove(state: GameState, aiColor: PlayerColor, difficulty: AIDifficulty = 'intermediate'): AIMoveResult {
  const moves = getAllLegalMoves(state);

  if (moves.length === 0 || (moves.length === 1 && moves[0].type === 'pass')) {
    return { move: { type: 'pass' }, evaluation: 0 };
  }

  const validMoves = moves.filter(m => m.type !== 'pass').length > 0 ? moves.filter(m => m.type !== 'pass') : moves;

  // Determine depth based on difficulty
  let depth = 1;
  if (difficulty === 'novice') depth = 0; // Pure random/greedy
  else if (difficulty === 'intermediate') depth = 1;
  else if (difficulty === 'expert') depth = 2;
  else if (difficulty === 'grandmaster') depth = 3;

  // Dynamic depth reduction for performance on very complex boards
  if (validMoves.length > 50 && depth > 1) depth -= 1;
  if (validMoves.length > 80 && depth > 1) depth -= 1;

  let bestMove = validMoves[0];
  let bestScore = -Infinity;
  const evaluatedMoves: { move: Move, score: number }[] = [];

  for (const move of validMoves) {
    const newState = applyMove(state, move);
    let score = 0;
    
    if (depth === 0) {
      // Novice just evaluates immediate state
      score = evaluateState(newState, aiColor) + (Math.random() * 50); // High randomness
    } else {
      score = minimax(
        newState,
        depth - 1,
        -Infinity,
        Infinity,
        newState.currentPlayer === aiColor,
        aiColor
      );
      // Small random factor to prevent deterministic loops
      score += (Math.random() * 2 - 1);
    }

    evaluatedMoves.push({ move, score });

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  // Blunder check (optional logic)
  // Sort moves descending by score
  evaluatedMoves.sort((a, b) => b.score - a.score);
  
  // A simple way to simulate a blunder when playing as novice or intermediate:
  // occasionally don't pick the absolute best move.
  if (difficulty === 'novice' && evaluatedMoves.length > 2) {
    if (Math.random() > 0.3) {
      bestMove = evaluatedMoves[Math.floor(Math.random() * Math.min(3, evaluatedMoves.length))].move;
      bestScore = evaluatedMoves.find(m => m.move === bestMove)!.score;
    }
  }

  return {
    move: bestMove,
    evaluation: bestScore,
    isBest: bestMove === evaluatedMoves[0].move,
    isBlunder: bestScore < evaluatedMoves[0].score - 100 // Example threshold for blunder
  };
}
