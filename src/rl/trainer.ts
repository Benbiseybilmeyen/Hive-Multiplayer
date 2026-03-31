/**
 * DQN Self-Play Trainer
 * Runs self-play games, collects experience, and trains the DQN network.
 */
import { NeuralNetwork } from './dqn';
import { ReplayBuffer } from './replayBuffer';
import { encodeState, moveToActionIndex, createActionMask, STATE_SIZE, ACTION_SIZE } from './stateEncoder';
import { GameState, Move, PlayerColor } from '../types';
import { createInitialState, getAllLegalMoves, applyMove } from '../gameLogic';

export interface RLHyperparams {
  learningRate: number;
  discountFactor: number; // gamma
  epsilonStart: number;
  epsilonEnd: number;
  epsilonDecay: number;  // episodes to decay over
  batchSize: number;
  targetUpdateFreq: number; // episodes between target network updates
  bufferCapacity: number;
  maxStepsPerEpisode: number;
}

export const DEFAULT_HYPERPARAMS: RLHyperparams = {
  learningRate: 0.001,
  discountFactor: 0.95,
  epsilonStart: 1.0,
  epsilonEnd: 0.05,
  epsilonDecay: 500,
  batchSize: 32,
  targetUpdateFreq: 20,
  bufferCapacity: 5000,
  maxStepsPerEpisode: 100,
};

export interface TrainingMetrics {
  episode: number;
  totalSteps: number;
  loss: number;
  epsilon: number;
  avgQValue: number;
  winRate: number;
  drawRate: number;
  lossRate: number;
  rewardSum: number;
  bufferUtilization: number;
  episodesPerSec: number;
  layerActivations: number[][];
  qValueDistribution: number[];
  recentLosses: number[];
  recentRewards: number[];
  winsLast100: number;
  lossesLast100: number;
  drawsLast100: number;
}

export class DQNTrainer {
  policyNet: NeuralNetwork;
  targetNet: NeuralNetwork;
  replayBuffer: ReplayBuffer;
  hyperparams: RLHyperparams;

  episode: number = 0;
  totalSteps: number = 0;
  epsilon: number = 1.0;

  // Tracking
  recentResults: ('win' | 'loss' | 'draw')[] = [];
  recentLosses: number[] = [];
  recentRewards: number[] = [];
  lastLoss: number = 0;
  lastAvgQ: number = 0;
  lastQDist: number[] = [];

  private running: boolean = false;
  private paused: boolean = false;
  private metricsCallback: ((m: TrainingMetrics) => void) | null = null;
  public liveStateCallback: ((s: GameState) => void) | null = null;
  public liveMatchMode: boolean = false;
  private startTime: number = 0;

  constructor(hyperparams: RLHyperparams = DEFAULT_HYPERPARAMS) {
    this.hyperparams = { ...hyperparams };

    const arch = { layers: [STATE_SIZE, 256, 128, 64, ACTION_SIZE] };
    this.policyNet = new NeuralNetwork(arch);
    this.targetNet = this.policyNet.clone();
    this.replayBuffer = new ReplayBuffer(hyperparams.bufferCapacity);
    this.epsilon = hyperparams.epsilonStart;
  }

  onMetrics(cb: (m: TrainingMetrics) => void) {
    this.metricsCallback = cb;
  }

  updateHyperparams(params: Partial<RLHyperparams>) {
    Object.assign(this.hyperparams, params);
  }

  /**
   * Select action using epsilon-greedy policy with action masking
   */
  selectAction(state: GameState, perspective: PlayerColor, legalMoves: Move[]): { move: Move; actionIndex: number } {
    const stateVec = encodeState(state, perspective);
    const mask = createActionMask(legalMoves);

    if (Math.random() < this.epsilon) {
      // Random legal action
      const idx = Math.floor(Math.random() * legalMoves.length);
      return { move: legalMoves[idx], actionIndex: moveToActionIndex(legalMoves[idx]) };
    }

    // Greedy: forward pass + masking
    const qValues = this.policyNet.forward(stateVec);

    // Apply mask
    let bestIdx = 0;
    let bestQ = -Infinity;
    for (let i = 0; i < ACTION_SIZE; i++) {
      const masked = qValues[i] + mask[i];
      if (masked > bestQ) {
        bestQ = masked;
        bestIdx = i;
      }
    }

    // Store Q-value distribution for visualization
    const legalQs: number[] = [];
    for (const move of legalMoves) {
      const ai = moveToActionIndex(move);
      legalQs.push(qValues[ai]);
    }
    this.lastQDist = legalQs.slice(0, 20); // cap at 20 for visualization
    this.lastAvgQ = legalQs.reduce((a, b) => a + b, 0) / legalQs.length;

    // Find the matching legal move
    const matchingMove = legalMoves.find(m => moveToActionIndex(m) === bestIdx) || legalMoves[0];
    return { move: matchingMove, actionIndex: bestIdx };
  }

