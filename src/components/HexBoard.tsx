import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GameState, HexPos, PieceStyle } from '../types';
import { posKey, keyToPos } from '../gameLogic';
import PieceIcon, { PIECE_ACCENT } from './PieceIcon';

interface HexBoardProps {
  state: GameState;
  validPlacements: HexPos[];
  validMoves: HexPos[];
  selectedPiece: string | null;
  onHexClick: (pos: HexPos) => void;
  onBoardPieceClick: (key: string) => void;
  theme?: string;
  pieceStyle?: PieceStyle;
}

const HEX_SIZE = 42;

function hexToPixel(q: number, r: number) {
  const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
  const y = HEX_SIZE * 3 / 2 * r;
  return { x, y };
}

// Generate hexagon points with slight inset for cleaner edges
const hexPoints = Array.from({ length: 6 }).map((_, i) => {
  const angle_deg = 60 * i - 30;
  const angle_rad = Math.PI / 180 * angle_deg;
  return `${HEX_SIZE * Math.cos(angle_rad)},${HEX_SIZE * Math.sin(angle_rad)}`;
}).join(' ');

const hexPointsInner = Array.from({ length: 6 }).map((_, i) => {
  const angle_deg = 60 * i - 30;
  const angle_rad = Math.PI / 180 * angle_deg;
  const r = HEX_SIZE * 0.82;
  return `${r * Math.cos(angle_rad)},${r * Math.sin(angle_rad)}`;
}).join(' ');

const hexPointsSmall = Array.from({ length: 6 }).map((_, i) => {
  const angle_deg = 60 * i - 30;
  const angle_rad = Math.PI / 180 * angle_deg;
  const r = HEX_SIZE * 0.5;
  return `${r * Math.cos(angle_rad)},${r * Math.sin(angle_rad)}`;
}).join(' ');

