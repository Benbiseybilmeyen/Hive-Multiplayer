/**
 * useMultiplayer — React hook for WebSocket multiplayer
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { Move, PlayerColor } from '../types';

export type ConnectionState = 
  | 'disconnected' 
  | 'connecting' 
  | 'connected'     // connected to server, not in a room
  | 'waiting'        // created room, waiting for opponent
  | 'joined'         // joined a room, waiting for game_start
  | 'playing'        // game in progress
  | 'opponent_left'; // opponent disconnected

export interface MultiplayerState {
  connectionState: ConnectionState;
  roomCode: string | null;
  myColor: PlayerColor | null;
  error: string | null;
  serverUrl: string;
}

export interface UseMultiplayerReturn {
  state: MultiplayerState;
  connect: (serverUrl: string) => void;
  disconnect: () => void;
  createRoom: () => void;
  joinRoom: (code: string) => void;
  sendMove: (move: Move) => void;
  sendGameOver: (winner: PlayerColor | 'draw' | null) => void;
  clearError: () => void;
}

export function useMultiplayer(
  onOpponentMove: (move: Move) => void,
  onGameStart: (myColor: PlayerColor) => void,
  onOpponentLeft: () => void,
): UseMultiplayerReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [myColor, setMyColor] = useState<PlayerColor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const onOpponentMoveRef = useRef(onOpponentMove);
  const onGameStartRef = useRef(onGameStart);
  const onOpponentLeftRef = useRef(onOpponentLeft);

  // Keep refs up to date
  useEffect(() => {
    onOpponentMoveRef.current = onOpponentMove;
    onGameStartRef.current = onGameStart;
    onOpponentLeftRef.current = onOpponentLeft;
  }, [onOpponentMove, onGameStart, onOpponentLeft]);

  const send = useCallback((data: object) => {
    console.log('[MP] Attempting to send:', data);
    if (wsRef.current) {
      console.log('[MP] wsRef readyState:', wsRef.current.readyState);
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(data));
        console.log('[MP] Sent successfully');
      } else {
        console.warn('[MP] WebSocket not OPEN');
      }
    } else {
      console.warn('[MP] No wsRef');
    }
  }, []);

  const connect = useCallback((url: string) => {
    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    setServerUrl(url);
    setConnectionState('connecting');
    setError(null);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionState('connected');
        setError(null);
        console.log('[MP] Connected to server');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleMessage(msg);
        } catch (e) {
          console.error('[MP] Failed to parse message:', e);
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          setConnectionState('disconnected');
          wsRef.current = null;
          console.log('[MP] Disconnected from server');
        }
      };

      ws.onerror = () => {
        if (wsRef.current === ws) {
          setError('Sunucuya bağlanılamadı. Sunucunun çalıştığından emin olun.');
          setConnectionState('disconnected');
        }
      };
    } catch {
      setError('Geçersiz sunucu adresi.');
      setConnectionState('disconnected');
    }
  }, []);

  const handleMessage = useCallback((msg: any) => {
    switch (msg.type) {
      case 'room_created':
        setRoomCode(msg.code);
        setMyColor(msg.color);
        setConnectionState('waiting');
        break;

      case 'room_joined':
        setRoomCode(msg.code);
        setMyColor(msg.color);
        setConnectionState('joined');
        break;

      case 'game_start':
        setMyColor(msg.yourColor);
        setConnectionState('playing');
        onGameStartRef.current(msg.yourColor);
        break;

      case 'opponent_move':
        onOpponentMoveRef.current(msg.move);
        break;

      case 'move_ack':
        // Move acknowledged by server
        break;

      case 'opponent_left':
        setConnectionState('opponent_left');
        onOpponentLeftRef.current();
        break;

      case 'game_over':
        // Opponent reported game over
        break;

      case 'error':
        setError(msg.message);
        break;

      default:
        console.warn('[MP] Unknown message type:', msg.type);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      send({ type: 'leave' });
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionState('disconnected');
    setRoomCode(null);
    setMyColor(null);
    setError(null);
  }, [send]);

  const createRoom = useCallback(() => {
    send({ type: 'create_room' });
  }, [send]);

  const joinRoom = useCallback((code: string) => {
    send({ type: 'join_room', code: code.toUpperCase().trim() });
  }, [send]);

  const sendMove = useCallback((move: Move) => {
    send({ type: 'move', move });
  }, [send]);

  const sendGameOver = useCallback((winner: PlayerColor | 'draw' | null) => {
    send({ type: 'game_over', winner });
  }, [send]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    state: {
      connectionState,
      roomCode,
      myColor,
      error,
      serverUrl,
    },
    connect,
    disconnect,
    createRoom,
    joinRoom,
    sendMove,
    sendGameOver,
    clearError,
  };
}