  /**
   * Compute reward for a transition
   */
  computeReward(state: GameState, perspective: PlayerColor): number {
    if (!state.gameOver) {
      // Partial reward based on queen surroundings
      let reward = 0;
      const opponent: PlayerColor = perspective === 'white' ? 'black' : 'white';

      // Reward surrounding opponent's queen
      const oppQueenSurr = getQueenSurroundCount(state, opponent);
      const myQueenSurr = getQueenSurroundCount(state, perspective);

      reward += oppQueenSurr * 0.05;
      reward -= myQueenSurr * 0.08;

      return reward;
    }

    if (state.winner === perspective) return 1.0;
    if (state.winner === 'draw') return 0.0;
    return -1.0;
  }

  /**
   * Train on a mini-batch from the replay buffer
   */
  trainBatch(): number {
    if (this.replayBuffer.size < this.hyperparams.batchSize) return 0;

    const batch = this.replayBuffer.sample(this.hyperparams.batchSize);

    this.policyNet.zeroGrads();

    let totalLoss = 0;

    for (const t of batch) {
      // Compute target Q values
      const nextQ = this.targetNet.forward(t.nextState);
      const maxNextQ = t.done ? 0 : Math.max(...Array.from(nextQ));
      const targetValue = t.reward + this.hyperparams.discountFactor * maxNextQ;

      // Current Q values
      const currentQ = this.policyNet.forward(t.state);
      const target = new Float32Array(currentQ);
      target[t.action] = targetValue;

      // Train step
      const loss = this.policyNet.trainStep(t.state, target);
      totalLoss += loss;
    }

    this.policyNet.applyGradients(this.hyperparams.learningRate, batch.length);

    return totalLoss / batch.length;
  }

  /**
   * Run one complete self-play episode
   */
  async runEpisode(): Promise<{ result: 'win' | 'loss' | 'draw'; totalReward: number; steps: number }> {
    let state = createInitialState();
    const perspective: PlayerColor = 'white'; // DQN plays as white
    let totalReward = 0;
    let steps = 0;

    // Initial broadcast if live match
    if (this.liveMatchMode && this.liveStateCallback) {
      this.liveStateCallback(state);
      await sleep(500);
    }

    while (!state.gameOver && steps < this.hyperparams.maxStepsPerEpisode) {
      const legalMoves = getAllLegalMoves(state);
      if (legalMoves.length === 0) break;

      const isPerspective = state.currentPlayer === perspective;

      if (isPerspective) {
        const { move, actionIndex } = this.selectAction(state, perspective, legalMoves);
        const stateVec = encodeState(state, perspective);
        const newState = applyMove(state, move);
        const reward = this.computeReward(newState, perspective);
        const nextStateVec = encodeState(newState, perspective);

        this.replayBuffer.push({
          state: stateVec,
          action: actionIndex,
          reward,
          nextState: nextStateVec,
          done: newState.gameOver,
        });

        totalReward += reward;
        state = newState;
      } else {
        // Opponent plays random (or could be another policy)
        const randomIdx = Math.floor(Math.random() * legalMoves.length);
        state = applyMove(state, legalMoves[randomIdx]);
      }

      if (this.liveMatchMode && this.liveStateCallback) {
        this.liveStateCallback(state);
        // During a live match, we want 1.5 seconds per move so humans can see details
        await sleep(1500); 
      }

      steps++;
      this.totalSteps++;

      // Train every step if buffer has enough
      if (this.totalSteps % 4 === 0) {
        const loss = this.trainBatch();
        if (loss > 0) {
          this.lastLoss = loss;
          this.recentLosses.push(loss);
          if (this.recentLosses.length > 200) this.recentLosses.shift();
        }
      }
    }

    // Determine result
    let result: 'win' | 'loss' | 'draw' = 'draw';
    if (state.gameOver) {
      if (state.winner === perspective) result = 'win';
      else if (state.winner === 'draw') result = 'draw';
      else result = 'loss';
    }

    return { result, totalReward, steps };
  }

