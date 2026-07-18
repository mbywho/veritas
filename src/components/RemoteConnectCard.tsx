import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import QRCode from 'react-qr-code';
import { Smartphone } from 'lucide-react';

export default function RemoteConnectCard() {
  const [ipAddress, setIpAddress] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchIp() {
      try {
        const ip = await invoke<string>('get_local_ip');
        setIpAddress(ip);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }
    fetchIp();
  }, []);

  if (loading) {
    return (
      <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-xl p-6 flex items-center justify-center min-h-[200px]">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-xs text-white/50 font-medium">Generating connection...</p>
        </div>
      </div>
    );
  }

  if (error || !ipAddress) {
    return (
      <div className="bg-white/5 backdrop-blur-2xl border border-rose-500/20 rounded-xl p-6 flex flex-col items-center justify-center min-h-[200px] text-center gap-2">
        <Smartphone className="text-rose-400 w-8 h-8 mb-2 opacity-80" />
        <p className="text-sm font-semibold text-rose-200">Connection Unavailable</p>
        <p className="text-xs text-rose-300/70">{error || 'Could not determine local IP'}</p>
      </div>
    );
  }

  const remoteUrl = `http://${ipAddress}:8080/remote`;

  return (
    <div className="relative overflow-hidden bg-gradient-to-b from-white/[0.08] to-transparent backdrop-blur-2xl border border-white/10 rounded-xl p-6 shadow-2xl">
      {/* Subtle glow effect */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-blue-500/20 rounded-full blur-[50px] -z-10 pointer-events-none" />
      
      <div className="flex flex-col items-center text-center">
        <div className="mb-6 p-4 bg-white rounded-xl shadow-lg ring-1 ring-black/5">
          <QRCode
            value={remoteUrl}
            size={140}
            level="H"
            className="w-auto h-auto max-w-full"
          />
        </div>
        
        <h3 className="text-sm font-semibold tracking-tight text-white/90 mb-1">
          Connect Remote
        </h3>
        <p className="text-xs text-white/60 max-w-[200px] leading-relaxed mb-4">
          Scan to open the presentation remote on your device.
        </p>
        
        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/20 border border-white/5 rounded-full backdrop-blur-md">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          <code className="text-[10px] text-emerald-100 font-mono tracking-wider">
            {remoteUrl}
          </code>
        </div>
      </div>
    </div>
  );
}
