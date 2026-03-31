/**
 * RemoteLobby — Premium glassmorphism lobby for Remote PvP
 */
import { useState, useEffect, useRef } from 'react';
import { MultiplayerState } from '../hooks/useMultiplayer';
import { ChevronLeft, Copy, Check, Wifi, WifiOff, Loader2, Users, Zap, Globe, Settings } from 'lucide-react';

interface RemoteLobbyProps {
  mpState: MultiplayerState;
  onConnect: (url: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onDisconnect: () => void;
  onBack: () => void;
  onClearError: () => void;
}

export default function RemoteLobby({
  mpState,
  onConnect,
  onCreateRoom,
  onJoinRoom,
  onDisconnect,
  onBack,
  onClearError,
}: RemoteLobbyProps) {
  const getDefaultAddress = () => {
    if (typeof window !== 'undefined') {
      return window.location.hostname;
    }
    return 'localhost';
  };

  const getDefaultPort = () => {
    if (typeof window !== 'undefined' && window.location.port) {
      return window.location.port;
    }
    return '3001';
  };

  const [serverAddress, setServerAddress] = useState(getDefaultAddress());
  const [serverPort, setServerPort] = useState(getDefaultPort());
  const [showSettings, setShowSettings] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [lobbyMode, setLobbyMode] = useState<'select' | 'create' | 'join'>('select');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const isConnected = mpState.connectionState !== 'disconnected' && mpState.connectionState !== 'connecting';

  // Auto-connect on mount
  useEffect(() => {
    if (mpState.connectionState === 'disconnected') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${serverAddress}${serverPort ? ':' + serverPort : ''}`;
      onConnect(url);
    }
  }, []);

  const handleConnect = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${serverAddress}${serverPort ? ':' + serverPort : ''}`;
    onConnect(url);
  };

  const handleCopy = () => {
    if (mpState.roomCode) {
      navigator.clipboard.writeText(mpState.roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Code input handling — 6 separate boxes
  const handleCodeInput = (index: number, value: string) => {
    const char = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!char) return;

    const newCode = joinCode.split('');
    newCode[index] = char[0];
    const result = newCode.join('');
    setJoinCode(result);

    // Auto-advance to next
    if (index < 5 && char) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      if (joinCode[index]) {
        const newCode = joinCode.split('');
        newCode[index] = '';
        setJoinCode(newCode.join(''));
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
        const newCode = joinCode.split('');
        newCode[index - 1] = '';
        setJoinCode(newCode.join(''));
      }
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setJoinCode(paste);
    if (paste.length >= 6) {
      inputRefs.current[5]?.focus();
    }
  };

  const handleJoin = () => {
    if (joinCode.length === 6) {
      onJoinRoom(joinCode);
    }
  };

  const statusColor = {
    disconnected: '#ef4444',
    connecting: '#f59e0b',
    connected: '#22c55e',
    waiting: '#f59e0b',
    joined: '#22c55e',
    playing: '#22c55e',
    opponent_left: '#ef4444',
  }[mpState.connectionState];

  const statusText = {
    disconnected: 'Bağlantı Yok',
    connecting: 'Bağlanıyor...',
    connected: 'Bağlı',
    waiting: 'Rakip Bekleniyor',
    joined: 'Odaya Katıldı',
    playing: 'Oyun Başlıyor',
    opponent_left: 'Rakip Ayrıldı',
  }[mpState.connectionState];

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'var(--bg-main)' }}>
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full opacity-10 animate-float"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.4) 0%, transparent 70%)' }} />
        <div className="absolute bottom-1/4 right-1/3 w-80 h-80 rounded-full opacity-10 animate-float"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.4) 0%, transparent 70%)', animationDelay: '-3s' }} />
      </div>

      <div className="relative w-full max-w-md mx-4">
        {/* Header */}
        <div className="text-center mb-6">
          <button
            onClick={() => { onDisconnect(); onBack(); }}
            className="absolute left-0 top-0 p-2 rounded-lg border border-[var(--panel-border)] bg-[var(--panel-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-all"
          >
            <ChevronLeft size={20} />
          </button>

          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600/20 to-indigo-600/20 border border-purple-500/20 mb-3">
            <Globe size={28} className="text-purple-400" />
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Remote PvP</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">Arkadaşınla online oyna</p>
        </div>

