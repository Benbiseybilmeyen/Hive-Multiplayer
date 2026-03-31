/**
 * RL Training Web Worker
 * Runs DQN self-play training off the main thread.
 */
import { DQNTrainer, DEFAULT_HYPERPARAMS, TrainingMetrics, RLHyperparams } from './trainer';

let trainer: DQNTrainer | null = null;

self.onmessage = (e: MessageEvent) => {
  const { command, payload } = e.data;

  switch (command) {
    case 'start': {
      const params = payload?.hyperparams || DEFAULT_HYPERPARAMS;
      trainer = new DQNTrainer(params);

      // Check for saved weights
      if (payload?.savedWeights) {
        try {
          trainer.loadWeights(payload.savedWeights);
        } catch (e) {
          console.warn('Failed to load saved weights:', e);
        }
      }

      trainer.liveStateCallback = (state: any) => {
        self.postMessage({ type: 'live_state', data: state });
      };

      trainer.train((metrics: TrainingMetrics) => {
        self.postMessage({ type: 'metrics', data: metrics });
      });
      break;
    }

    case 'stop': {
      if (trainer) {
        trainer.stop();
        // Send final weights for persistence
        const weights = trainer.saveWeights();
        self.postMessage({ type: 'weights', data: weights });
        self.postMessage({ type: 'stopped' });
        trainer = null;
      }
      break;
    }

    case 'pause': {
      if (trainer) {
        trainer.pause();
        self.postMessage({ type: 'paused' });
      }
      break;
    }

    case 'resume': {
      if (trainer) {
        trainer.resume();
        self.postMessage({ type: 'resumed' });
      }
      break;
    }

    case 'getWeights': {
      if (trainer) {
        self.postMessage({ type: 'weights', data: trainer.saveWeights() });
      }
      break;
    }

    case 'setHyperparams': {
      if (trainer && payload) {
        trainer.updateHyperparams(payload as Partial<RLHyperparams>);
        self.postMessage({ type: 'hyperparams_updated' });
      }
      break;
    }

    case 'setLiveMatchMode': {
      if (trainer) {
        trainer.liveMatchMode = payload.enabled;
        self.postMessage({ type: 'live_mode_updated', enabled: payload.enabled });
      }
      break;
    }
  }
};
