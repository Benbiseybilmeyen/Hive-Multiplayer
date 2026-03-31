/**
 * Deep Q-Network — Pure TypeScript Neural Network
 * No external ML dependencies. Uses Float32Array for performance.
 */

// ─── Layer ──────────────────────────────────────────────────────────────────

interface LayerConfig {
  inputSize: number;
  outputSize: number;
}

class DenseLayer {
  weights: Float32Array;   // inputSize × outputSize (row-major)
  biases: Float32Array;    // outputSize
  inputSize: number;
  outputSize: number;

  // Cached for backprop
  lastInput: Float32Array | null = null;
  lastPreActivation: Float32Array | null = null;
  lastOutput: Float32Array | null = null;

  // Gradients
  weightGrads: Float32Array;
  biasGrads: Float32Array;

  constructor(config: LayerConfig) {
    this.inputSize = config.inputSize;
    this.outputSize = config.outputSize;
    this.weights = new Float32Array(config.inputSize * config.outputSize);
    this.biases = new Float32Array(config.outputSize);
    this.weightGrads = new Float32Array(config.inputSize * config.outputSize);
    this.biasGrads = new Float32Array(config.outputSize);

    // He initialization
    const scale = Math.sqrt(2.0 / config.inputSize);
    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] = gaussianRandom() * scale;
    }
  }

  forward(input: Float32Array, applyRelu: boolean): Float32Array {
    this.lastInput = new Float32Array(input);
    const output = new Float32Array(this.outputSize);

    for (let j = 0; j < this.outputSize; j++) {
      let sum = this.biases[j];
      for (let i = 0; i < this.inputSize; i++) {
        sum += input[i] * this.weights[i * this.outputSize + j];
      }
      output[j] = sum;
    }

    this.lastPreActivation = new Float32Array(output);

    if (applyRelu) {
      for (let j = 0; j < this.outputSize; j++) {
        output[j] = Math.max(0, output[j]);
      }
    }

    this.lastOutput = new Float32Array(output);
    return output;
  }

  backward(gradOutput: Float32Array, applyRelu: boolean): Float32Array {
    const gradInput = new Float32Array(this.inputSize);

    // Apply ReLU derivative
    const grad = new Float32Array(this.outputSize);
    for (let j = 0; j < this.outputSize; j++) {
      grad[j] = applyRelu
        ? (this.lastPreActivation![j] > 0 ? gradOutput[j] : 0)
        : gradOutput[j];
    }

    // Weight gradients: dW = input^T × grad
    for (let i = 0; i < this.inputSize; i++) {
      for (let j = 0; j < this.outputSize; j++) {
        this.weightGrads[i * this.outputSize + j] += this.lastInput![i] * grad[j];
      }
    }

    // Bias gradients
    for (let j = 0; j < this.outputSize; j++) {
      this.biasGrads[j] += grad[j];
    }

    // Input gradients: dX = grad × W^T
    for (let i = 0; i < this.inputSize; i++) {
      let sum = 0;
      for (let j = 0; j < this.outputSize; j++) {
        sum += grad[j] * this.weights[i * this.outputSize + j];
      }
      gradInput[i] = sum;
    }

    return gradInput;
  }

  applyGradients(lr: number, batchSize: number) {
    const scale = lr / batchSize;
    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] -= this.weightGrads[i] * scale;
      this.weightGrads[i] = 0;
    }
    for (let j = 0; j < this.biases.length; j++) {
      this.biases[j] -= this.biasGrads[j] * scale;
      this.biasGrads[j] = 0;
    }
  }

  zeroGrads() {
    this.weightGrads.fill(0);
    this.biasGrads.fill(0);
  }

  clone(): DenseLayer {
    const layer = new DenseLayer({ inputSize: this.inputSize, outputSize: this.outputSize });
    layer.weights.set(this.weights);
    layer.biases.set(this.biases);
    return layer;
  }
}

// ─── Neural Network ─────────────────────────────────────────────────────────

export interface NetworkArchitecture {
  layers: number[]; // e.g. [128, 256, 128, 64, outputSize]
}

export class NeuralNetwork {
  layers: DenseLayer[];
  architecture: NetworkArchitecture;

  constructor(arch: NetworkArchitecture) {
    this.architecture = arch;
    this.layers = [];
    for (let i = 0; i < arch.layers.length - 1; i++) {
      this.layers.push(new DenseLayer({
        inputSize: arch.layers[i],
        outputSize: arch.layers[i + 1],
      }));
    }
  }

  forward(input: Float32Array): Float32Array {
    let x = input;
    for (let i = 0; i < this.layers.length; i++) {
      const isLast = i === this.layers.length - 1;
      x = this.layers[i].forward(x, !isLast); // ReLU on all except last
    }
    return x;
  }

  /**
   * Compute loss and backpropagate gradients. 
   * Returns MSE loss.
   */
  trainStep(input: Float32Array, target: Float32Array): number {
    const output = this.forward(input);

    // MSE loss
    let loss = 0;
    const gradOutput = new Float32Array(output.length);
    for (let i = 0; i < output.length; i++) {
      const diff = output[i] - target[i];
      loss += diff * diff;
      gradOutput[i] = 2 * diff / output.length; // d(MSE)/d(output)
    }
    loss /= output.length;

    // Backprop through layers in reverse
    let grad = gradOutput;
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const isLast = i === this.layers.length - 1;
      grad = this.layers[i].backward(grad, !isLast);
    }

    return loss;
  }

  applyGradients(lr: number, batchSize: number) {
    for (const layer of this.layers) {
      layer.applyGradients(lr, batchSize);
    }
  }

  zeroGrads() {
    for (const layer of this.layers) {
      layer.zeroGrads();
    }
  }

  clone(): NeuralNetwork {
    const net = new NeuralNetwork(this.architecture);
    for (let i = 0; i < this.layers.length; i++) {
      net.layers[i] = this.layers[i].clone();
    }
    return net;
  }

  copyFrom(other: NeuralNetwork) {
    for (let i = 0; i < this.layers.length; i++) {
      this.layers[i].weights.set(other.layers[i].weights);
      this.layers[i].biases.set(other.layers[i].biases);
    }
  }

  // ─── Serialization ─────────────────────────────────────────────────────

  serialize(): string {
    const data = {
      arch: this.architecture,
      weights: this.layers.map(l => ({
        w: Array.from(l.weights),
        b: Array.from(l.biases),
      })),
    };
    return JSON.stringify(data);
  }

  static deserialize(json: string): NeuralNetwork {
    const data = JSON.parse(json);
    const net = new NeuralNetwork(data.arch);
    for (let i = 0; i < net.layers.length; i++) {
      net.layers[i].weights = new Float32Array(data.weights[i].w);
      net.layers[i].biases = new Float32Array(data.weights[i].b);
    }
    return net;
  }

  /** Total parameter count */
  get paramCount(): number {
    return this.layers.reduce((sum, l) => sum + l.weights.length + l.biases.length, 0);
  }

  /** Get layer activation magnitudes for visualization */
  getLayerActivations(): number[][] {
    return this.layers.map(l => {
      if (!l.lastOutput) return [];
      const activations: number[] = [];
      const out = l.lastOutput;
      // Sample up to 16 neurons for visualization
      const step = Math.max(1, Math.floor(out.length / 16));
      for (let i = 0; i < out.length; i += step) {
        activations.push(out[i]);
      }
      return activations;
    });
  }
}

// ─── Utility ────────────────────────────────────────────────────────────────

function gaussianRandom(): number {
  // Box-Muller transform
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
