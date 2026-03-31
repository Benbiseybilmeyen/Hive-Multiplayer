/**
 * Experience Replay Buffer
 * Circular buffer storing (state, action, reward, nextState, done) transitions.
 */

export interface Transition {
  state: Float32Array;
  action: number;
  reward: number;
  nextState: Float32Array;
  done: boolean;
}

export class ReplayBuffer {
  capacity: number;
  buffer: Transition[];
  position: number;
  size: number;

  constructor(capacity: number = 5000) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
    this.position = 0;
    this.size = 0;
  }

  push(transition: Transition) {
    this.buffer[this.position] = transition;
    this.position = (this.position + 1) % this.capacity;
    this.size = Math.min(this.size + 1, this.capacity);
  }

  sample(batchSize: number): Transition[] {
    const batch: Transition[] = [];
    const indices = new Set<number>();

    const actualBatch = Math.min(batchSize, this.size);
    while (indices.size < actualBatch) {
      indices.add(Math.floor(Math.random() * this.size));
    }

    for (const idx of indices) {
      batch.push(this.buffer[idx]);
    }

    return batch;
  }

  get utilization(): number {
    return this.size / this.capacity;
  }

  clear() {
    this.position = 0;
    this.size = 0;
  }
}