export default function HexBoard({
  state,
  validPlacements,
  validMoves,
  selectedPiece,
  onHexClick,
  onBoardPieceClick,
  theme = 'modern',
  pieceStyle = 'emoji'
}: HexBoardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const transformRef = useRef(transform);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const [hoveredHex, setHoveredHex] = useState<string | null>(null);

  // For tablet/mobile pinch-to-zoom and safe multi-touch
  const pointerCache = useRef<Record<number, { clientX: number, clientY: number }>>({});
  const initialPinchDistance = useRef<number | null>(null);
  const initialPinchScale = useRef<number | null>(null);

  // Keep ref in sync
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  // Center board initially
  useEffect(() => {
    if (svgRef.current) {
      const { clientWidth, clientHeight } = svgRef.current;
      setTransform(prev => ({ ...prev, x: clientWidth / 2, y: clientHeight / 2 }));
    }
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = -e.deltaY * 0.001;
    setTransform(prev => ({
      ...prev,
      scale: Math.min(Math.max(0.2, prev.scale + zoomFactor), 3)
    }));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerCache.current[e.pointerId] = { clientX: e.clientX, clientY: e.clientY };
    const pIds = Object.keys(pointerCache.current);

    if (pIds.length === 1) {
      // Allow drag if target is svg, or shift key is pressed, or if it's touch (tablets need easy dragging)
      if ((e.target as Element).tagName === 'svg' || e.shiftKey || e.pointerType === 'touch') {
        setIsDragging(true);
        dragStartRef.current = { 
          x: e.clientX - transformRef.current.x, 
          y: e.clientY - transformRef.current.y 
        };
        try { svgRef.current?.setPointerCapture(e.pointerId); } catch {}
      }
    } else if (pIds.length === 2) {
      // Start pinch
      const p1 = pointerCache.current[Number(pIds[0])];
      const p2 = pointerCache.current[Number(pIds[1])];
      const dist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      initialPinchDistance.current = dist;
      initialPinchScale.current = transformRef.current.scale;
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (pointerCache.current[e.pointerId]) {
      pointerCache.current[e.pointerId] = { clientX: e.clientX, clientY: e.clientY };
    }
    const pIds = Object.keys(pointerCache.current);

    if (pIds.length === 2 && initialPinchDistance.current !== null && initialPinchScale.current !== null) {
      // Handle pinch zoom
      const p1 = pointerCache.current[Number(pIds[0])];
      const p2 = pointerCache.current[Number(pIds[1])];
      const dist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      const newScale = Math.min(Math.max(0.2, initialPinchScale.current * (dist / initialPinchDistance.current)), 3);
      setTransform(prev => ({ ...prev, scale: newScale }));
    } else if (isDragging && pIds.length === 1) {
      // Handle drag pan
      setTransform(prev => ({
        ...prev,
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y
      }));
    }
  }, [isDragging]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    delete pointerCache.current[e.pointerId];
    const pIds = Object.keys(pointerCache.current);

    if (pIds.length < 2) {
      initialPinchDistance.current = null;
      initialPinchScale.current = null;
    }
    
    if (pIds.length === 0) {
      setIsDragging(false);
      try { svgRef.current?.releasePointerCapture(e.pointerId); } catch {}
    } else if (pIds.length === 1) {
      // Re-adjust drag start for the remaining finger so it doesn't jump
      const remaining = pointerCache.current[Number(pIds[0])];
      dragStartRef.current = { 
        x: remaining.clientX - transformRef.current.x, 
        y: remaining.clientY - transformRef.current.y 
      };
    }
  }, []);

  // Collect all hexes to render
  const validMoveKeys = new Set(validMoves.map(p => posKey(p.q, p.r)));

  const renderHexes = new Map<string, { type: 'piece' | 'placement' | 'move', pos: HexPos, isValidMove?: boolean }>();

  // 1. Existing pieces
  Object.keys(state.board).forEach(key => {
    if (state.board[key] && state.board[key].length > 0) {
      renderHexes.set(key, { type: 'piece', pos: keyToPos(key), isValidMove: validMoveKeys.has(key) });
    }
  });

  // 2. Valid placements (empty hexes)
  validPlacements.forEach(pos => {
    const key = posKey(pos.q, pos.r);
    if (!renderHexes.has(key)) {
      renderHexes.set(key, { type: 'placement', pos });
    }
  });

  // 3. Valid moves (empty hexes)
  validMoves.forEach(pos => {
    const key = posKey(pos.q, pos.r);
    if (!renderHexes.has(key)) {
      renderHexes.set(key, { type: 'move', pos });
    }
  });

  // Sort: render pieces on top of action indicators
  const sortedEntries = Array.from(renderHexes.entries()).sort((a, b) => {
    const order = { placement: 0, move: 0, piece: 1 };
    return order[a[1].type] - order[b[1].type];
  });

  const isDark = theme !== 'minimalist';

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ background: 'var(--board-bg)', cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}>
      {/* Ambient glow effect behind board */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `radial-gradient(circle at 50% 50%, var(--accent-glow) 0%, transparent 60%)`,
        opacity: 0.3
      }} />

      <svg
        ref={svgRef}
        className="w-full h-full"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <defs>
          {/* Piece shadows */}
          <filter id="piece-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor={isDark ? '#000' : '#94a3b8'} floodOpacity={isDark ? "0.6" : "0.3"} />
          </filter>
          <filter id="stack-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#000" floodOpacity="0.7" />
          </filter>
          <filter id="selected-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="placement-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Gradients for white/black pieces */}
          <linearGradient id="grad-white" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="40%" stopColor="#e8ecf4" />
            <stop offset="100%" stopColor="#c7d0e0" />
          </linearGradient>
          <linearGradient id="grad-black" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={theme === 'modern' ? '#7c3aed' : theme === 'wood' ? '#d97706' : '#475569'} />
            <stop offset="50%" stopColor={theme === 'modern' ? '#4c1d95' : theme === 'wood' ? '#92400e' : '#334155'} />
            <stop offset="100%" stopColor={theme === 'modern' ? '#2e1065' : theme === 'wood' ? '#78350f' : '#1e293b'} />
          </linearGradient>
          {/* Stroked border gradients for piece outlines */}
          <linearGradient id="stroke-white" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#64748b" />
          </linearGradient>
          <linearGradient id="stroke-black" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={theme === 'modern' ? '#a78bfa' : theme === 'wood' ? '#fbbf24' : '#94a3b8'} />
            <stop offset="100%" stopColor={theme === 'modern' ? '#7c3aed' : theme === 'wood' ? '#d97706' : '#64748b'} />
          </linearGradient>
          <linearGradient id="grad-valid" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="grad-move" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818cf8" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.5" />
          </linearGradient>

          {/* Patterns */}
          <pattern id="hex-pattern" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="0.5" fill="currentColor" opacity="0.2" />
          </pattern>
          {/* Neon glow for neon piece style */}
          <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          {sortedEntries.map(([key, info]) => {
            const { x, y } = hexToPixel(info.pos.q, info.pos.r);
            const isHovered = hoveredHex === key;

            if (info.type === 'placement') {
              return (
                <g
                  key={`placement-${key}`}
                  transform={`translate(${x}, ${y})`}
                  onClick={() => onHexClick(info.pos)}
                  onPointerEnter={() => setHoveredHex(key)}
                  onPointerLeave={() => setHoveredHex(null)}
                  className="cursor-pointer"
                  style={{ filter: 'url(#placement-glow)' }}
                >
                  {/* Outer pulse ring */}
                  <polygon
                    points={hexPoints}
                    fill="none"
                    stroke="var(--valid-move-stroke)"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    opacity="0.3"
                    className="animate-hex-breathe"
                  />
                  {/* Inner fill */}
                  <polygon
                    points={hexPoints}
                    fill="url(#grad-valid)"
                    stroke="var(--valid-move-stroke)"
                    strokeWidth={isHovered ? "3" : "2"}
                    strokeLinejoin="round"
                    className="transition-all duration-200"
                    opacity={isHovered ? 1 : 0.7}
                  />
                  {/* Center dot */}
                  <polygon
                    points={hexPointsSmall}
                    fill="var(--valid-move-stroke)"
                    opacity={isHovered ? 0.8 : 0.4}
                    className="transition-all duration-200"
                  />
                </g>
              );
            }

            if (info.type === 'move') {
              return (
                <g
                  key={`move-${key}`}
                  transform={`translate(${x}, ${y})`}
                  onClick={() => onHexClick(info.pos)}
                  onPointerEnter={() => setHoveredHex(key)}
                  onPointerLeave={() => setHoveredHex(null)}
                  className="cursor-pointer"
                  style={{ filter: 'url(#placement-glow)' }}
                >
                  <polygon
                    points={hexPoints}
                    fill="url(#grad-move)"
                    stroke="var(--accent)"
                    strokeWidth={isHovered ? "3" : "1.5"}
                    strokeDasharray="8,5"
                    strokeLinejoin="round"
                    opacity={isHovered ? 1 : 0.6}
                    className="transition-all duration-200"
                  />
                  <circle r="5" fill="var(--accent)" opacity={isHovered ? 0.9 : 0.5} className="transition-all duration-200" />
                </g>
              );
            }

            // ─── Piece rendering ───
            const stack = state.board[key];
            if (!stack || stack.length === 0) return null;

            const isSelected = selectedPiece === key;
            const isValidDestination = info.isValidMove;

            return (
              <g
                key={`piece-${key}`}
                transform={`translate(${x}, ${y})`}
                onClick={() => isValidDestination ? onHexClick(info.pos) : onBoardPieceClick(key)}
                onPointerEnter={() => setHoveredHex(key)}
                onPointerLeave={() => setHoveredHex(null)}
                className="cursor-pointer"
                style={{
                  filter: isSelected ? 'url(#selected-glow)' : stack.length > 1 ? 'url(#stack-shadow)' : 'url(#piece-shadow)',
                  transition: 'transform 0.2s ease-out'
                }}
              >
                {/* Valid destination ring for beetle-climb */}
                {isValidDestination && (
                  <>
                    <polygon
                      points={hexPoints}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="4"
                      strokeLinejoin="round"
                      opacity="0.8"
                      className="animate-hex-breathe"
                    />
                    <polygon
                      points={hexPoints}
                      fill="var(--accent)"
                      opacity="0.15"
                    />
                  </>
                )}

                {/* Selection ring */}
                {isSelected && (
                  <polygon
                    points={hexPoints}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="5"
                    strokeLinejoin="round"
                    opacity="0.9"
                    className="animate-pulse-glow"
                  />
                )}

                {stack.map((piece, index) => {
                  const isTop = index === stack.length - 1;
                  const yOffset = -index * 9;
                  const isWhite = piece.color === 'white';
                  const scale = isTop ? 1 : Math.max(0.88, 1 - (stack.length - 1 - index) * 0.04);

                  return (
                    <g key={piece.id} transform={`translate(0, ${yOffset}) scale(${scale})`} className="transition-all duration-300">
                      {/* Main hex body */}
                      <polygon
                        points={hexPoints}
                        fill={isWhite ? 'url(#grad-white)' : 'url(#grad-black)'}
                        stroke={
                          isSelected && isTop
                            ? 'var(--accent)'
                            : isHovered && isTop
                            ? 'var(--hex-stroke-hover)'
                            : isWhite ? 'url(#stroke-white)' : 'url(#stroke-black)'
                        }
                        strokeWidth={isSelected && isTop ? "3.5" : isHovered && isTop ? "2.5" : isWhite ? "1.5" : "2.5"}
                        strokeLinejoin="round"
                        className={`transition-all duration-200 ${!isTop ? "brightness-[0.4]" : ""}`}
                      />

                      {/* Inner border bevel */}
                      {isTop && theme !== 'minimalist' && (
                        <polygon
                          points={hexPointsInner}
                          fill="none"
                          stroke={isWhite ? 'rgba(255,255,255,0.45)' : theme === 'modern' ? 'rgba(167,139,250,0.35)' : theme === 'wood' ? 'rgba(251,191,36,0.3)' : 'rgba(148,163,184,0.25)'}
                          strokeWidth="1.5"
                          strokeLinejoin="round"
                        />
                      )}

                      {/* Top highlight shine */}
                      {isTop && (
                        <polygon
                          points={hexPointsInner}
                          fill={isWhite ? 'rgba(255,255,255,0.12)' : theme === 'modern' ? 'rgba(167,139,250,0.12)' : theme === 'wood' ? 'rgba(251,191,36,0.1)' : 'rgba(148,163,184,0.08)'}
                          className="pointer-events-none"
                        />
                      )}

                      {/* Piece Style */}
                      <PieceIcon type={piece.type} pieceStyle={pieceStyle} color={piece.color} isTop={isTop} />

                      {/* Per-piece-type coloured accent marker for instant recognition */}
                      {isTop && (
                        <circle
                          cx="0"
                          cy="28"
                          r="5"
                          fill={PIECE_ACCENT[piece.type]}
                          opacity="0.85"
                          className="pointer-events-none"
                        />
                      )}

                      {/* Stack height badge */}
                      {isTop && stack.length > 1 && (
                        <g transform="translate(18, -18)">
                          <circle r="9" fill="var(--accent)" stroke="var(--bg-main)" strokeWidth="2" />
                          <text
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize="10"
                            fill="white"
                            fontWeight="bold"
                            style={{ fontFamily: 'var(--font-main)' }}
                          >
                            {stack.length}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
