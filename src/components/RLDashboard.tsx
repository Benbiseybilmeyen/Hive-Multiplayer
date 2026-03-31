/**
 * RLDashboard — Deep Q-Learning Live Monitor
 * Premium glassmorphism dashboard with real-time training visualization.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, Area, AreaChart,
} from 'recharts';
import {
  Play, Pause, Square, Brain, Zap, Activity, TrendingUp, Target,
  Cpu, Database, ChevronLeft, Settings, RotateCcw, Save, Download, Eye, EyeOff, Loader2
} from 'lucide-react';
import { DEFAULT_HYPERPARAMS, RLHyperparams, TrainingMetrics } from '../rl/trainer';
import { GameState } from '../types';
import HexBoard from './HexBoard';

interface RLDashboardProps {
  onBack: () => void;
}

export default function RLDashboard({ onBack }: RLDashboardProps) {
  const [status, setStatus] = useState<'idle' | 'training' | 'paused'>('idle');
  const [metrics, setMetrics] = useState<TrainingMetrics | null>(null);
  const [lossHistory, setLossHistory] = useState<{ ep: number; loss: number; smoothed: number }[]>([]);
  const [rewardHistory, setRewardHistory] = useState<{ ep: number; reward: number }[]>([]);
  const [winRateHistory, setWinRateHistory] = useState<{ ep: number; rate: number }[]>([]);
  const [hyperparams, setHyperparams] = useState<RLHyperparams>({ ...DEFAULT_HYPERPARAMS });
  const [showSettings, setShowSettings] = useState(false);
  const [liveMonitor, setLiveMonitor] = useState(true);
  const [isWatchingLive, setIsWatchingLive] = useState(false);
  const [liveMatchState, setLiveMatchState] = useState<GameState | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const smoothedLoss = useRef(0);

  // ─── Worker Management ─────────────────────────────────────────────────

  const startTraining = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    const worker = new Worker(new URL('../rl/rlWorker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    // Load saved weights if available
    const savedWeights = localStorage.getItem('hive_dqn_weights');

    worker.postMessage({
      command: 'start',
      payload: { hyperparams, savedWeights },
    });

    worker.onmessage = (e) => {
      const { type, data } = e.data;
      if (type === 'metrics' && liveMonitor) {
        setMetrics(data);

        // Exponential moving average for loss smoothing
        smoothedLoss.current = smoothedLoss.current * 0.95 + data.loss * 0.05;

        setLossHistory(prev => {
          const next = [...prev, { ep: data.episode, loss: data.loss, smoothed: smoothedLoss.current }];
          return next.length > 300 ? next.slice(-300) : next;
        });

        setRewardHistory(prev => {
          const next = [...prev, { ep: data.episode, reward: data.rewardSum }];
          return next.length > 300 ? next.slice(-300) : next;
        });

        if (data.episode % 5 === 0) {
          setWinRateHistory(prev => {
            const next = [...prev, { ep: data.episode, rate: data.winRate * 100 }];
            return next.length > 100 ? next.slice(-100) : next;
          });
        }
      }
      if (type === 'live_state') {
        setLiveMatchState(data);
      }

      if (type === 'weights') {
        localStorage.setItem('hive_dqn_weights', data);
      }

      if (type === 'stopped') {
        setStatus('idle');
      }
    };

    setStatus('training');
  }, [hyperparams, liveMonitor]);

  const stopTraining = useCallback(() => {
    workerRef.current?.postMessage({ command: 'stop' });
  }, []);

  const pauseTraining = useCallback(() => {
    workerRef.current?.postMessage({ command: 'pause' });
    setStatus('paused');
  }, []);

  const resumeTraining = useCallback(() => {
    workerRef.current?.postMessage({ command: 'resume' });
    setStatus('training');
  }, []);

  const resetTraining = useCallback(() => {
    stopTraining();
    setMetrics(null);
    setLossHistory([]);
    setRewardHistory([]);
    setWinRateHistory([]);
    smoothedLoss.current = 0;
    localStorage.removeItem('hive_dqn_weights');
    setStatus('idle');
    setIsWatchingLive(false);
    setLiveMatchState(null);
  }, [stopTraining]);

  const toggleLiveMatch = useCallback(() => {
    const nextState = !isWatchingLive;
    setIsWatchingLive(nextState);
    if (!nextState) setLiveMatchState(null);
    workerRef.current?.postMessage({
      command: 'setLiveMatchMode',
      payload: { enabled: nextState }
    });
  }, [isWatchingLive]);

  // Cleanup workers on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.postMessage({ command: 'stop' });
      workerRef.current?.terminate();
    };
  }, []);

  // Update live monitor toggle
  useEffect(() => {
    if (!liveMonitor && workerRef.current && status === 'training') {
      // Still training, just not updating UI
    }
  }, [liveMonitor, status]);

  // ─── Neural Network Architecture SVG ───────────────────────────────────

  const renderNetworkDiagram = () => {
    const layers = [128, 256, 128, 64, 512];
    const layerLabels = ['Input', 'Hidden 1', 'Hidden 2', 'Hidden 3', 'Output'];
    const displayNodes = [6, 8, 6, 4, 6]; // Visual nodes per layer
    const svgW = 440;
    const svgH = 220;
    const layerSpacing = svgW / (layers.length + 1);

    const activations = metrics?.layerActivations || [];

    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${svgW} ${svgH}`} className="overflow-visible">
        <defs>
          <linearGradient id="connGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.15" />
            <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.15" />
          </linearGradient>
          <filter id="nodeGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="activeNodeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>

        {/* Connections */}
        {layers.map((_, li) => {
          if (li === 0) return null;
          const x1 = (li) * layerSpacing;
          const x2 = (li + 1) * layerSpacing;
          const nodes1 = displayNodes[li - 1];
          const nodes2 = displayNodes[li];
          const lines: React.ReactNode[] = [];

          for (let n1 = 0; n1 < nodes1; n1++) {
            for (let n2 = 0; n2 < nodes2; n2++) {
              const y1 = (n1 + 1) * svgH / (nodes1 + 1);
              const y2 = (n2 + 1) * svgH / (nodes2 + 1);

              // Activation-based opacity
              const act = activations[li - 1]?.[n2] || 0;
              const opacity = Math.min(0.08 + Math.abs(act) * 0.15, 0.4);

              lines.push(
                <line
                  key={`${li}-${n1}-${n2}`}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="var(--accent)"
                  strokeOpacity={status === 'training' ? opacity : 0.06}
                  strokeWidth="0.8"
                  className={status === 'training' ? 'transition-all duration-500' : ''}
                />
              );
            }
          }
          return <g key={`conn-${li}`}>{lines}</g>;
        })}

        {/* Nodes */}
        {layers.map((size, li) => {
          const x = (li + 1) * layerSpacing;
          const nodes = displayNodes[li];
          const nodeElements: React.ReactNode[] = [];

          for (let n = 0; n < nodes; n++) {
            const y = (n + 1) * svgH / (nodes + 1);
            const act = activations[li]?.[n] || 0;
            const intensity = Math.min(Math.abs(act) * 2, 1);

            nodeElements.push(
              <g key={`node-${li}-${n}`}>
                {/* Glow ring */}
                {status === 'training' && intensity > 0.2 && (
                  <circle
                    cx={x} cy={y} r={8}
                    fill="none"
                    stroke="var(--accent)"
                    strokeOpacity={intensity * 0.5}
                    strokeWidth="1"
                    className="animate-pulse"
                  />
                )}
                {/* Node */}
                <circle
                  cx={x} cy={y}
                  r={5}
                  fill={status === 'training' && intensity > 0.1
                    ? `rgba(99, 102, 241, ${0.3 + intensity * 0.7})`
                    : 'rgba(99, 102, 241, 0.2)'
                  }
                  stroke="var(--accent)"
                  strokeWidth="1"
                  strokeOpacity={0.5 + intensity * 0.5}
                  className="transition-all duration-300"
                />
              </g>
            );
          }

          // "..." indicator if more nodes
          if (size > nodes) {
            const midY = svgH / 2;
            nodeElements.push(
              <text
                key={`dots-${li}`}
                x={x} y={midY + 2}
                textAnchor="middle"
                fill="var(--text-secondary)"
                fontSize="10"
                opacity="0.5"
              >
                ⋮
              </text>
            );
          }

          // Layer label
          nodeElements.push(
            <text
              key={`label-${li}`}
              x={x} y={svgH - 2}
              textAnchor="middle"
              fill="var(--text-secondary)"
              fontSize="7"
              fontWeight="600"
              letterSpacing="0.05em"
            >
              {layerLabels[li]}
            </text>
          );
          nodeElements.push(
            <text
              key={`size-${li}`}
              x={x} y={12}
              textAnchor="middle"
              fill="var(--accent)"
              fontSize="8"
              fontWeight="700"
              opacity="0.7"
            >
              {size}
            </text>
          );

          return <g key={`layer-${li}`}>{nodeElements}</g>;
        })}

        {/* Data flow particles when training */}
        {status === 'training' && (
          <>
            {[0, 1, 2, 3].map(i => (
              <circle
                key={`particle-${i}`}
                r="2"
                fill="var(--accent)"
                opacity="0.8"
                filter="url(#nodeGlow)"
              >
                <animateMotion
                  dur={`${1.5 + i * 0.4}s`}
                  repeatCount="indefinite"
                  path={`M${layerSpacing},${40 + i * 40} L${svgW - layerSpacing},${60 + i * 30}`}
                />
              </circle>
            ))}
          </>
        )}
      </svg>
    );
  };

  // ─── Stat Card Component ───────────────────────────────────────────────

  const StatCard = ({ label, value, sub, icon: Icon, color = 'var(--accent)', pulse = false }: {
    label: string; value: string | number; sub?: string;
    icon: React.ComponentType<{ size?: number; color?: string; className?: string }>;
    color?: string; pulse?: boolean;
  }) => (
    <div className="rl-stat-card group">
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${pulse ? 'animate-pulse' : ''}`}
          style={{ background: `color-mix(in srgb, ${color} 15%, transparent)` }}
        >
          <Icon size={14} color={color} />
        </div>
        <span className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.15em]">{label}</span>
      </div>
      <div className="text-xl font-black text-white tracking-tight">{value}</div>
      {sub && <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">{sub}</div>}
    </div>
  );

  // ─── Epsilon Gauge ─────────────────────────────────────────────────────

  const EpsilonGauge = ({ value }: { value: number }) => {
    const pct = value * 100;
    const circumference = 2 * Math.PI * 36;
    const offset = circumference * (1 - value);
    return (
      <div className="flex flex-col items-center">
        <svg width="90" height="90" viewBox="0 0 90 90">
          <circle cx="45" cy="45" r="36" fill="none" stroke="var(--panel-border)" strokeWidth="4" />
          <circle
            cx="45" cy="45" r="36" fill="none"
            stroke="url(#epsilonGrad)"
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 45 45)"
            className="transition-all duration-700"
          />
          <defs>
            <linearGradient id="epsilonGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>
          <text x="45" y="42" textAnchor="middle" fill="white" fontSize="16" fontWeight="800">
            {pct.toFixed(0)}%
          </text>
          <text x="45" y="55" textAnchor="middle" fill="var(--text-secondary)" fontSize="7" fontWeight="600" letterSpacing="0.1em">
            EXPLORE
          </text>
        </svg>
      </div>
    );
  };

  // ─── Win Rate Ring ─────────────────────────────────────────────────────

  const WinRateRing = ({ winRate, drawRate }: { winRate: number; drawRate: number; lossRate: number }) => {
    const r = 40;
    const c = 2 * Math.PI * r;
    return (
      <div className="flex flex-col items-center">
        <svg width="100" height="100" viewBox="0 0 100 100">
          {/* Background ring */}
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--panel-border)" strokeWidth="6" />
          {/* Win segment */}
          <circle
            cx="50" cy="50" r={r} fill="none"
            stroke="#34d399" strokeWidth="6"
            strokeDasharray={`${c * winRate} ${c * (1 - winRate)}`}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            className="transition-all duration-700"
          />
          {/* Draw segment */}
          <circle
            cx="50" cy="50" r={r} fill="none"
            stroke="#fbbf24" strokeWidth="6"
            strokeDasharray={`${c * drawRate} ${c * (1 - drawRate)}`}
            strokeDashoffset={-c * winRate}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            className="transition-all duration-700"
          />
          {/* Center text */}
          <text x="50" y="46" textAnchor="middle" fill="white" fontSize="18" fontWeight="800">
            {(winRate * 100).toFixed(0)}%
          </text>
          <text x="50" y="60" textAnchor="middle" fill="#34d399" fontSize="7" fontWeight="700" letterSpacing="0.1em">
            WIN RATE
          </text>
        </svg>
        <div className="flex gap-3 mt-1 text-[9px] font-semibold">
          <span className="text-emerald-400">W: {metrics?.winsLast100 ?? 0}</span>
          <span className="text-amber-400">D: {metrics?.drawsLast100 ?? 0}</span>
          <span className="text-red-400">L: {metrics?.lossesLast100 ?? 0}</span>
        </div>
      </div>
    );
  };

  // ─── Hyperparameter Slider ─────────────────────────────────────────────

  const ParamSlider = ({ label, param, min, max, step, format }: {
    label: string; param: keyof RLHyperparams;
    min: number; max: number; step: number; format?: (v: number) => string;
  }) => (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-[var(--text-secondary)] font-semibold">{label}</span>
        <span className="text-[var(--accent)] font-bold font-mono">
          {format ? format(hyperparams[param] as number) : hyperparams[param]}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={hyperparams[param] as number}
        onChange={(e) => {
          const val = parseFloat(e.target.value);
          setHyperparams(prev => ({ ...prev, [param]: val }));
          if (status === 'training') {
            workerRef.current?.postMessage({
              command: 'setHyperparams',
              payload: { [param]: val },
            });
          }
        }}
        className="rl-slider"
      />
    </div>
  );

  // ─── Custom Tooltip ────────────────────────────────────────────────────

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="glass-card p-2 text-[10px] border border-[var(--panel-border)] shadow-xl">
        <p className="text-[var(--text-secondary)] mb-1">Episode {label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }} className="font-mono font-bold">
            {p.name}: {typeof p.value === 'number' ? p.value.toFixed(4) : p.value}
          </p>
        ))}
      </div>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="w-full h-full flex flex-col text-[var(--text-primary)] overflow-hidden" style={{ background: 'var(--bg-main)' }}>

      {/* ── Header ── */}
      <header className="h-14 border-b border-[var(--panel-border)] backdrop-blur-xl flex items-center justify-between px-5 z-20 shrink-0" style={{ background: 'var(--panel-bg)' }}>
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl border border-[var(--panel-border)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--accent)]/40 transition-all"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.4)]">
              <Brain size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-wide">Deep Q-Learning Lab</h1>
              <p className="text-[9px] text-[var(--text-secondary)] font-semibold tracking-[0.15em] uppercase">
                AlphaZero-Style Self-Play Engine
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Live Monitor Toggle */}
          <button
            onClick={() => setLiveMonitor(!liveMonitor)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
              liveMonitor
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                : 'border-[var(--panel-border)] text-[var(--text-secondary)]'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${liveMonitor ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
            LIVE MONITOR
          </button>

          {/* Watch Live Toggle */}
          <button
            onClick={toggleLiveMatch}
            disabled={status !== 'training'}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
              status !== 'training' ? 'opacity-50 cursor-not-allowed border-[var(--panel-border)] text-[var(--text-secondary)]' :
              isWatchingLive
                ? 'bg-purple-500/15 border-purple-500/30 text-purple-400'
                : 'border-[var(--panel-border)] text-[var(--text-secondary)] hover:text-white'
            }`}
          >
            {isWatchingLive ? <EyeOff size={13} /> : <Eye size={13} />}
            WATCH LIVE
          </button>

          {/* Settings Toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-xl border transition-all ${
              showSettings
                ? 'bg-[var(--accent)]/15 border-[var(--accent)]/30 text-[var(--accent)]'
                : 'border-[var(--panel-border)] text-[var(--text-secondary)] hover:text-white'
            }`}
          >
            <Settings size={15} />
          </button>

          {/* Training Controls */}
          <div className="flex items-center gap-1 ml-2 p-1 rounded-xl bg-black/30 border border-[var(--panel-border)]">
            {status === 'idle' ? (
              <button
                onClick={startTraining}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-[11px] font-bold tracking-wider hover:from-emerald-500 hover:to-emerald-400 transition-all shadow-lg hover:shadow-emerald-500/25"
              >
                <Play size={13} /> START
              </button>
            ) : (
              <>
                {status === 'training' ? (
                  <button
                    onClick={pauseTraining}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 text-[11px] font-bold border border-amber-500/20 hover:bg-amber-500/25 transition-all"
                  >
                    <Pause size={13} /> PAUSE
                  </button>
                ) : (
                  <button
                    onClick={resumeTraining}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-[11px] font-bold border border-emerald-500/20 hover:bg-emerald-500/25 transition-all"
                  >
                    <Play size={13} /> RESUME
                  </button>
                )}
                <button
                  onClick={stopTraining}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 text-[11px] font-bold border border-red-500/20 hover:bg-red-500/25 transition-all"
                >
                  <Square size={13} /> STOP
                </button>
              </>
            )}
            <button
              onClick={resetTraining}
              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-white hover:bg-white/5 transition-all"
              title="Reset All"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Content Grid ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 relative">

        {/* Live Match Overlay */}
        {isWatchingLive && (
          <div className="absolute inset-0 z-30 bg-[var(--bg-main)] p-4 flex flex-col justify-center items-center">
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <Eye className="text-purple-400" /> Live Match Observation
            </h2>
            <p className="text-[var(--text-secondary)] text-sm mb-4">Training is slowed down while you watch the agent play in real-time.</p>
            <div className="w-full max-w-4xl max-h-[70vh] flex-1 bg-black/40 rounded-2xl border border-[var(--panel-border)] overflow-hidden shadow-2xl relative">
              {liveMatchState ? (
                <HexBoard
                  state={liveMatchState}
                  selectedPiece={null}
                  validPlacements={[]}
                  validMoves={[]}
                  onBoardPieceClick={() => {}}
                  onHexClick={() => {}}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--text-secondary)]">
                  <Loader2 size={32} className="animate-spin mb-4 text-purple-400" />
                  <p>Maçın başlaması veya ajanın hamle yapması bekleniyor...</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Settings Panel (collapsible) */}
        {showSettings && (
          <div className="glass-card p-5 animate-float-up">
            <h3 className="text-[10px] font-bold text-[var(--accent)] mb-4 uppercase tracking-[0.2em] flex items-center gap-2">
              <Settings size={12} /> Hyperparameters
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
              <ParamSlider label="Learning Rate" param="learningRate" min={0.0001} max={0.01} step={0.0001} format={v => v.toFixed(4)} />
              <ParamSlider label="Discount Factor (γ)" param="discountFactor" min={0.8} max={0.999} step={0.001} format={v => v.toFixed(3)} />
              <ParamSlider label="ε Start" param="epsilonStart" min={0.1} max={1} step={0.05} format={v => v.toFixed(2)} />
              <ParamSlider label="ε End" param="epsilonEnd" min={0.01} max={0.5} step={0.01} format={v => v.toFixed(2)} />
              <ParamSlider label="ε Decay (episodes)" param="epsilonDecay" min={100} max={2000} step={50} />
              <ParamSlider label="Batch Size" param="batchSize" min={8} max={128} step={8} />
              <ParamSlider label="Target Update Freq" param="targetUpdateFreq" min={5} max={100} step={5} />
              <ParamSlider label="Buffer Capacity" param="bufferCapacity" min={1000} max={20000} step={1000} />
            </div>
          </div>
        )}

        {/* Stats Cards Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatCard
            label="Episodes" value={metrics?.episode ?? 0}
            sub={`${(metrics?.episodesPerSec ?? 0).toFixed(1)} ep/s`}
            icon={Zap}
            color="#818cf8"
            pulse={status === 'training'}
          />
          <StatCard
            label="Total Steps"
            value={metrics ? (metrics.totalSteps > 1000 ? `${(metrics.totalSteps / 1000).toFixed(1)}K` : metrics.totalSteps) : 0}
            sub="state transitions"
            icon={Activity}
            color="#34d399"
          />
          <StatCard
            label="Loss"
            value={(metrics?.loss ?? 0).toFixed(4)}
            sub="MSE loss"
            icon={TrendingUp}
            color={metrics && metrics.loss < 0.01 ? '#34d399' : '#f59e0b'}
          />
          <StatCard
            label="Avg Q-Value"
            value={(metrics?.avgQValue ?? 0).toFixed(2)}
            sub="policy quality"
            icon={Target}
            color="#a78bfa"
          />
          <StatCard
            label="Parameters"
            value="~145K"
            sub="128→256→128→64→512"
            icon={Cpu}
            color="#f472b6"
          />
          <StatCard
            label="Buffer"
            value={`${((metrics?.bufferUtilization ?? 0) * 100).toFixed(0)}%`}
            sub={`${hyperparams.bufferCapacity} capacity`}
            icon={Database}
            color="#38bdf8"
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Loss Curve */}
          <div className="glass-card p-5">
            <h3 className="text-[10px] font-bold text-[var(--accent)] mb-3 uppercase tracking-[0.2em] flex items-center gap-2">
              <TrendingUp size={12} /> Training Loss
            </h3>
            <div className="h-52">
              {lossHistory.length > 2 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={lossHistory}>
                    <defs>
                      <linearGradient id="lossGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="smoothGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--panel-border)" />
                    <XAxis dataKey="ep" stroke="var(--text-secondary)" fontSize={9} />
                    <YAxis stroke="var(--text-secondary)" fontSize={9} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="loss" name="Loss" stroke="#6366f1" fill="url(#lossGrad)" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="smoothed" name="Smoothed" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[var(--text-secondary)] text-xs">
                  <div className="text-center">
                    <Activity size={24} className="mx-auto mb-2 opacity-30" />
                    Start training to see loss curves
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Reward / Win Rate Chart */}
          <div className="glass-card p-5">
            <h3 className="text-[10px] font-bold text-emerald-400 mb-3 uppercase tracking-[0.2em] flex items-center gap-2">
              <Target size={12} /> Win Rate Progress
            </h3>
            <div className="h-52">
              {winRateHistory.length > 2 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={winRateHistory}>
                    <defs>
                      <linearGradient id="winGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--panel-border)" />
                    <XAxis dataKey="ep" stroke="var(--text-secondary)" fontSize={9} />
                    <YAxis domain={[0, 100]} stroke="var(--text-secondary)" fontSize={9} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="rate" name="Win %" stroke="#34d399" fill="url(#winGrad)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[var(--text-secondary)] text-xs">
                  <div className="text-center">
                    <Target size={24} className="mx-auto mb-2 opacity-30" />
                    Win rate data will appear after training begins
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Row: Network + Gauges + Q Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Neural Network Architecture */}
          <div className="glass-card p-5 lg:col-span-2">
            <h3 className="text-[10px] font-bold text-[var(--accent)] mb-3 uppercase tracking-[0.2em] flex items-center gap-2">
              <Cpu size={12} /> Network Architecture
              {status === 'training' && (
                <span className="ml-auto text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 animate-pulse">
                  TRAINING
                </span>
              )}
            </h3>
            <div className="h-56">
              {renderNetworkDiagram()}
            </div>
          </div>

          {/* Gauges Column */}
          <div className="glass-card p-5 flex flex-col items-center justify-center gap-4">
            <EpsilonGauge value={metrics?.epsilon ?? hyperparams.epsilonStart} />
            <div className="w-full h-px bg-[var(--panel-border)]" />
            <WinRateRing
              winRate={metrics?.winRate ?? 0}
              drawRate={metrics?.drawRate ?? 0}
              lossRate={metrics?.lossRate ?? 0}
            />
          </div>
        </div>

        {/* Q-Value Distribution */}
        {metrics && metrics.qValueDistribution.length > 0 && (
          <div className="glass-card p-5">
            <h3 className="text-[10px] font-bold text-purple-400 mb-3 uppercase tracking-[0.2em] flex items-center gap-2">
              <Activity size={12} /> Q-Value Distribution (Current Policy)
            </h3>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.qValueDistribution.map((v, i) => ({ action: `A${i}`, q: v }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--panel-border)" />
                  <XAxis dataKey="action" stroke="var(--text-secondary)" fontSize={8} />
                  <YAxis stroke="var(--text-secondary)" fontSize={9} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="q" name="Q-Value" radius={[4, 4, 0, 0]}>
                    {metrics.qValueDistribution.map((v, i) => (
                      <Cell
                        key={i}
                        fill={v > 0 ? `rgba(52, 211, 153, ${0.4 + Math.min(Math.abs(v), 1) * 0.6})` : `rgba(239, 68, 68, ${0.4 + Math.min(Math.abs(v), 1) * 0.6})`}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Buffer Utilization Bar */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.15em] flex items-center gap-2">
              <Database size={11} /> Experience Replay Buffer
            </span>
            <span className="text-[10px] font-mono text-[var(--accent)]">
              {Math.floor((metrics?.bufferUtilization ?? 0) * hyperparams.bufferCapacity)} / {hyperparams.bufferCapacity}
            </span>
          </div>
          <div className="h-2.5 w-full bg-black/30 rounded-full overflow-hidden border border-[var(--panel-border)]">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${(metrics?.bufferUtilization ?? 0) * 100}%`,
                background: 'linear-gradient(90deg, #6366f1, #818cf8, #a78bfa)',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