  /**
   * Decay epsilon
   */
  decayEpsilon() {
    const { epsilonStart, epsilonEnd, epsilonDecay } = this.hyperparams;
    this.epsilon = epsilonEnd + (epsilonStart - epsilonEnd) *
      Math.exp(-this.episode / epsilonDecay);
  }

  /**
   * Emit current training metrics
   */
  emitMetrics() {
    if (!this.metricsCallback) return;

    const elapsed = (Date.now() - this.startTime) / 1000;
    const last100 = this.recentResults.slice(-100);

    const metrics: TrainingMetrics = {
      episode: this.episode,
      totalSteps: this.totalSteps,
      loss: this.lastLoss,
      epsilon: this.epsilon,
      avgQValue: this.lastAvgQ,
      winRate: last100.filter(r => r === 'win').length / Math.max(last100.length, 1),
      drawRate: last100.filter(r => r === 'draw').length / Math.max(last100.length, 1),
      lossRate: last100.filter(r => r === 'loss').length / Math.max(last100.length, 1),
      rewardSum: this.recentRewards.slice(-10).reduce((a, b) => a + b, 0) / 10,
      bufferUtilization: this.replayBuffer.utilization,
      episodesPerSec: this.episode / Math.max(elapsed, 0.001),
      layerActivations: this.policyNet.getLayerActivations(),
      qValueDistribution: this.lastQDist,
      recentLosses: [...this.recentLosses],
      recentRewards: [...this.recentRewards],
      winsLast100: last100.filter(r => r === 'win').length,
      lossesLast100: last100.filter(r => r === 'loss').length,
      drawsLast100: last100.filter(r => r === 'draw').length,
    };

    this.metricsCallback(metrics);
  }

  /**
   * Main training loop — designed to be called in a Web Worker
   */
  async train(onMetrics: (m: TrainingMetrics) => void) {
    this.metricsCallback = onMetrics;
    this.running = true;
    this.paused = false;
    this.startTime = Date.now();

    while (this.running) {
      if (this.paused) {
        await sleep(100);
        continue;
      }

      // Run one episode
      const { result, totalReward } = await this.runEpisode();

      this.episode++;
      this.recentResults.push(result);
      if (this.recentResults.length > 200) this.recentResults.shift();
      this.recentRewards.push(totalReward);
      if (this.recentRewards.length > 200) this.recentRewards.shift();

      // Decay epsilon
      this.decayEpsilon();

      // Update target network periodically
      if (this.episode % this.hyperparams.targetUpdateFreq === 0) {
        this.targetNet.copyFrom(this.policyNet);
      }

      // Emit metrics every episode
      this.emitMetrics();

      // Yield to prevent blocking
      if (this.episode % 2 === 0) {
        await sleep(1);
      }
    }
  }

  stop() {
    this.running = false;
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Serialize weights for persistence */
  saveWeights(): string {
    return this.policyNet.serialize();
  }

  /** Load weights */
  loadWeights(json: string) {
    this.policyNet = NeuralNetwork.deserialize(json);
    this.targetNet = this.policyNet.clone();
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getQueenSurroundCount(state: GameState, color: PlayerColor): number {
  for (const key of Object.keys(state.board)) {
    const stack = state.board[key];
    for (const piece of stack) {
      if (piece.type === 'queen' && piece.color === color) {
        const [q, r] = key.split(',').map(Number);
        const dirs = [
          [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]
        ];
        let count = 0;
        for (const [dq, dr] of dirs) {
          const nk = `${q + dq},${r + dr}`;
          if (state.board[nk] && state.board[nk].length > 0) count++;
        }
        return count;
      }
    }
  }
  return 0;
}
