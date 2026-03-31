import { getAIMove } from './ai';

self.onmessage = (e) => {
  const { state, aiColor, aiDifficulty } = e.data;
  const result = getAIMove(state, aiColor, aiDifficulty);
  self.postMessage(result);
};