        {/* Connection Status Bar */}
        <div className="glass-card p-3 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: statusColor }} />
            {isConnected ? <Wifi size={14} className="text-green-400" /> : <WifiOff size={14} className="text-red-400" />}
            <span className="text-xs text-[var(--text-secondary)]">{statusText}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-secondary)] font-mono opacity-60">
              {serverAddress}{serverPort ? `:${serverPort}` : ''}
            </span>
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1 rounded transition-colors ${showSettings ? 'text-[var(--accent)] bg-[var(--accent)]/10' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
              title="Sunucu Ayarları"
            >
              <Settings size={14} />
            </button>
          </div>
        </div>

        {/* Server Settings (Conditional) */}
        {(mpState.connectionState === 'disconnected' || showSettings) && (
          <div className="glass-card p-4 mb-4 animate-fade-in">
            <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Sunucu Bağlantısı</h3>
            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <label className="text-[10px] text-[var(--text-secondary)] mb-1 block">Adres</label>
                <input
                  type="text"
                  value={serverAddress}
                  onChange={e => setServerAddress(e.target.value)}
                  placeholder="192.168.1.x"
                  className="w-full bg-black/30 border border-[var(--panel-border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] outline-none transition-colors"
                />
              </div>
              <div className="w-20">
                <label className="text-[10px] text-[var(--text-secondary)] mb-1 block">Port</label>
                <input
                  type="text"
                  value={serverPort}
                  onChange={e => setServerPort(e.target.value)}
                  placeholder="3001"
                  className="w-full bg-black/30 border border-[var(--panel-border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] outline-none transition-colors"
                />
              </div>
            </div>
            <button
              onClick={handleConnect}
              className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-white font-semibold text-sm hover:bg-[var(--accent-hover)] transition-colors"
            >
              Bağlan
            </button>
            {mpState.error && (
              <div className="mt-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2" onClick={onClearError}>
                <span>⚠</span>
                <span>{mpState.error}</span>
              </div>
            )}
          </div>
        )}

        {/* Connecting spinner */}
        {mpState.connectionState === 'connecting' && (
          <div className="glass-card p-8 text-center animate-fade-in">
            <Loader2 size={32} className="text-[var(--accent)] animate-spin mx-auto mb-3" />
            <p className="text-sm text-[var(--text-secondary)]">Sunucuya bağlanılıyor...</p>
          </div>
        )}

        {/* Mode Selection (connected, not in room) */}
        {mpState.connectionState === 'connected' && lobbyMode === 'select' && (
          <div className="space-y-3 animate-fade-in">
            <button
              onClick={() => { console.log('Creating room...'); onCreateRoom(); setLobbyMode('create'); }}
              className="w-full flex items-center gap-4 p-5 rounded-xl border border-purple-500/20 bg-purple-500/5 hover:border-purple-500/40 hover:bg-purple-500/10 transition-all group glass-card"
            >
              <div className="bg-gradient-to-br from-purple-600 to-indigo-600 p-3.5 rounded-xl group-hover:shadow-[0_0_25px_rgba(139,92,246,0.4)] transition-all duration-300">
                <Zap size={22} className="text-white" />
              </div>
              <div className="text-left flex-1">
                <h3 className="font-bold text-base text-[var(--text-primary)]">Oda Oluştur</h3>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">Bir oda oluştur ve kodu arkadaşına gönder</p>
              </div>
            </button>

            <button
              onClick={() => setLobbyMode('join')}
              className="w-full flex items-center gap-4 p-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40 hover:bg-emerald-500/10 transition-all group glass-card"
            >
              <div className="bg-gradient-to-br from-emerald-600 to-teal-600 p-3.5 rounded-xl group-hover:shadow-[0_0_25px_rgba(16,185,129,0.4)] transition-all duration-300">
                <Users size={22} className="text-white" />
              </div>
              <div className="text-left flex-1">
                <h3 className="font-bold text-base text-[var(--text-primary)]">Odaya Katıl</h3>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">Arkadaşının oda kodunu gir</p>
              </div>
            </button>
          </div>
        )}

        {/* Transitioning to create room */}
        {mpState.connectionState === 'connected' && lobbyMode === 'create' && (
          <div className="glass-card p-6 text-center animate-fade-in">
            <Loader2 size={32} className="text-purple-400 animate-spin mx-auto mb-3" />
            <p className="text-sm text-[var(--text-secondary)]">Oda oluşturuluyor...</p>
          </div>
        )}

        {/* Waiting for opponent (room created) */}
        {mpState.connectionState === 'waiting' && (
          <div className="glass-card p-6 text-center animate-fade-in">
            <div className="mb-5">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-purple-500/10 border border-purple-500/20 mb-3">
                <Loader2 size={24} className="text-purple-400 animate-spin" />
              </div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">Rakip Bekleniyor</h3>
              <p className="text-xs text-[var(--text-secondary)]">Bu kodu arkadaşınla paylaş</p>
            </div>

            {/* Room Code Display */}
            <div className="relative mb-4">
              <div className="flex justify-center gap-2">
                {(mpState.roomCode || '------').split('').map((char, i) => (
                  <div
                    key={i}
                    className="w-12 h-14 flex items-center justify-center rounded-xl border-2 border-purple-500/30 bg-purple-500/5 text-xl font-bold text-purple-300 font-mono"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  >
                    {char}
                  </div>
                ))}
              </div>
              <button
                onClick={handleCopy}
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs hover:bg-purple-500/20 transition-colors"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Kopyalandı!' : 'Kodu Kopyala'}
              </button>
            </div>

            {/* Pulse animation */}
            <div className="flex items-center justify-center gap-1.5 text-[var(--text-secondary)]">
              <span className="flex h-2 w-2"><span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-purple-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span></span>
              <span className="text-[11px]">Bağlantı bekleniyor...</span>
            </div>

            <button
              onClick={() => { onDisconnect(); setLobbyMode('select'); }}
              className="mt-5 text-xs text-[var(--text-secondary)] hover:text-red-400 transition-colors"
            >
              İptal Et
            </button>
          </div>
        )}

        {/* Join Room UI */}
        {mpState.connectionState === 'connected' && lobbyMode === 'join' && (
          <div className="glass-card p-6 text-center animate-fade-in">
            <div className="mb-5">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-3">
                <Users size={24} className="text-emerald-400" />
              </div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">Odaya Katıl</h3>
              <p className="text-xs text-[var(--text-secondary)]">6 haneli oda kodunu gir</p>
            </div>

            {/* Code Input Boxes */}
            <div className="flex justify-center gap-2 mb-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <input
                  key={i}
                  ref={el => { inputRefs.current[i] = el; }}
                  type="text"
                  maxLength={1}
                  value={joinCode[i] || ''}
                  onChange={e => handleCodeInput(i, e.target.value)}
                  onKeyDown={e => handleCodeKeyDown(i, e)}
                  onPaste={i === 0 ? handleCodePaste : undefined}
                  className="w-12 h-14 text-center text-xl font-bold font-mono rounded-xl border-2 border-[var(--panel-border)] bg-black/30 text-[var(--text-primary)] focus:border-emerald-500 outline-none transition-all uppercase"
                />
              ))}
            </div>

            {mpState.error && (
              <div className="mb-4 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs" onClick={onClearError}>
                ⚠ {mpState.error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setLobbyMode('select'); setJoinCode(''); onClearError(); }}
                className="flex-1 py-2.5 rounded-lg border border-[var(--panel-border)] text-[var(--text-secondary)] text-sm hover:border-[var(--accent)] transition-colors"
              >
                Geri
              </button>
              <button
                onClick={handleJoin}
                disabled={joinCode.length !== 6}
                className="flex-1 py-2.5 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Katıl
              </button>
            </div>
          </div>
        )}

        {/* Joined, waiting for game start */}
        {mpState.connectionState === 'joined' && (
          <div className="glass-card p-6 text-center animate-fade-in">
            <Loader2 size={32} className="text-emerald-400 animate-spin mx-auto mb-3" />
            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">Odaya Katıldın!</h3>
            <p className="text-xs text-[var(--text-secondary)]">Oyun başlıyor...</p>
          </div>
        )}

        {/* Opponent Left */}
        {mpState.connectionState === 'opponent_left' && (
          <div className="glass-card p-6 text-center animate-fade-in">
            <div className="text-4xl mb-3">😔</div>
            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">Rakip Ayrıldı</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">Rakibiniz oyundan ayrıldı.</p>
            <button
              onClick={() => { onDisconnect(); setLobbyMode('select'); }}
              className="px-6 py-2.5 rounded-lg bg-[var(--accent)] text-white font-semibold text-sm hover:bg-[var(--accent-hover)] transition-colors"
            >
              Ana Menüye Dön
            </button>
          </div>
        )}

        {/* Info footer */}
        <div className="mt-4 text-center">
          <p className="text-[10px] text-[var(--text-secondary)] opacity-60">
            Artık tüm ağlarda çalışır! Sadece kodu paylaşın.
          </p>
        </div>
      </div>
    </div>
  );
}
