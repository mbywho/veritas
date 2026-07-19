import { Monitor, MonitorOff, MonitorPlay, FolderOpen, ChevronDown, ChevronUp, AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react';
import { clsx } from 'clsx';
import { useStore } from '../../store/useStore';
import { open } from '@tauri-apps/plugin-dialog';
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Projector from '../Projector';
import RemoteConnectCard from '../RemoteConnectCard';

interface MonitorInfo {
  name: string;
  width: number;
  height: number;
  scale_factor: number;
  x: number;
  y: number;
}

export default function RightPane() {
  const { isBlackout, theme, setTheme, toggleBlackout } = useStore();

  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [selectedMonitor, setSelectedMonitor] = useState<string>('');
  const [isQrOpen, setIsQrOpen] = useState(false);

  useEffect(() => {
    invoke<MonitorInfo[]>('get_available_monitors')
      .then(res => {
        setMonitors(res);
        if (res.length > 0) setSelectedMonitor(res[0].name);
      })
      .catch(console.error);
  }, []);

  const [previewScale, setPreviewScale] = useState(0.15);
  const previewWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!previewWrapperRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setPreviewScale(entry.contentRect.width / 1920);
      }
    });
    observer.observe(previewWrapperRef.current);
    return () => observer.disconnect();
  }, []);

  const handleShowProjector = async () => {
    if (!selectedMonitor) return;
    try {
      await invoke('launch_projector_window', { monitorName: selectedMonitor });
    } catch (e) {
      console.error("Failed to launch projector window", e);
    }
  };

  const handleBrowseMedia = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Media',
          extensions: theme.bgType === 'video' ? ['mp4', 'webm'] : ['jpg', 'jpeg', 'png', 'gif', 'webp']
        }]
      });
      if (selected && typeof selected === 'string') {
        const url = `http://localhost:8080/media?path=${encodeURIComponent(selected)}`;
        setTheme({ bgValue: url });
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="w-80 h-full bg-secondary border-l border-border flex flex-col shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.1)] z-10">
      {/* Live Monitor Header */}
      <div className="p-4 border-b border-border bg-background/50 backdrop-blur-md flex justify-between items-center">
        <h2 className="text-sm font-bold tracking-tight text-foreground uppercase flex items-center gap-2">
          <Monitor size={16} className="text-rose-500" />
          Live Output
        </h2>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
          </span>
          <span className="text-xs font-semibold text-rose-500">LIVE</span>
        </div>
      </div>

      <div className="p-4 border-b border-border bg-black/5">
        <div
          ref={previewWrapperRef}
          className="relative w-full aspect-video bg-black rounded-md overflow-hidden ring-1 ring-white/10 shadow-2xl"
        >
          <div
            className="absolute top-0 left-0 w-[1920px] h-[1080px] origin-top-left"
            style={{ transform: `scale(${previewScale})` }}
          >
            <Projector isPreview={true} />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">

        {/* Output Settings */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Output Settings</h3>
          <div className="space-y-3 mb-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Select Display</label>
              <select
                className="w-full bg-background border border-border rounded p-2 text-sm text-foreground focus:outline-none focus:border-blue-500"
                value={selectedMonitor}
                onChange={(e) => setSelectedMonitor(e.target.value)}
              >
                {monitors.map((m, i) => (
                  <option key={m.name} value={m.name}>
                    Display {i + 1}: {m.name} ({m.width}x{m.height})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleShowProjector}
                disabled={!selectedMonitor}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-all shadow-sm shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <MonitorPlay size={16} />
                Relaunch Projector
              </button>
              <button
                onClick={async () => {
                  try {
                    await invoke('close_projector_window');
                  } catch (e) {
                    console.error("Failed to close projector window", e);
                  }
                }}
                className="px-4 flex items-center justify-center rounded-md bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 transition-colors border border-rose-500/20"
                title="Close Projector"
              >
                <MonitorOff size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</h3>
          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={toggleBlackout}
              className={clsx(
                "flex items-center justify-center gap-2 py-3 rounded-md text-sm font-medium transition-all shadow-sm",
                isBlackout
                  ? "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20"
                  : "bg-background border border-border hover:bg-secondary text-foreground"
              )}
            >
              <MonitorOff size={16} />
              Clear Screen
            </button>
          </div>
        </div>

        {/* Theme Settings */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center justify-between">
            Theme Settings
          </h3>
          <div className="space-y-4">

            {/* Background Settings Card */}
            <div className="bg-background/50 border border-border/50 rounded-lg p-3 space-y-3">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Background</h4>
              
              <div className="space-y-2">
                <select
                  className="w-full h-9 bg-background border border-border rounded px-2 text-sm text-foreground focus:outline-none focus:border-blue-500"
                  value={theme.bgType}
                  onChange={(e) => setTheme({ bgType: e.target.value as 'color' | 'image' | 'video', bgValue: '' })}
                >
                  <option value="color">Solid Color</option>
                  <option value="image">Image Background</option>
                  <option value="video">Video Background</option>
                </select>

                {theme.bgType === 'color' ? (
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={theme.bgValue}
                      onChange={(e) => setTheme({ bgValue: e.target.value })}
                      className="flex-1 bg-background border border-border rounded px-2 text-sm text-foreground focus:outline-none focus:border-blue-500 h-9"
                    />
                  </div>
                ) : (
                  <div
                    onClick={handleBrowseMedia}
                    className="relative w-full h-24 bg-background border-2 border-dashed border-border hover:border-blue-500 rounded-lg overflow-hidden cursor-pointer flex flex-col items-center justify-center group transition-colors"
                  >
                    {theme.bgValue ? (
                      <>
                        {theme.bgType === 'image' ? (
                          <img src={theme.bgValue} alt="Background" className="absolute inset-0 w-full h-full object-cover" />
                        ) : (
                          <video src={theme.bgValue} className="absolute inset-0 w-full h-full object-cover" muted loop />
                        )}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity gap-1 backdrop-blur-sm z-10">
                          <FolderOpen size={16} className="text-white" />
                          <span className="text-[10px] font-semibold text-white uppercase tracking-wider">Change {theme.bgType}</span>
                        </div>
                      </>
                    ) : (
                      <div className="text-muted-foreground flex flex-col items-center gap-1 group-hover:text-blue-500 transition-colors z-10">
                        <FolderOpen size={20} />
                        <span className="text-[10px] font-medium uppercase tracking-wider">Browse {theme.bgType}</span>
                      </div>
                    )}
                  </div>
                )}

                {theme.bgType !== 'color' && (
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-medium text-muted-foreground">Dimming</label>
                        <div className="flex items-center text-[10px] text-muted-foreground bg-background border border-border/50 rounded px-1">
                          <input
                            type="number" min="0" max="100"
                            value={theme.bgDim ?? 40}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              if (!isNaN(val)) setTheme({ bgDim: val });
                            }}
                            className="hide-arrows w-7 bg-transparent text-right focus:outline-none focus:text-foreground p-0 border-none"
                          />
                          <span>%</span>
                        </div>
                      </div>
                      <input
                        type="range" min="0" max="100" step="5"
                        value={theme.bgDim ?? 40}
                        onChange={(e) => setTheme({ bgDim: parseInt(e.target.value) })}
                        className="w-full accent-blue-500 cursor-pointer"
                      />
                    </div>
                    
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-medium text-muted-foreground">Blur</label>
                        <div className="flex items-center text-[10px] text-muted-foreground bg-background border border-border/50 rounded px-1">
                          <input
                            type="number" min="0" max="100"
                            value={theme.bgBlur ?? 2}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              if (!isNaN(val)) setTheme({ bgBlur: val });
                            }}
                            className="hide-arrows w-7 bg-transparent text-right focus:outline-none focus:text-foreground p-0 border-none"
                          />
                          <span>px</span>
                        </div>
                      </div>
                      <input
                        type="range" min="0" max="20" step="1"
                        value={theme.bgBlur ?? 2}
                        onChange={(e) => setTheme({ bgBlur: parseInt(e.target.value) })}
                        className="w-full accent-blue-500 cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Typography Settings Card */}
            <div className="bg-background/50 border border-border/50 rounded-lg p-3 space-y-3">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Typography</h4>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-muted-foreground">Primary Font</label>
                  <select
                    className="w-full h-8 bg-background border border-border rounded px-2 text-xs text-foreground focus:outline-none focus:border-blue-500"
                    value={theme.mainFontFamily || 'serif'}
                    onChange={(e) => setTheme({ mainFontFamily: e.target.value })}
                  >
                    <option value="serif">Serif (Default)</option>
                    <option value="sans-serif">Sans Serif</option>
                    <option value="ui-sans-serif, system-ui, sans-serif">System</option>
                    <option value="monospace">Monospace</option>
                    <option value="'Inter', sans-serif">Inter</option>
                    <option value="'Noto Sans', sans-serif">Noto Sans</option>
                    <option value="'Baloo 2', sans-serif">Baloo</option>
                    <option value="'Georgia', serif">Georgia</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-muted-foreground">Secondary Font</label>
                  <select
                    className="w-full h-8 bg-background border border-border rounded px-2 text-xs text-foreground focus:outline-none focus:border-blue-500"
                    value={theme.subFontFamily || 'serif'}
                    onChange={(e) => setTheme({ subFontFamily: e.target.value })}
                  >
                    <option value="serif">Serif (Default)</option>
                    <option value="sans-serif">Sans Serif</option>
                    <option value="ui-sans-serif, system-ui, sans-serif">System</option>
                    <option value="monospace">Monospace</option>
                    <option value="'Inter', sans-serif">Inter</option>
                    <option value="'Noto Sans', sans-serif">Noto Sans</option>
                    <option value="'Baloo 2', sans-serif">Baloo</option>
                    <option value="'Georgia', serif">Georgia</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5 col-span-2">
                  <div className="flex justify-between items-center h-4">
                    <label className="text-[10px] font-medium text-muted-foreground">Weight</label>
                    <span className="text-[10px] text-foreground bg-background border border-border/50 rounded px-1">{theme.fontWeight ?? 800}</span>
                  </div>
                  <input
                    type="range" min="100" max="900" step="100"
                    value={theme.fontWeight ?? 800}
                    onChange={(e) => setTheme({ fontWeight: parseInt(e.target.value) })}
                    className="w-full accent-blue-500 cursor-pointer mt-1"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-muted-foreground block h-4">Color</label>
                  <div className="relative w-full h-8 rounded border border-border overflow-hidden cursor-pointer">
                    <input
                      type="color"
                      value={theme.fontColor || '#ffffff'}
                      onChange={(e) => setTheme({ fontColor: e.target.value })}
                      className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="flex items-center justify-between bg-background border border-border rounded px-2 py-1.5">
                  <label className="text-[10px] text-muted-foreground whitespace-nowrap mr-2">Main Size</label>
                  <input
                    type="number" min="10" max="200"
                    value={theme.mainFontSize ?? 70}
                    onChange={(e) => setTheme({ mainFontSize: parseInt(e.target.value) || 90 })}
                    className="w-12 bg-transparent text-right text-xs focus:outline-none"
                  />
                </div>
                <div className="flex items-center justify-between bg-background border border-border rounded px-2 py-1.5">
                  <label className="text-[10px] text-muted-foreground whitespace-nowrap mr-2">Sub Size</label>
                  <input
                    type="number" min="10" max="200"
                    value={theme.subFontSize ?? 70}
                    onChange={(e) => setTheme({ subFontSize: parseInt(e.target.value) || 60 })}
                    className="w-12 bg-transparent text-right text-xs focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Layout Card */}
            <div className="bg-background/50 border border-border/50 rounded-lg p-3 space-y-3">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Layout</h4>
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-muted-foreground">Alignment</label>
                <div className="flex bg-background border border-border rounded overflow-hidden h-8">
                  {[
                    { val: 'left', icon: <AlignLeft size={14} /> },
                    { val: 'center', icon: <AlignCenter size={14} /> },
                    { val: 'right', icon: <AlignRight size={14} /> },
                    { val: 'justify', icon: <AlignJustify size={14} /> },
                  ].map(({ val, icon }) => (
                    <button
                      key={val}
                      onClick={() => setTheme({ textAlign: val as any })}
                      className={clsx(
                        "flex-1 flex items-center justify-center transition-colors",
                        theme.textAlign === val
                          ? "bg-blue-500 text-white"
                          : "hover:bg-secondary text-muted-foreground"
                      )}
                      title={val}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center justify-between bg-background border border-border rounded px-2 py-1.5">
                  <label className="text-[10px] text-muted-foreground whitespace-nowrap mr-2">Padding</label>
                  <input
                    type="number" min="0" max="50"
                    value={theme.padding ?? 0}
                    onChange={(e) => setTheme({ padding: parseInt(e.target.value) || 0 })}
                    className="w-12 bg-transparent text-right text-xs focus:outline-none"
                  />
                </div>
                <div className="flex items-center justify-between bg-background border border-border rounded px-2 py-1.5">
                  <label className="text-[10px] text-muted-foreground whitespace-nowrap mr-2">Top Margin</label>
                  <input
                    type="number" min="-100" max="100"
                    value={theme.margin ?? 0}
                    onChange={(e) => setTheme({ margin: parseInt(e.target.value) || 0 })}
                    className="w-12 bg-transparent text-right text-xs focus:outline-none"
                  />
                </div>
                <div className="flex items-center justify-between bg-background border border-border rounded px-2 py-1.5">
                  <label className="text-[10px] text-muted-foreground whitespace-nowrap mr-2">Text Gap</label>
                  <input
                    type="number" min="-100" max="100"
                    value={theme.translationSpacing ?? 0}
                    onChange={(e) => setTheme({ translationSpacing: parseInt(e.target.value) || 0 })}
                    className="w-12 bg-transparent text-right text-xs focus:outline-none"
                  />
                </div>
                <div className="flex items-center justify-between bg-background border border-border rounded px-2 py-1.5">
                  <label className="text-[10px] text-muted-foreground whitespace-nowrap mr-2">Line Height</label>
                  <input
                    type="number" step="0.1" min="0.5" max="3.0"
                    value={theme.lineHeight ?? 1.4}
                    onChange={(e) => setTheme({ lineHeight: parseFloat(e.target.value) || 1.2 })}
                    className="w-12 bg-transparent text-right text-xs focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Effects Card */}
            <div className="bg-background/50 border border-border/50 rounded-lg p-3 space-y-3">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Effects</h4>
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-muted-foreground">Shadow / Outline</label>
                <select
                  className="w-full h-8 bg-background border border-border rounded px-2 text-xs text-foreground focus:outline-none focus:border-blue-500"
                  value={theme.textShadow}
                  onChange={(e) => setTheme({ textShadow: e.target.value })}
                >
                  <option value="none">None</option>
                  <option value="0 4px 12px rgba(0,0,0,0.8)">Soft Drop Shadow</option>
                  <option value="2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000">Hard Outline</option>
                  <option value="2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 10px 25px rgba(0,0,0,1)">Outline + Shadow</option>
                </select>
              </div>

              <label className="flex items-center justify-between p-2 rounded border border-border bg-background cursor-pointer group hover:border-border/80 transition-colors">
                <span className="text-xs font-medium text-foreground select-none">Smooth Transitions</span>
                <input
                  type="checkbox"
                  checked={theme.smoothTransitions ?? false}
                  onChange={(e) => setTheme({ smoothTransitions: e.target.checked })}
                  className="w-3.5 h-3.5 rounded border-border text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Remote Connect (Collapsible) */}
        <div className="pt-2">
          <button
            onClick={() => setIsQrOpen(!isQrOpen)}
            className="w-full flex items-center justify-between text-left group"
          >
            <h3 className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors uppercase tracking-wider">Remote Connect</h3>
            {isQrOpen ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
          </button>

          {isQrOpen && (
            <div className="mt-3">
              <RemoteConnectCard />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
