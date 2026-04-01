import { useState, useCallback, useEffect, useRef } from 'react';
import {
  GameState, HexPos, PieceType, PlayerColor,
  PIECE_NAMES, PIECE_EMOJI, Move, AIDifficulty, MoveRecord, GameMode, PieceStyle
} from './types';
import {
  createInitialState, getAllLegalMoves, applyMove,
  getPlacementPositions, getMovesForPiece, posKey, keyToPos, getTopPiece, evaluateState
} from './gameLogic';
import { AIMoveResult } from './ai';
import HexBoard from './components/HexBoard';
import PieceIcon, { PIECE_ACCENT } from './components/PieceIcon';
import RemoteLobby from './components/RemoteLobby';
import { useMultiplayer } from './hooks/useMultiplayer';
import { Brain, Settings, Users, Globe, ChevronLeft, ChevronRight, Activity, Target, Clock, Trash2, Maximize, Minimize } from 'lucide-react';

// ─── Match History persistence ──────────────────────────
interface MatchRecord {
  id: string;
  date: string;
  mode: GameMode;
  difficulty?: AIDifficulty;
  winner: PlayerColor | 'draw' | null;
  totalMoves: number;
  theme: string;
  moves?: Move[];
}

function loadMatchHistory(): MatchRecord[] {
  try {
    const raw = localStorage.getItem('hive_match_history');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveMatchHistory(records: MatchRecord[]) {
  localStorage.setItem('hive_match_history', JSON.stringify(records));
}

function App() {
  const [appState, setAppState] = useState<'menu' | 'playing' | 'post_match' | 'remote_lobby'>('menu');
  const [menuTab, setMenuTab] = useState<'play' | 'history'>('play');
  const [gameMode, setGameMode] = useState<GameMode>('local');
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('intermediate');
  const [theme, setTheme] = useState<'modern' | 'wood' | 'minimalist'>('modern');
  const [pieceStyle, setPieceStyle] = useState<PieceStyle>(
    (localStorage.getItem('hive_piece_style') as PieceStyle) || 'emoji'
  );
  
  useEffect(() => {
    localStorage.setItem('hive_piece_style', pieceStyle);
  }, [pieceStyle]);
  
  const [state, setState] = useState<GameState>(createInitialState());
  const [history, setHistory] = useState<MoveRecord[]>([]);
  const [replayIndex, setReplayIndex] = useState<number>(-1);
  const [matchHistory, setMatchHistory] = useState<MatchRecord[]>(loadMatchHistory());

  const [selectedHandPiece, setSelectedHandPiece] = useState<PieceType | null>(null);
  const [selectedBoardPiece, setSelectedBoardPiece] = useState<string | null>(null);
  const [validPlacements, setValidPlacements] = useState<HexPos[]>([]);
  const [validMoves, setValidMoves] = useState<HexPos[]>([]);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiTimer, setAiTimer] = useState(10);
  const [aiColor] = useState<PlayerColor>('black');
  const [message, setMessage] = useState('');
  const [myRemoteColor, setMyRemoteColor] = useState<PlayerColor | null>(null);
  
  const [isFullscreen, setIsFullscreen] = useState(false);

  const aiTimeoutRef = useRef<number | null>(null);
  const aiIntervalRef = useRef<number | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // Initialize Web Worker
  useEffect(() => {
    workerRef.current = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' });
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // Apply theme class to root
  useEffect(() => {
    document.body.className = `theme-${theme}`;
  }, [theme]);

  const clearSelection = useCallback(() => {
    setSelectedHandPiece(null);
    setSelectedBoardPiece(null);
    setValidPlacements([]);
    setValidMoves([]);
  }, []);

  const startGame = useCallback((mode: GameMode) => {
    setState(createInitialState());
    setHistory([]);
    setReplayIndex(-1);
    setGameMode(mode);
    setAppState('playing');
    clearSelection();
    setMessage('Oyun başladı.');
    setAiThinking(false);
  }, [clearSelection]);

  // Save match result when game ends
  const saveMatchResult = useCallback((finalState: GameState, matchHistoryMoves: Move[]) => {
    const record: MatchRecord = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      mode: gameMode,
      difficulty: gameMode === 'ai' ? aiDifficulty : undefined,
      winner: finalState.winner,
      totalMoves: finalState.moveCount,
      theme,
      moves: matchHistoryMoves
    };
    const updated = [record, ...matchHistory].slice(0, 50); // keep last 50
    setMatchHistory(updated);
    saveMatchHistory(updated);
  }, [gameMode, aiDifficulty, theme, matchHistory]);

  // ─── Multiplayer Hook ─────────────────────────────────────
  const handleOpponentMove = useCallback((move: Move) => {
    setState(prev => {
      const newState = applyMove(prev, move);
      const record: MoveRecord = {
        move,
        evaluation: evaluateState(newState, 'black'),
        state: newState
      };
      setHistory(prevHistory => {
        const newHistory = [...prevHistory, record];
        if (newState.gameOver) {
          saveMatchResult(newState, newHistory.map(r => r.move));
          setTimeout(() => {
            setAppState('post_match');
            setReplayIndex(newHistory.length - 1);
          }, 2000);
        }
        return newHistory;
      });

      if (move.type === 'pass') {
        setMessage(`Rakip pas geçti.`);
      } else if (move.type === 'place') {
        setMessage(`Rakip ${PIECE_NAMES[move.pieceType!]} yerleştirdi.`);
      } else {
        setMessage(`Rakip ${PIECE_NAMES[move.pieceType!]} hareket ettirdi.`);
      }

      return newState;
    });
    clearSelection();
  }, [clearSelection, saveMatchResult]);

  const handleGameStart = useCallback((myColor: PlayerColor) => {
    setMyRemoteColor(myColor);
    setState(createInitialState());
    setHistory([]);
    setReplayIndex(-1);
    setGameMode('remote');
    setAppState('playing');
    clearSelection();
    if (myColor === 'white') {
      setMessage('Oyun başladı! Sıra sizde (Beyaz).');
    } else {
      setMessage('Oyun başladı! Rakibiniz (Beyaz) başlıyor.');
    }
  }, [clearSelection]);

  const handleOpponentLeft = useCallback(() => {
    setMessage('Rakip oyundan ayrıldı!');
  }, []);

  const multiplayer = useMultiplayer(handleOpponentMove, handleGameStart, handleOpponentLeft);

  // Handle move execution
  const executeMove = useCallback((move: Move, aiResult?: AIMoveResult, currentState?: GameState) => {
    const targetState = currentState || state;
    const newState = applyMove(targetState, move);
    
    const record: MoveRecord = {
      move,
      evaluation: aiResult?.evaluation ?? evaluateState(newState, 'black'),
      isBlunder: aiResult?.isBlunder,
      isBest: aiResult?.isBest,
      state: newState
    };

    setHistory(prev => [...prev, record]);
    setState(newState);
    clearSelection();
    
    if (move.type === 'pass') {
      setMessage(`${targetState.currentPlayer === 'white' ? 'Beyaz' : 'Siyah'} pas geçti.`);
    } else if (move.type === 'place') {
      setMessage(`${targetState.currentPlayer === 'white' ? 'Beyaz' : 'Siyah'} ${PIECE_NAMES[move.pieceType!]} yerleştirdi.`);
    } else {
      setMessage(`${targetState.currentPlayer === 'white' ? 'Beyaz' : 'Siyah'} ${PIECE_NAMES[move.pieceType!]} hareket ettirdi.`);
    }

    // Send move to remote opponent first, so they process it before room is closed
    if (gameMode === 'remote') {
      multiplayer.sendMove(move);
    }

    if (newState.gameOver) {
      saveMatchResult(newState, [...history, record].map(r => r.move));
      if (gameMode === 'remote') {
        multiplayer.sendGameOver(newState.winner);
      }
      setTimeout(() => {
        setAppState('post_match');
        setHistory(currentHistory => {
          setReplayIndex(currentHistory.length - 1);
          return currentHistory;
        });
      }, 2000);
    }
  }, [state, history, clearSelection, saveMatchResult, gameMode, multiplayer]);

  // AI Turn (Strict 10s limits)
  const isAiThinkingRef = useRef(false);

  useEffect(() => {
    if (
      appState === 'playing' &&
      gameMode === 'ai' &&
      state.currentPlayer === aiColor &&
      !state.gameOver &&
      !isAiThinkingRef.current
    ) {
      isAiThinkingRef.current = true;
      setAiThinking(true);
      setAiTimer(10);
      clearSelection();
      setMessage(`Yapay Zeka (${aiDifficulty}) düşünüyor...`);

      if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);
      aiIntervalRef.current = window.setInterval(() => {
        setAiTimer((prev) => Math.max(0, prev - 1));
      }, 1000);

      const capturedState = state;

      aiTimeoutRef.current = window.setTimeout(() => {
        const startTime = performance.now();
        
        if (workerRef.current) {
          workerRef.current.postMessage({ state: capturedState, aiColor, aiDifficulty });
          
          let forceTimeout = window.setTimeout(() => {
            console.log("AI timeout fallback triggered");
            workerRef.current?.terminate();
            workerRef.current = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' });
            
            isAiThinkingRef.current = false;
            setAiThinking(false);
            setAiTimer(0);
            if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);
            executeMove({ type: 'pass' });
          }, 11000);

          workerRef.current.onmessage = (e) => {
            clearTimeout(forceTimeout);
            const result = e.data;
            const endTime = performance.now();
            const elapsed = endTime - startTime;
            
            const delay = Math.max(0, 1500 - elapsed);
            setTimeout(() => {
              if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);
              
              isAiThinkingRef.current = false;
              setAiThinking(false);
              setAiTimer(0);
              executeMove(result.move, result, capturedState);
            }, delay);
          };
        }
      }, 100);
    }

    if (appState !== 'playing' || gameMode !== 'ai' || state.gameOver) {
      isAiThinkingRef.current = false;
    }

    return () => {};
  }, [state, appState, gameMode, aiColor, aiDifficulty, clearSelection, executeMove]);

  // ─── BUG FIX: Piece placement from hand ───
  // When a hand piece is clicked, immediately show valid placement positions.
  // If the queen must be placed (turn 4 rule), highlight that requirement
  // but don't block selection — instead, auto-select queen.
  const handleHandPieceClick = useCallback((pieceType: PieceType) => {
    if (state.gameOver || appState !== 'playing') return;
    if (gameMode === 'ai' && state.currentPlayer === aiColor) return;
    if (gameMode === 'remote' && myRemoteColor && state.currentPlayer !== myRemoteColor) return;

    const hand = state.hands[state.currentPlayer];
    if (hand[pieceType] <= 0) return;

    const tc = state.turnCount[state.currentPlayer];
    const mustPlaceQueen = tc === 3 && !state.queenPlaced[state.currentPlayer];
    
    // If queen must be placed and user clicked a non-queen piece,
    // auto-select the queen and show a warning message
    if (mustPlaceQueen && pieceType !== 'queen') {
      const placements = getPlacementPositions(state, state.currentPlayer);
      setSelectedHandPiece('queen');
      setSelectedBoardPiece(null);
      setValidPlacements(placements);
      setValidMoves([]);
      setMessage('⚠️ 4. turda Kraliçe Arı yerleştirilmeli! Otomatik seçildi.');
      return;
    }

    if (selectedHandPiece === pieceType) {
      clearSelection();
      return;
    }

    const placements = getPlacementPositions(state, state.currentPlayer);
    setSelectedHandPiece(pieceType);
    setSelectedBoardPiece(null);
    setValidPlacements(placements);
    setValidMoves([]);
    setMessage(`${PIECE_NAMES[pieceType]} seçildi. Yerleştirme noktası seçin.`);
  }, [state, selectedHandPiece, clearSelection, gameMode, aiColor, myRemoteColor, appState]);

  const handleBoardPieceClick = useCallback((key: string) => {
    if (state.gameOver || appState !== 'playing') return;
    if (gameMode === 'ai' && state.currentPlayer === aiColor) return;
    if (gameMode === 'remote' && myRemoteColor && state.currentPlayer !== myRemoteColor) return;

    const pos = keyToPos(key);

    // If a piece is already selected and this clicked position is a valid destination, execute move
    if (selectedBoardPiece && validMoves.some(p => posKey(p.q, p.r) === key)) {
      const from = keyToPos(selectedBoardPiece);
      const topPieceForMove = getTopPiece(state, selectedBoardPiece);
      executeMove({ type: 'move', from, to: pos, pieceType: topPieceForMove?.type });
      return;
    }

    // If hand piece selected, try to place on this same hex (would only work for beetle-climb scenarios after existing piece) —
    // normally shouldn't happen, but handle gracefully
    if (selectedHandPiece && validPlacements.some(p => posKey(p.q, p.r) === key)) {
      executeMove({ type: 'place', pieceType: selectedHandPiece, to: pos });
      return;
    }

    const topPiece = getTopPiece(state, key);
    if (!topPiece || topPiece.color !== state.currentPlayer) return;

    if (!state.queenPlaced[state.currentPlayer]) {
      setMessage('⚠️ Kraliçe Arı yerleştirilmeden taşlar hareket edemez!');
      return;
    }

    if (selectedBoardPiece === key) {
      clearSelection();
      return;
    }

    const movePos = keyToPos(key);
    const moves = getMovesForPiece(state, movePos);

    if (moves.length === 0) {
      setMessage('Bu taş kovan bütünlüğü veya dar alan sebebiyle kilitli.');
      return;
    }

    setSelectedBoardPiece(key);
    setSelectedHandPiece(null);
    setValidPlacements([]);
    setValidMoves(moves);
    setMessage(`${PIECE_NAMES[topPiece.type]} seçildi. Hedef altıgen seçin.`);
  }, [state, selectedBoardPiece, selectedHandPiece, validMoves, validPlacements, clearSelection, gameMode, aiColor, myRemoteColor, appState, executeMove]);

  const handleHexClick = useCallback((pos: HexPos) => {
    if (state.gameOver || appState !== 'playing') return;
    if (gameMode === 'ai' && state.currentPlayer === aiColor) return;
    if (gameMode === 'remote' && myRemoteColor && state.currentPlayer !== myRemoteColor) return;

    const key = posKey(pos.q, pos.r);

    if (selectedHandPiece && validPlacements.some(p => posKey(p.q, p.r) === key)) {
      executeMove({ type: 'place', pieceType: selectedHandPiece, to: pos });
      return;
    }

    if (selectedBoardPiece && validMoves.some(p => posKey(p.q, p.r) === key)) {
      const from = keyToPos(selectedBoardPiece);
      const topPiece = getTopPiece(state, selectedBoardPiece);
      executeMove({ type: 'move', from, to: pos, pieceType: topPiece?.type });
      return;
    }
  }, [state, selectedHandPiece, selectedBoardPiece, validPlacements, validMoves, gameMode, aiColor, myRemoteColor, appState, executeMove]);

  const handlePass = useCallback(() => {
    if (state.gameOver || appState !== 'playing') return;
    if (gameMode === 'ai' && state.currentPlayer === aiColor) return;
    if (gameMode === 'remote' && myRemoteColor && state.currentPlayer !== myRemoteColor) return;

    const moves = getAllLegalMoves(state);
    if (moves.length === 1 && moves[0].type === 'pass') {
      executeMove({ type: 'pass' });
    }
  }, [state, gameMode, aiColor, myRemoteColor, appState, executeMove]);

  // Derived state
  const isPlayerTurn = (gameMode !== 'ai' || state.currentPlayer !== aiColor) && (gameMode !== 'remote' || state.currentPlayer === myRemoteColor);
  const legalMoves = !state.gameOver ? getAllLegalMoves(state) : [];
  const canPass = legalMoves.length === 1 && legalMoves[0].type === 'pass';
  
  const displayState = appState === 'post_match' && replayIndex >= 0 
    ? history[replayIndex]?.state ?? createInitialState() 
    : state;

  // Render Hand UI
  const renderHand = (color: PlayerColor) => {
    const hand = displayState.hands[color];
    const isActive = displayState.currentPlayer === color && isPlayerTurn && !displayState.gameOver && appState === 'playing';
    const colorLabel = color === 'white' ? 'Beyaz' : 'Siyah';
    const tc = displayState.turnCount[color];
    const mustPlaceQueen = tc === 3 && !displayState.queenPlaced[color] && isActive;

    return (
      <div className={`p-4 rounded-2xl border backdrop-blur-xl transition-all duration-300 ${
        displayState.currentPlayer === color 
          ? 'glass-card-active' 
          : 'glass-card'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded-full shadow-lg ${color === 'white' ? 'bg-gradient-to-br from-white to-slate-200 border border-slate-300' : 'bg-gradient-to-br from-indigo-900 to-slate-900 border border-indigo-700'}`} />
            <span className="font-bold text-[var(--text-primary)] text-sm tracking-wide">
              {colorLabel} {gameMode === 'ai' && color === aiColor ? '(AI)' : ''}
            </span>
          </div>
          {displayState.currentPlayer === color && !displayState.gameOver && appState === 'playing' && (
            <div className="flex items-center gap-2">
              {gameMode === 'ai' && color === aiColor && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${aiTimer <= 3 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'} transition-colors`}>
                  ⏱ {aiTimer}s
                </span>
              )}
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 animate-pulse">
                 AKTİF
              </span>
            </div>
          )}
        </div>

        {mustPlaceQueen && (
          <div className="mb-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-medium text-center animate-float-up">
            ⚠ Kraliçe Arı bu turda yerleştirilmeli!
          </div>
        )}

        <div className="flex flex-row md:flex-col gap-2 overflow-x-auto pb-1 md:pb-0 items-stretch [&::-webkit-scrollbar]:hidden">
          {(Object.keys(hand) as PieceType[]).map(pt => {
            const count = hand[pt];
            const isSelected = selectedHandPiece === pt && displayState.currentPlayer === color;
            const disabled = !isActive || count === 0;
            const isQueenForced = mustPlaceQueen && pt !== 'queen';

            return (
              <button
                key={pt}
                onClick={() => handleHandPieceClick(pt)}
                disabled={disabled}
                className={`flex-none min-w-[130px] md:min-w-0 flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all duration-200 ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text-primary)] shadow-[0_0_12px_var(--accent-glow)]'
                    : disabled
                    ? 'border-transparent bg-black/10 text-[var(--text-secondary)] cursor-not-allowed opacity-40'
                    : isQueenForced
                    ? 'border-amber-500/20 bg-amber-500/5 text-amber-400/60 opacity-50 cursor-not-allowed'
                    : 'border-[var(--panel-border)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/5 bg-black/20 text-[var(--text-primary)]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-6 rounded-full" style={{ background: PIECE_ACCENT[pt] }} />
                  <div className="w-6 h-6 flex items-center justify-center filter drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                    {pieceStyle === 'emoji' ? (
                      <span className="text-xl">{PIECE_EMOJI[pt]}</span>
                    ) : (
                      <svg width="32" height="32" viewBox="-20 -20 40 40" overflow="visible">
                        <PieceIcon type={pt} pieceStyle={pieceStyle} color={color} isTop={true} />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs font-semibold tracking-wide">{PIECE_NAMES[pt]}</span>
                </div>
                <span className={`text-[10px] font-bold w-6 h-6 flex items-center justify-center rounded-full transition-colors ${
                  count > 0 ? 'bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/20' : 'bg-gray-800/50 text-gray-600'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Delete match from history ──
  const deleteMatch = useCallback((id: string) => {
    const updated = matchHistory.filter(m => m.id !== id);
    setMatchHistory(updated);
    saveMatchHistory(updated);
  }, [matchHistory]);

  const clearAllHistory = useCallback(() => {
    setMatchHistory([]);
    saveMatchHistory([]);
  }, []);

  // ── VIEWS ──

  if (appState === 'menu') {
    return (
      <div className="w-full h-full flex items-center justify-center p-6 relative overflow-hidden" style={{ background: 'var(--board-bg)' }}>
        {/* Animated background hexes */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {Array.from({length: 40}).map((_, i) => (
            <div
              key={i}
              className="absolute opacity-[0.04]"
              style={{
                width: `${30 + Math.random() * 60}px`,
                height: `${30 + Math.random() * 60}px`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                background: 'var(--accent)',
                animation: `hex-breathe ${3 + Math.random() * 4}s ease-in-out ${Math.random() * 3}s infinite`,
                transform: `rotate(${Math.random() * 30}deg)`
              }}
            />
          ))}
        </div>

        {/* Ambient glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full pointer-events-none" 
          style={{ background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)' }} 
        />

        <div className="glass-card p-8 max-w-3xl w-full z-10 shadow-2xl" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 40px var(--accent-glow)' }}>
          <div className="text-center mb-8">
            <h1 className="text-4xl font-black mb-2 tracking-wider" style={{
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--text-primary) 70%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              HIVE AI ECOSYSTEM
            </h1>
            <p className="text-[var(--text-secondary)] font-medium tracking-[0.25em] text-xs uppercase">Advanced Tactical Engine</p>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center gap-1 mb-6 p-1 rounded-xl bg-black/20 border border-[var(--panel-border)]">
            <button
              onClick={() => setMenuTab('play')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                menuTab === 'play'
                  ? 'bg-[var(--accent)] text-white shadow-lg'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Target size={15} />
              Oyun Modları
            </button>
            <button
              onClick={() => setMenuTab('history')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                menuTab === 'history'
                  ? 'bg-[var(--accent)] text-white shadow-lg'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Clock size={15} />
              Geçmiş Maçlar
              {matchHistory.length > 0 && (
                <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full">{matchHistory.length}</span>
              )}
            </button>
          </div>

          {/* ─── PLAY TAB ─── */}
          {menuTab === 'play' && (
            <div className="grid md:grid-cols-2 gap-6 animate-fade-in">
              {/* Play Modes */}
              <div className="space-y-3">
                <h2 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                  <Target size={13} /> Game Modes
                </h2>
                <button
                  onClick={() => startGame('ai')}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-[var(--panel-border)] bg-black/20 hover:border-[var(--accent)] hover:bg-[var(--accent)]/5 transition-all group"
                >
                  <div className="bg-[var(--accent)]/15 p-3 rounded-xl group-hover:bg-[var(--accent)] group-hover:text-white transition-all duration-300 group-hover:shadow-[0_0_20px_var(--accent-glow)]">
                    <Brain size={22} className="text-[var(--accent)] group-hover:text-white transition-colors" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-bold text-base">PvE (VS AI)</h3>
                    <p className="text-[11px] text-[var(--text-secondary)]">Neural Network Opponent</p>
                  </div>
                </button>

                <button
                  onClick={() => startGame('local')}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-[var(--panel-border)] bg-black/20 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group"
                >
                  <div className="bg-emerald-500/15 p-3 rounded-xl group-hover:bg-emerald-500 transition-all duration-300 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                    <Users size={22} className="text-emerald-500 group-hover:text-white transition-colors" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-bold text-base">Local PvP</h3>
                    <p className="text-[11px] text-[var(--text-secondary)]">Hotseat Multiplayer</p>
                  </div>
                </button>

                <button
                  onClick={() => setAppState('remote_lobby')}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-[var(--panel-border)] bg-black/20 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group"
                >
                  <div className="bg-purple-500/15 p-3 rounded-xl group-hover:bg-purple-500 transition-all duration-300 group-hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]">
                    <Globe size={22} className="text-purple-500 group-hover:text-white transition-colors" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-bold text-base">Remote PvP</h3>
                    <p className="text-[11px] text-[var(--text-secondary)]">Online Multiplayer</p>
                  </div>
                </button>
              </div>

              {/* Settings */}
              <div className="space-y-5">
                <div>
                   <h2 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                    <Activity size={13} /> AI Difficulty
                  </h2>
                  <div className="grid grid-cols-2 gap-2">
                    {(['novice', 'intermediate', 'expert', 'grandmaster'] as AIDifficulty[]).map(diff => (
                      <button
                        key={diff}
                        onClick={() => setAiDifficulty(diff)}
                        className={`p-2.5 rounded-xl text-xs font-semibold border transition-all duration-200 ${
                          aiDifficulty === diff 
                            ? 'bg-[var(--accent)] border-[var(--accent)] text-white shadow-[0_0_15px_var(--accent-glow)]' 
                            : 'border-[var(--panel-border)] bg-black/15 text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {diff.charAt(0).toUpperCase() + diff.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                    <Settings size={13} /> Theme Engine
                  </h2>
                  <div className="grid grid-cols-3 gap-2">
                    {(['modern', 'wood', 'minimalist'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setTheme(t)}
                        className={`p-2.5 rounded-xl text-[11px] font-bold uppercase border-2 transition-all duration-200 ${
                          theme === t 
                            ? 'border-[var(--accent)] shadow-[0_0_10px_var(--accent-glow)]' 
                            : 'border-transparent hover:border-[var(--panel-border)]'
                        }`}
                        style={{
                          background: t === 'wood' ? 'linear-gradient(135deg, #3e2723, #5d4037)' : t === 'modern' ? 'linear-gradient(135deg, #0f0c29, #302b63)' : 'linear-gradient(135deg, #f3f4f6, #e5e7eb)',
                          color: t === 'minimalist' && theme !== t ? '#374151' : '#fff'
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                    <Settings size={13} /> Piece Style
                  </h2>
                  <div className="grid grid-cols-5 gap-2">
                    {(['emoji', 'stick', 'tribal', 'neon', 'rune'] as PieceStyle[]).map(ps => (
                      <button
                        key={ps}
                        onClick={() => setPieceStyle(ps)}
                        className={`p-2.5 rounded-xl text-[11px] font-bold uppercase border-2 transition-all duration-200 ${
                          pieceStyle === ps
                            ? 'border-[var(--accent)] text-[var(--accent)] shadow-[0_0_10px_var(--accent-glow)]'
                            : 'border-transparent text-[var(--text-secondary)] hover:border-[var(--panel-border)]'
                        }`}
                        style={{
                          background: 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))'
                        }}
                      >
                        {ps}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ─── HISTORY TAB ─── */}
          {menuTab === 'history' && (
            <div className="animate-fade-in">
              {matchHistory.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-4 opacity-30">🏆</div>
                  <p className="text-[var(--text-secondary)] text-sm">Henüz maç geçmişi yok.</p>
                  <p className="text-[var(--text-secondary)] text-xs mt-1 opacity-60">Bir oyun tamamladığınızda burada görünecek.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-[var(--text-secondary)]">{matchHistory.length} maç</span>
                    <button
                      onClick={clearAllHistory}
                      className="text-[10px] text-red-400/60 hover:text-red-400 flex items-center gap-1 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10"
                    >
                      <Trash2 size={11} /> Tümünü Sil
                    </button>
                  </div>
                  <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                    {matchHistory.map((match, idx) => {
                      const dateStr = new Date(match.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                      const winnerStr = match.winner === 'draw' ? 'Berabere' : match.winner === 'white' ? 'Beyaz Kazandı' : match.winner === 'black' ? 'Siyah Kazandı' : 'Bitmedi';
                      const winnerColor = match.winner === 'draw' ? 'text-gray-400' : match.winner === 'white' ? 'text-blue-300' : 'text-purple-300';
                      const modeStr = match.mode === 'ai' ? `vs AI (${match.difficulty || 'intermediate'})` : 'Yerel PvP';

                      return (
                        <div key={match.id} className="flex items-center gap-3 p-3 rounded-xl border border-[var(--panel-border)] bg-black/15 hover:bg-black/25 transition-colors group" style={{ animationDelay: `${idx * 50}ms` }}>
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                            match.winner === 'draw' ? 'bg-gray-500/15' : match.winner === 'white' ? 'bg-blue-500/15' : 'bg-purple-500/15'
                          }`}>
                            {match.winner === 'draw' ? '⚖️' : '🏆'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-semibold ${winnerColor}`}>{winnerStr}</span>
                              <span className="text-[10px] text-[var(--text-secondary)] bg-black/20 px-1.5 py-0.5 rounded">{modeStr}</span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-[var(--text-secondary)] mt-0.5">
                              <span>{dateStr}</span>
                              <span>•</span>
                              <span>{match.totalMoves} hamle</span>
                            </div>
                          </div>
                          {match.moves && (
                            <button
                              onClick={() => {
                                let currentState = createInitialState();
                                const reconstructedHistory: MoveRecord[] = [];
                                for (const m of match.moves!) {
                                  currentState = applyMove(currentState, m);
                                  reconstructedHistory.push({
                                    move: m,
                                    evaluation: evaluateState(currentState, 'black'),
                                    state: currentState
                                  });
                                }
                                setHistory(reconstructedHistory);
                                setReplayIndex(reconstructedHistory.length - 1);
                                setAppState('post_match');
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-[var(--accent)] text-white text-[10px] font-bold tracking-wider hover:bg-[var(--accent-hover)] transition-colors shadow-lg"
                            >
                              İzle
                            </button>
                          )}
                          <button
                            onClick={() => deleteMatch(match.id)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/15 text-red-400/50 hover:text-red-400 transition-all"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    );
  }

  // ── REMOTE LOBBY VIEW ──
  if (appState === 'remote_lobby') {
    return (
      <RemoteLobby
        mpState={multiplayer.state}
        onConnect={multiplayer.connect}
        onCreateRoom={multiplayer.createRoom}
        onJoinRoom={multiplayer.joinRoom}
        onDisconnect={multiplayer.disconnect}
        onBack={() => setAppState('menu')}
        onClearError={multiplayer.clearError}
      />
    );
  }

  return (
    <div className="w-full h-full flex flex-col text-[var(--text-primary)]" style={{ background: 'var(--bg-main)' }}>
      {/* ── TOP HEADER ── */}
      <header className="h-14 border-b border-[var(--panel-border)] backdrop-blur-xl flex items-center justify-between px-6 z-20" style={{ background: 'var(--panel-bg)' }}>
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center font-black text-white text-sm shadow-[0_0_15px_var(--accent-glow)]">
            H
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold tracking-[0.2em] text-[var(--text-secondary)] uppercase">
              {gameMode === 'ai' ? `PVE • ${aiDifficulty.toUpperCase()}` : 'LOCAL PVP'}
            </span>
            <span className="text-sm font-semibold">Tur {Math.floor(displayState.moveCount / 2) + 1}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {message && (
            <div className="px-4 py-1.5 rounded-xl bg-black/30 border border-[var(--panel-border)] text-xs font-medium max-w-xs truncate animate-float-up" key={message}>
              {message}
            </div>
          )}
          
          {canPass && isPlayerTurn && !displayState.gameOver && appState === 'playing' && (
            <button
              onClick={handlePass}
              className="bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white text-xs px-4 py-1.5 rounded-xl font-bold transition-all shadow-lg hover:shadow-orange-500/25"
            >
              PAS GEÇ
            </button>
          )}

          {appState === 'playing' && history.length > 0 && (
             <button
              onClick={() => {
                setAppState('post_match');
                setReplayIndex(history.length - 1);
              }}
              className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-xs px-4 py-1.5 rounded-xl font-bold shadow-lg hover:shadow-emerald-500/25 transition-all"
             >
               ⏪ GEÇMİŞ
             </button>
          )}

          <button
            onClick={() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
                setIsFullscreen(true);
              } else {
                document.exitFullscreen();
                setIsFullscreen(false);
              }
            }}
            className="p-1.5 rounded-xl border border-[var(--panel-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]/40 transition-all ml-2"
            title="Tam Ekran"
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>

          <button
            onClick={() => setAppState('menu')}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs px-3 py-1.5 rounded-xl border border-[var(--panel-border)] hover:border-[var(--accent)]/40 transition-all"
          >
            Ayrıl
          </button>
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* Left Side: White Player */}
        <aside className="w-full md:w-72 p-2 md:p-4 flex flex-col gap-2 md:gap-4 overflow-x-auto md:overflow-y-auto border-b md:border-b-0 md:border-r border-[var(--panel-border)] z-10 shrink-0" style={{ background: 'color-mix(in srgb, var(--bg-main) 85%, transparent)' }}>
          {renderHand('white')}
        </aside>

        {/* Center: Board */}
        <main className="flex-1 relative">
          {aiThinking && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 backdrop-blur-xl text-[var(--accent)] text-xs px-6 py-2.5 rounded-2xl border border-[var(--accent)]/30 shadow-[0_0_30px_var(--accent-glow)] flex items-center gap-3 animate-float-up" style={{ background: 'var(--panel-bg)' }}>
              <Brain size={16} className="animate-pulse" />
              <span className="font-semibold tracking-wide">Neural Network Computing...</span>
            </div>
          )}

          <HexBoard
            state={displayState}
            validPlacements={appState === 'playing' ? validPlacements : []}
            validMoves={appState === 'playing' ? validMoves : []}
            selectedPiece={selectedBoardPiece}
            onHexClick={handleHexClick}
            onBoardPieceClick={handleBoardPieceClick}
            theme={theme}
            pieceStyle={pieceStyle}
          />

          {/* Replay Controls Overlay */}
          {appState === 'post_match' && (
             <div className="absolute bottom-4 md:bottom-8 left-1/2 -translate-x-1/2 flex items-center justify-between gap-2 md:gap-4 backdrop-blur-xl border border-[var(--panel-border)] p-2 md:p-3 rounded-2xl shadow-2xl z-20 animate-float-up w-[90%] md:w-auto max-w-md" style={{ background: 'var(--panel-bg)' }}>
               <button 
                 onClick={() => setReplayIndex(Math.max(0, replayIndex - 1))}
                 disabled={replayIndex <= 0}
                 className="p-2.5 rounded-xl hover:bg-white/10 disabled:opacity-20 transition-all cursor-pointer"
               >
                 <ChevronLeft size={22} />
               </button>
               <div className="flex flex-col items-center min-w-[120px]">
                 <span className="text-[9px] text-[var(--text-secondary)] font-bold tracking-[0.2em] uppercase">Ghost of Moves</span>
                 <span className="text-sm font-mono text-white font-semibold">{replayIndex + 1} / {history.length}</span>
               </div>
               <button 
                 onClick={() => setReplayIndex(Math.min(history.length - 1, replayIndex + 1))}
                 disabled={replayIndex >= history.length - 1}
                 className="p-2.5 rounded-xl hover:bg-white/10 disabled:opacity-20 transition-all cursor-pointer"
               >
                 <ChevronRight size={22} />
               </button>
               <button
                 onClick={() => setAppState('playing')}
                 className="ml-3 px-5 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-bold uppercase hover:bg-[var(--accent-hover)] transition-colors shadow-[0_0_15px_var(--accent-glow)]"
               >
                 Oyuna Dön
               </button>
             </div>
          )}
        </main>

        {/* Right Side: Black Player */}
        <aside className="w-full md:w-72 p-2 md:p-4 flex flex-col gap-2 md:gap-4 overflow-x-auto md:overflow-y-auto border-t md:border-t-0 md:border-l border-[var(--panel-border)] z-10 shrink-0" style={{ background: 'color-mix(in srgb, var(--bg-main) 85%, transparent)' }}>
          {renderHand('black')}
          
          {/* Post Match Info Box */}
          {appState === 'post_match' && replayIndex >= 0 && history[replayIndex] && (
            <div className="mt-auto p-4 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 animate-float-up">
               <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
                 <Activity size={14} className="text-[var(--accent)]" /> Move Analysis
               </h3>
               <div className="space-y-2 text-xs">
                 <p className="text-[var(--text-secondary)]">Move by: <span className="text-white capitalize font-medium">{history[replayIndex].move.pieceType || 'Pass'}</span></p>
                 {history[replayIndex].isBest && <p className="text-emerald-400 font-bold">★ Best Move Found</p>}
                 {history[replayIndex].isBlunder && <p className="text-red-400 font-bold">⚠ Blunder Detected</p>}
                 <p className="text-[var(--text-secondary)]">Evaluation: <span className="font-mono text-white font-semibold">{history[replayIndex].evaluation?.toFixed(1)}</span></p>
               </div>
            </div>
          )}
        </aside>

      </div>

      {/* ── GAME OVER OVERLAY ── */}
      {displayState.gameOver && appState === 'playing' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="glass-card border-[var(--accent)]/30 p-10 text-center max-w-md w-full animate-fade-in" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 60px var(--accent-glow)' }}>
            <div className="text-6xl mb-6" style={{ filter: 'drop-shadow(0 0 20px rgba(255,255,255,0.3))' }}>
              {displayState.winner === 'draw' ? '⚖️' : '🏆'}
            </div>
            <h2 className="text-3xl font-black text-white mb-2 tracking-wider">
              {displayState.winner === 'draw'
                ? 'BERABERE'
                : `${displayState.winner === 'white' ? 'BEYAZ' : 'SİYAH'} KAZANDI`}
            </h2>
            <p className="text-[var(--text-secondary)] mb-8 text-sm">
              Analysis ready in Game Vault.
            </p>
            <div className="space-y-3">
               <button
                onClick={() => {
                  setAppState('post_match');
                  setReplayIndex(history.length - 1);
                }}
                className="w-full py-3 px-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_var(--accent-glow)]"
              >
                <Activity size={18} /> GHOST OF MOVES
              </button>
              <button
                onClick={() => startGame(gameMode)}
                className="w-full py-3 px-4 bg-white/10 hover:bg-white/15 text-white font-bold tracking-wider rounded-xl transition-colors border border-[var(--panel-border)]"
              >
                YENİDEN OYNA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
