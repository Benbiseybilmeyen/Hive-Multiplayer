import { PieceType, PlayerColor, PIECE_EMOJI, PieceStyle } from '../types';

/**
 * Distinct accent color per piece type — used across ALL styles
 * to ensure every bug is immediately recognisable.
 */
export const PIECE_ACCENT: Record<PieceType, string> = {
  queen:       '#facc15', // gold / yellow
  ant:         '#f43f5e', // rose / red
  grasshopper: '#22c55e', // green
  spider:      '#a855f7', // purple
  beetle:      '#3b82f6', // blue
};

/** Softer glow version of the accent */
export const PIECE_GLOW: Record<PieceType, string> = {
  queen:       'rgba(250,204,21,0.45)',
  ant:         'rgba(244,63,94,0.45)',
  grasshopper: 'rgba(34,197,94,0.45)',
  spider:      'rgba(168,85,247,0.45)',
  beetle:      'rgba(59,130,246,0.45)',
};

interface PieceIconProps {
  type: PieceType;
  pieceStyle: PieceStyle;
  color: PlayerColor;
  isTop: boolean;
}

export default function PieceIcon({ type, pieceStyle, color, isTop }: PieceIconProps) {
  const accent = PIECE_ACCENT[type];

  // ─── EMOJI style ─────────────────────────────────
  if (pieceStyle === 'emoji') {
    return (
      <g className={!isTop ? 'opacity-25' : ''}>
        {/* Coloured accent ring behind the emoji so you can tell types apart */}
        {isTop && (
          <circle
            r="14"
            cx="0"
            cy="0"
            fill="none"
            stroke={accent}
            strokeWidth="3"
            opacity="0.7"
          />
        )}
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={isTop ? '28' : '16'}
          fill={color === 'white' ? 'var(--hex-white-text)' : 'var(--hex-black-text)'}
          style={{ pointerEvents: 'none', fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji' }}
          y={isTop ? 1 : 0}
        >
          {PIECE_EMOJI[type]}
        </text>
      </g>
    );
  }

  // ─── NEON style ──────────────────────────────────
  if (pieceStyle === 'neon') {
    const gScale = isTop ? 0.38 : 0.26;
    const opacity = isTop ? 1 : 0.25;

    const renderNeon = () => {
      // Neon uses the accent colour as stroke + glow. Minimal, bold, contrasty.
      const s = accent;
      const sw = '4';
      switch (type) {
        case 'queen':
          // Crowned hexagon
          return (
            <g stroke={s} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round"
               filter="url(#neon-glow)">
              {/* Crown */}
              <polyline points="25,35 30,15 40,28 50,8 60,28 70,15 75,35" />
              {/* Base body */}
              <ellipse cx="50" cy="58" rx="22" ry="18" />
              {/* Stripes */}
              <line x1="32" y1="54" x2="68" y2="54" />
              <line x1="34" y1="64" x2="66" y2="64" />
              {/* Eyes */}
              <circle cx="42" cy="50" r="3" fill={s} />
              <circle cx="58" cy="50" r="3" fill={s} />
            </g>
          );
        case 'ant':
          // Three connected circles, 6 legs, antennae
          return (
            <g stroke={s} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round"
               filter="url(#neon-glow)">
              <circle cx="50" cy="20" r="8" />
              <circle cx="50" cy="42" r="7" />
              <circle cx="50" cy="68" r="12" />
              {/* Eyes */}
              <circle cx="46" cy="18" r="2.5" fill={s} />
              <circle cx="54" cy="18" r="2.5" fill={s} />
              {/* Antennae */}
              <path d="M 44 14 Q 30 2, 22 8" />
              <path d="M 56 14 Q 70 2, 78 8" />
              {/* Legs */}
              <line x1="43" y1="38" x2="18" y2="30" />
              <line x1="57" y1="38" x2="82" y2="30" />
              <line x1="43" y1="44" x2="15" y2="50" />
              <line x1="57" y1="44" x2="85" y2="50" />
              <line x1="44" y1="62" x2="20" y2="75" />
              <line x1="56" y1="62" x2="80" y2="75" />
            </g>
          );
        case 'grasshopper':
          // Slim body + huge bent back legs
          return (
            <g stroke={s} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round"
               filter="url(#neon-glow)">
              {/* Body */}
              <ellipse cx="50" cy="48" rx="10" ry="26" />
              {/* Head */}
              <circle cx="50" cy="18" r="8" />
              {/* Eyes */}
              <circle cx="45" cy="16" r="2.5" fill={s} />
              <circle cx="55" cy="16" r="2.5" fill={s} />
              {/* Front legs */}
              <polyline points="42,35 28,28 24,38" />
              <polyline points="58,35 72,28 76,38" />
              {/* Big back legs — distinctive! */}
              <polyline points="42,55 18,28 12,60" strokeWidth="5" />
              <polyline points="58,55 82,28 88,60" strokeWidth="5" />
              {/* Antennae */}
              <path d="M 46 12 Q 35 0, 25 5" />
              <path d="M 54 12 Q 65 0, 75 5" />
            </g>
          );
        case 'spider':
          // Two body segments + 8 curvy legs
          return (
            <g stroke={s} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round"
               filter="url(#neon-glow)">
              <circle cx="50" cy="30" r="10" />
              <ellipse cx="50" cy="58" rx="16" ry="18" />
              {/* Eyes — 8 dots in a row */}
              <circle cx="44" cy="26" r="2" fill={s} />
              <circle cx="50" cy="24" r="2" fill={s} />
              <circle cx="56" cy="26" r="2" fill={s} />
              <circle cx="47" cy="30" r="1.5" fill={s} />
              <circle cx="53" cy="30" r="1.5" fill={s} />
              {/* 8 legs */}
              <path d="M 42 28 Q 15 10, 5 25" />
              <path d="M 58 28 Q 85 10, 95 25" />
              <path d="M 40 34 Q 10 32, 5 48" />
              <path d="M 60 34 Q 90 32, 95 48" />
              <path d="M 38 52 Q 10 55, 8 75" />
              <path d="M 62 52 Q 90 55, 92 75" />
              <path d="M 40 64 Q 20 80, 15 95" />
              <path d="M 60 64 Q 80 80, 85 95" />
            </g>
          );
        case 'beetle':
          // Heavy carapace with split, horns, thick legs
          return (
            <g stroke={s} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round"
               filter="url(#neon-glow)">
              {/* Shell */}
              <path d="M 30 38 Q 30 12, 50 12 Q 70 12, 70 38 L 70 68 Q 70 88, 50 88 Q 30 88, 30 68 Z" />
              {/* Split line */}
              <line x1="50" y1="20" x2="50" y2="82" />
              {/* Head */}
              <circle cx="50" cy="18" r="6" fill={s} />
              {/* Mandibles */}
              <path d="M 45 14 L 38 6" strokeWidth="5" />
              <path d="M 55 14 L 62 6" strokeWidth="5" />
              {/* Legs */}
              <line x1="30" y1="42" x2="14" y2="36" />
              <line x1="70" y1="42" x2="86" y2="36" />
              <line x1="30" y1="56" x2="12" y2="56" />
              <line x1="70" y1="56" x2="88" y2="56" />
              <line x1="32" y1="68" x2="16" y2="78" />
              <line x1="68" y1="68" x2="84" y2="78" />
            </g>
          );
      }
    };

    return (
      <g
        transform={`translate(-${100 * gScale * 0.5}, -${100 * gScale * 0.5}) scale(${gScale})`}
        opacity={opacity}
        className="pointer-events-none"
      >
        {renderNeon()}
      </g>
    );
  }

  // ─── SVG styles (stick / tribal / rune) ────────────────
  const iconColor = color === 'white' ? '#0f172a' : '#f8fafc';
  const strokeW = '5';

  const gScale = isTop ? 0.35 : 0.25;
  const opacity = isTop ? 1 : 0.25;

  const renderStick = () => {
    switch (type) {
      case 'queen':
        return (
          <g stroke={iconColor} strokeWidth={strokeW} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="50" cy="55" rx="14" ry="20" />
            <circle cx="50" cy="25" r="8" />
            <line x1="42" y1="50" x2="58" y2="50" />
            <line x1="40" y1="60" x2="60" y2="60" />
            <path d="M 40 35 C 15 20, 10 50, 36 45" />
            <path d="M 60 35 C 85 20, 90 50, 64 45" />
            <path d="M 46 18 Q 40 10, 35 12" />
            <path d="M 54 18 Q 60 10, 65 12" />
            {/* Accent crown dots */}
            <circle cx="42" cy="14" r="3" fill={accent} stroke="none" />
            <circle cx="50" cy="10" r="3" fill={accent} stroke="none" />
            <circle cx="58" cy="14" r="3" fill={accent} stroke="none" />
          </g>
        );
      case 'ant':
        return (
          <g stroke={iconColor} strokeWidth={strokeW} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="50" cy="25" r="6" />
            <ellipse cx="50" cy="45" rx="5" ry="8" />
            <ellipse cx="50" cy="70" rx="8" ry="14" />
            <path d="M 46 20 Q 35 10, 30 15" />
            <path d="M 54 20 Q 65 10, 70 15" />
            <path d="M 45 40 L 25 35 L 15 45" />
            <path d="M 55 40 L 75 35 L 85 45" />
            <path d="M 45 45 L 20 45 L 15 60" />
            <path d="M 55 45 L 80 45 L 85 60" />
            <path d="M 46 50 L 25 65 L 20 85" />
            <path d="M 54 50 L 75 65 L 80 85" />
            {/* Accent eyes */}
            <circle cx="46" cy="23" r="2.5" fill={accent} stroke="none" />
            <circle cx="54" cy="23" r="2.5" fill={accent} stroke="none" />
          </g>
        );
      case 'grasshopper':
        return (
          <g stroke={iconColor} strokeWidth={strokeW} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 50 20 L 45 35 L 50 65 L 55 35 Z" />
            <path d="M 47 30 L 35 25 L 30 35" />
            <path d="M 53 30 L 65 25 L 70 35" />
            <path d="M 48 45 L 25 25 L 20 55 L 30 55" />
            <path d="M 52 45 L 75 25 L 80 55 L 70 55" />
            <path d="M 49 20 Q 35 5, 20 15" />
            <path d="M 51 20 Q 65 5, 80 15" />
            {/* Accent joints */}
            <circle cx="25" cy="25" r="3" fill={accent} stroke="none" />
            <circle cx="75" cy="25" r="3" fill={accent} stroke="none" />
          </g>
        );
      case 'spider':
        return (
          <g stroke={iconColor} strokeWidth={strokeW} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="50" cy="35" r="8" />
            <circle cx="50" cy="60" r="14" />
            <path d="M 44 33 Q 20 15, 10 30" />
            <path d="M 56 33 Q 80 15, 90 30" />
            <path d="M 42 37 Q 15 35, 10 50" />
            <path d="M 58 37 Q 85 35, 90 50" />
            <path d="M 43 41 Q 15 55, 15 75" />
            <path d="M 57 41 Q 85 55, 85 75" />
            <path d="M 44 45 Q 25 75, 20 95" />
            <path d="M 56 45 Q 75 75, 80 95" />
            {/* Accent hourglass */}
            <polygon points="46,55 50,48 54,55 50,62" fill={accent} stroke="none" />
          </g>
        );
      case 'beetle':
        return (
          <g stroke={iconColor} strokeWidth={strokeW} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 35 40 C 35 15, 65 15, 65 40 L 65 70 C 65 85, 35 85, 35 70 Z" />
            <line x1="50" y1="30" x2="50" y2="75" />
            <circle cx="50" cy="22" r="5" />
            <path d="M 47 18 L 40 10 L 45 5" />
            <path d="M 53 18 L 60 10 L 55 5" />
            <path d="M 35 45 L 20 40 L 15 50" />
            <path d="M 65 45 L 80 40 L 85 50" />
            <path d="M 35 55 L 20 55 L 15 65" />
            <path d="M 65 55 L 80 55 L 85 65" />
            <path d="M 37 65 L 25 75 L 20 85" />
            <path d="M 63 65 L 75 75 L 80 85" />
            {/* Accent head */}
            <circle cx="50" cy="22" r="5" fill={accent} stroke="none" />
          </g>
        );
    }
  };

  const renderTribal = () => {
    switch (type) {
      case 'queen':
        return (
          <g fill={iconColor}>
            <polygon points="50,25 35,50 50,75 65,50" />
            <polygon points="50,10 40,20 60,20" />
            <circle cx="50" cy="50" r="5" fill={accent} />
            <polygon points="20,40 30,50 20,60" />
            <polygon points="80,40 70,50 80,60" />
            {/* Crown tips in accent */}
            <circle cx="50" cy="10" r="4" fill={accent} />
            <circle cx="20" cy="50" r="3" fill={accent} />
            <circle cx="80" cy="50" r="3" fill={accent} />
          </g>
        );
      case 'ant':
        return (
          <g fill={iconColor}>
            <polygon points="50,20 45,30 50,40 55,30" />
            <polygon points="50,45 42,55 50,65 58,55" />
            <polygon points="50,70 40,85 50,100 60,85" />
            <polygon points="45,30 20,25 25,30 40,35" />
            <polygon points="55,30 80,25 75,30 60,35" />
            <polygon points="42,55 15,55 20,60 42,60" />
            <polygon points="58,55 85,55 80,60 58,60" />
            <polygon points="45,80 20,90 25,95 45,85" />
            <polygon points="55,80 80,90 75,95 55,85" />
            {/* Accent diamonds */}
            <circle cx="50" cy="30" r="3" fill={accent} />
            <circle cx="50" cy="55" r="3" fill={accent} />
          </g>
        );
      case 'grasshopper':
        return (
          <g fill={iconColor}>
            <polygon points="50,15 35,45 50,80 65,45" />
            <polygon points="40,55 15,30 10,70 30,65" />
            <polygon points="60,55 85,30 90,70 70,65" />
            <circle cx="50" cy="40" r="4" fill={accent} />
            {/* Accent knee joints */}
            <circle cx="15" cy="30" r="4" fill={accent} />
            <circle cx="85" cy="30" r="4" fill={accent} />
          </g>
        );
      case 'spider':
        return (
          <g fill={iconColor}>
            <polygon points="50,30 40,40 50,50 60,40" />
            <polygon points="50,55 35,70 50,85 65,70" />
            <path d="M 40 40 L 15 20 L 5 35 L 15 25 Z" />
            <path d="M 60 40 L 85 20 L 95 35 L 85 25 Z" />
            <path d="M 38 45 L 10 45 L 5 60 L 15 50 Z" />
            <path d="M 62 45 L 90 45 L 95 60 L 85 50 Z" />
            <path d="M 38 65 L 15 80 L 10 95 L 20 85 Z" />
            <path d="M 62 65 L 85 80 L 90 95 L 80 85 Z" />
            <path d="M 40 75 L 25 100 L 35 100 Z" />
            <path d="M 60 75 L 75 100 L 65 100 Z" />
            {/* Accent hourglass */}
            <polygon points="46,60 50,52 54,60 50,68" fill={accent} />
          </g>
        );
      case 'beetle':
        return (
          <g fill={iconColor}>
            <path d="M 30 35 L 70 35 L 80 65 L 50 85 L 20 65 Z" />
            <path d="M 48 35 L 52 35 L 52 82 L 48 82 Z" fill="var(--bg-main)" />
            <polygon points="45,15 55,15 60,30 40,30" />
            <polygon points="40,15 45,5 35,5 30,12" />
            <polygon points="60,15 55,5 65,5 70,12" />
            {/* Accent head */}
            <circle cx="50" cy="18" r="5" fill={accent} />
          </g>
        );
    }
  };

  // ─── RUNE style ──────────────────────────────────
  const renderRune = () => {
    // Rune style: circular seal with unique glyph per bug
    const s = accent;
    switch (type) {
      case 'queen':
        // Crown rune in circle
        return (
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="50" cy="50" r="38" stroke={iconColor} strokeWidth="3" />
            <circle cx="50" cy="50" r="34" stroke={iconColor} strokeWidth="1.5" strokeDasharray="4,4" />
            {/* Crown symbol */}
            <polyline points="25,55 32,30 42,45 50,20 58,45 68,30 75,55" stroke={s} strokeWidth="4.5" />
            <line x1="25" y1="55" x2="75" y2="55" stroke={s} strokeWidth="4.5" />
            {/* Jewel */}
            <circle cx="50" cy="68" r="5" fill={s} />
          </g>
        );
      case 'ant':
        // Trail / path rune
        return (
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="50" cy="50" r="38" stroke={iconColor} strokeWidth="3" />
            <circle cx="50" cy="50" r="34" stroke={iconColor} strokeWidth="1.5" strokeDasharray="4,4" />
            {/* Winding path – represents the ant's unlimited range */}
            <path d="M 25 65 Q 32 45, 50 50 Q 68 55, 60 35 Q 52 15, 75 25" stroke={s} strokeWidth="4.5" />
            {/* Nodes along path */}
            <circle cx="25" cy="65" r="4" fill={s} />
            <circle cx="50" cy="50" r="4" fill={s} />
            <circle cx="75" cy="25" r="4" fill={s} />
          </g>
        );
      case 'grasshopper':
        // Arrow / jump rune
        return (
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="50" cy="50" r="38" stroke={iconColor} strokeWidth="3" />
            <circle cx="50" cy="50" r="34" stroke={iconColor} strokeWidth="1.5" strokeDasharray="4,4" />
            {/* Upward arrow – represents jumping */}
            <line x1="50" y1="78" x2="50" y2="22" stroke={s} strokeWidth="5" />
            <polyline points="30,42 50,22 70,42" stroke={s} strokeWidth="5" />
            {/* Launch pad */}
            <line x1="35" y1="75" x2="65" y2="75" stroke={s} strokeWidth="4" />
          </g>
        );
      case 'spider':
        // Web rune
        return (
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="50" cy="50" r="38" stroke={iconColor} strokeWidth="3" />
            <circle cx="50" cy="50" r="34" stroke={iconColor} strokeWidth="1.5" strokeDasharray="4,4" />
            {/* Web rays */}
            <line x1="50" y1="50" x2="50" y2="15" stroke={s} strokeWidth="2.5" />
            <line x1="50" y1="50" x2="80" y2="30" stroke={s} strokeWidth="2.5" />
            <line x1="50" y1="50" x2="85" y2="55" stroke={s} strokeWidth="2.5" />
            <line x1="50" y1="50" x2="70" y2="82" stroke={s} strokeWidth="2.5" />
            <line x1="50" y1="50" x2="30" y2="82" stroke={s} strokeWidth="2.5" />
            <line x1="50" y1="50" x2="15" y2="55" stroke={s} strokeWidth="2.5" />
            <line x1="50" y1="50" x2="20" y2="30" stroke={s} strokeWidth="2.5" />
            {/* Inner ring */}
            <circle cx="50" cy="50" r="14" stroke={s} strokeWidth="2.5" />
            {/* Center */}
            <circle cx="50" cy="50" r="4" fill={s} />
          </g>
        );
      case 'beetle':
        // Shield rune
        return (
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="50" cy="50" r="38" stroke={iconColor} strokeWidth="3" />
            <circle cx="50" cy="50" r="34" stroke={iconColor} strokeWidth="1.5" strokeDasharray="4,4" />
            {/* Shield shape */}
            <path d="M 50 18 L 75 30 L 75 58 Q 75 78, 50 85 Q 25 78, 25 58 L 25 30 Z" stroke={s} strokeWidth="4" />
            {/* Vertical split */}
            <line x1="50" y1="25" x2="50" y2="80" stroke={s} strokeWidth="2.5" />
            {/* Cross detail */}
            <line x1="32" y1="48" x2="68" y2="48" stroke={s} strokeWidth="2.5" />
          </g>
        );
    }
  };

  const renderContent = () => {
    switch (pieceStyle) {
      case 'stick': return renderStick();
      case 'tribal': return renderTribal();
      case 'rune': return renderRune();
      default: return renderStick();
    }
  };

  return (
    <g
      transform={`translate(-${100 * gScale * 0.5}, -${100 * gScale * 0.5}) scale(${gScale})`}
      opacity={opacity}
      className="pointer-events-none"
    >
      {renderContent()}
    </g>
  );
}
