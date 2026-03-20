import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Upload, Play, Square, Download,
  Trash2, CheckCircle2, Pause, Film, Globe,
  Plus, Video, ChevronRight, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import MOCK_ITEMS_DATA from "../data.json";

const MOCK_ITEMS: { id: string; category: string; subcategory?: string; rarity: string; name: { zh: string; en: string }; image?: string }[] = MOCK_ITEMS_DATA;

const RARITIES: Record<string, { color: string; zh: string; en: string }> = {
  mythic:       { color: "#ef4444", zh: "神话",  en: "Mythic" },
  legendary:    { color: "#f59e0b", zh: "传说",  en: "Legendary" },
  epic:         { color: "#8b5cf6", zh: "史诗",  en: "Epic" },
  rare:         { color: "#3b82f6", zh: "稀有",  en: "Rare" },
  red_card:     { color: "#ef4444", zh: "红卡",  en: "Red Card" },
  gold_card:    { color: "#f59e0b", zh: "金卡",  en: "Gold Card" },
  purple_card:  { color: "#8b5cf6", zh: "紫卡",  en: "Purple Card" },
  blue_card:    { color: "#3b82f6", zh: "蓝卡",  en: "Blue Card" },
};

interface MarkedEvent {
  id: string;
  timestamp: number;
  item: typeof MOCK_ITEMS[0];
}

interface ActiveCard {
  uid: string;
  item: typeof MOCK_ITEMS[0];
  startTime: number;
  duration: number;
}

const CARD_W = 280;
const CARD_H = 72;
const CARD_X_OFFSET = 16;
const CARD_Y_START = 80;
const CARD_GAP = 8;
const MAX_STACK = 4;

export default function VideoExport() {
  const [lang, setLang] = useState<"zh" | "en">("zh");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoSize, setVideoSize] = useState({ w: 1920, h: 1080 });

  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const [markedEvents, setMarkedEvents] = useState<MarkedEvent[]>([]);
  const markedEventsRef = useRef<MarkedEvent[]>([]);

  const [activeCards, setActiveCards] = useState<ActiveCard[]>([]);
  const activeCardsRef = useRef<ActiveCard[]>([]);
  const scheduledRef = useRef<Set<string>>(new Set());

  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [exportDone, setExportDone] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  const [overlayScale, setOverlayScale] = useState([1]);
  const [cardLifetime, setCardLifetime] = useState([8]);

  // Item picker state
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTimestamp, setPickerTimestamp] = useState(0);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerRarity, setPickerRarity] = useState<string>('all');

  // Progress bar drag
  const progressBarRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const loadedImagesRef = useRef<Record<string, HTMLImageElement>>({});

  useEffect(() => {
    MOCK_ITEMS.forEach(item => {
      if (item.image && !loadedImagesRef.current[item.id]) {
        const img = new Image();
        img.src = item.image;
        img.onload = () => { loadedImagesRef.current[item.id] = img; };
      }
    });
  }, []);

  useEffect(() => { markedEventsRef.current = markedEvents; }, [markedEvents]);
  useEffect(() => { activeCardsRef.current = activeCards; }, [activeCards]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const handleFileInput = (file: File) => {
    if (!file.type.startsWith('video/')) return;
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setMarkedEvents([]);
    setCurrentTime(0);
    setIsPlaying(false);
    setIsPaused(false);
    setExportDone(false);
    setExportUrl(null);
    scheduledRef.current = new Set();
    cancelAnimationFrame(animFrameRef.current);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileInput(file);
  };

  const handleVideoLoaded = () => {
    const v = videoRef.current;
    if (!v) return;
    setVideoDuration(v.duration);
    setVideoSize({ w: v.videoWidth || 1920, h: v.videoHeight || 1080 });
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = v.videoWidth || 1920;
      canvas.height = v.videoHeight || 1080;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(v, 0, 0);
    }
  };

  // ── CARD DRAWING ──
  const drawCardOnCanvas = useCallback((
    ctx: CanvasRenderingContext2D,
    item: typeof MOCK_ITEMS[0],
    slotIndex: number,
    animProgress: number,
    scale: number,
    canvasW: number
  ) => {
    const rarity = RARITIES[item.rarity] || RARITIES.mythic;
    const W = CARD_W * scale; const H = CARD_H * scale;
    const x = canvasW - W - CARD_X_OFFSET * scale;
    const y = CARD_Y_START * scale + slotIndex * (H + CARD_GAP * scale);
    const T_enter = 0.08, T_pause1 = 0.18, T_expand = 0.28, T_shrink = 0.38, T_hold = 0.85;

    let cardX = x, cardScale = scale, opacity = 1, cardY = y;
    if (animProgress < T_enter) {
      const p = animProgress / T_enter;
      cardX = x + (1 - p) * W; opacity = p;
    } else if (animProgress < T_pause1) {
      cardX = x;
    } else if (animProgress < T_expand) {
      const p = (animProgress - T_pause1) / (T_expand - T_pause1);
      cardScale = scale * (1 + p * 0.3); cardX = x - (cardScale - scale) * 0.3 * W;
    } else if (animProgress < T_shrink) {
      const p = (animProgress - T_expand) / (T_shrink - T_expand);
      cardScale = scale * (1.3 - p * 0.3); cardX = x - (cardScale - scale) * 0.3 * W;
    } else if (animProgress < T_hold) {
      cardX = x;
    } else {
      const p = (animProgress - T_hold) / (1 - T_hold);
      opacity = 1 - p; cardY = y - p * H * 1.5;
    }

    ctx.save(); ctx.globalAlpha = Math.max(0, opacity);
    const barW = 5 * cardScale;
    ctx.fillStyle = 'rgba(10, 12, 18, 0.93)';
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.rect(cardX, cardY, CARD_W * cardScale, H); ctx.fill(); ctx.stroke();
    ctx.fillStyle = rarity.color;
    ctx.shadowColor = rarity.color; ctx.shadowBlur = 8;
    ctx.fillRect(cardX, cardY, barW, H); ctx.shadowBlur = 0;
    const iconSize = H * 0.7;
    const iconX = cardX + barW + 8 * cardScale;
    const iconY = cardY + (H - iconSize) / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(iconX, iconY, iconSize, iconSize);
    const img = item.image ? loadedImagesRef.current[item.id] : null;
    if (img) { try { ctx.drawImage(img, iconX + 2, iconY + 2, iconSize - 4, iconSize - 4); } catch {} }
    const textX = iconX + iconSize + 8 * cardScale;
    ctx.fillStyle = rarity.color;
    ctx.font = `bold ${10 * cardScale}px Arial, sans-serif`;
    ctx.fillText((rarity[lang] || '').toUpperCase(), textX, cardY + H * 0.38);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = `bold ${13 * cardScale}px Arial, sans-serif`;
    const name = item.name[lang] || item.name.zh;
    const maxW = CARD_W * cardScale - (textX - cardX) - 8 * cardScale;
    let displayName = name;
    while (ctx.measureText(displayName).width > maxW && displayName.length > 1) displayName = displayName.slice(0, -1);
    if (displayName !== name) displayName += '…';
    ctx.fillText(displayName, textX, cardY + H * 0.68);
    ctx.restore();
  }, [lang]);

  const renderFrame = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement, cards: ActiveCard[], tMs: number) => {
    const ctx = canvas.getContext('2d')!;
    const scale = overlayScale[0];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const visible = cards.filter(c => tMs >= c.startTime && tMs < c.startTime + c.duration).slice(-MAX_STACK);
    visible.forEach((card, idx) => {
      const progress = Math.min(1, (tMs - card.startTime) / card.duration);
      drawCardOnCanvas(ctx, card.item, idx, progress, scale, canvas.width);
    });
  }, [overlayScale, drawCardOnCanvas]);

  // ── PLAYBACK ──
  const playbackLoop = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
    const loop = () => {
      const tMs = video.currentTime * 1000;
      setCurrentTime(video.currentTime);

      markedEventsRef.current.forEach(evt => {
        if (scheduledRef.current.has(evt.id)) return;
        if (tMs >= evt.timestamp * 1000 - 50) {
          scheduledRef.current.add(evt.id);
          const newCard: ActiveCard = {
            uid: `${evt.id}_play`,
            item: evt.item,
            startTime: evt.timestamp * 1000,
            duration: cardLifetime[0] * 1000,
          };
          activeCardsRef.current = [...activeCardsRef.current, newCard];
          setActiveCards([...activeCardsRef.current]);
        }
      });

      renderFrame(video, canvas, activeCardsRef.current, tMs);

      if (!video.paused && !video.ended) {
        animFrameRef.current = requestAnimationFrame(loop);
      } else if (video.ended) {
        setIsPlaying(false); setIsPaused(false);
      }
    };
    animFrameRef.current = requestAnimationFrame(loop);
  }, [renderFrame, cardLifetime]);

  const handlePlay = () => {
    const video = videoRef.current; const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = videoSize.w; canvas.height = videoSize.h;
    setShowPicker(false);

    if (isPaused) {
      video.play().then(() => { setIsPlaying(true); setIsPaused(false); playbackLoop(video, canvas); });
    } else {
      video.currentTime = 0;
      scheduledRef.current = new Set();
      setActiveCards([]); activeCardsRef.current = [];
      setCurrentTime(0);
      video.play().then(() => { setIsPlaying(true); setIsPaused(false); playbackLoop(video, canvas); });
    }
  };

  const handlePause = () => {
    const video = videoRef.current; if (!video) return;
    video.pause();
    cancelAnimationFrame(animFrameRef.current);
    setIsPlaying(false); setIsPaused(true);
  };

  const handleStop = () => {
    const video = videoRef.current; if (!video) return;
    video.pause();
    cancelAnimationFrame(animFrameRef.current);
    setIsPlaying(false); setIsPaused(false);
    setActiveCards([]); activeCardsRef.current = [];
    scheduledRef.current = new Set();
    video.currentTime = 0; setCurrentTime(0);
    const canvas = canvasRef.current;
    if (canvas) { const ctx = canvas.getContext('2d')!; ctx.drawImage(video, 0, 0); }
  };

  // ── MARK EVENT AT CURRENT TIME ──
  const handleMarkLoot = () => {
    const video = videoRef.current; if (!video) return;
    if (isPlaying) {
      video.pause();
      cancelAnimationFrame(animFrameRef.current);
      setIsPlaying(false); setIsPaused(true);
    }
    setPickerTimestamp(video.currentTime);
    setPickerQuery('');
    setPickerRarity('all');
    setShowPicker(true);
  };

  const handlePickerSelect = (item: typeof MOCK_ITEMS[0]) => {
    const evt: MarkedEvent = {
      id: `mark_${Date.now()}`,
      timestamp: parseFloat(pickerTimestamp.toFixed(2)),
      item,
    };
    setMarkedEvents(prev => [...prev, evt].sort((a, b) => a.timestamp - b.timestamp));
    setShowPicker(false);
  };

  const handleDeleteEvent = (id: string) => {
    setMarkedEvents(prev => prev.filter(e => e.id !== id));
  };

  // ── PROGRESS BAR ──
  const seekTo = (pct: number) => {
    const video = videoRef.current; if (!video) return;
    const t = pct * videoDuration;
    video.currentTime = t;
    setCurrentTime(t);
    scheduledRef.current = new Set(
      markedEventsRef.current.filter(e => e.timestamp * 1000 < t * 1000).map(e => e.id)
    );
    if (!isPlaying && !isPaused) {
      const canvas = canvasRef.current;
      if (canvas) { const ctx = canvas.getContext('2d')!; ctx.drawImage(video, 0, 0); }
    }
  };

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    const bar = progressBarRef.current; if (!bar) return;
    const rect = bar.getBoundingClientRect();
    seekTo(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  };
  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const bar = progressBarRef.current; if (!bar) return;
    const rect = bar.getBoundingClientRect();
    seekTo(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  };
  const handleProgressMouseUp = () => { isDraggingRef.current = false; };

  // ── EXPORT ──
  const startExport = async () => {
    const video = videoRef.current; const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = videoSize.w; canvas.height = videoSize.h;
    video.currentTime = 0;
    scheduledRef.current = new Set();
    setActiveCards([]); activeCardsRef.current = [];
    chunksRef.current = [];
    setExportDone(false); setExportUrl(null); setRecordProgress(0);

    const stream = canvas.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      setExportUrl(URL.createObjectURL(new Blob(chunksRef.current, { type: mimeType })));
      setExportDone(true); setIsRecording(false);
      cancelAnimationFrame(animFrameRef.current);
    };
    recorder.start(100);
    setIsRecording(true);

    const dur = video.duration;
    const loop = () => {
      const tMs = video.currentTime * 1000;
      setRecordProgress(Math.round((video.currentTime / dur) * 100));
      setCurrentTime(video.currentTime);
      markedEventsRef.current.forEach(evt => {
        if (scheduledRef.current.has(evt.id)) return;
        if (tMs >= evt.timestamp * 1000 - 50) {
          scheduledRef.current.add(evt.id);
          const nc: ActiveCard = { uid: evt.id, item: evt.item, startTime: evt.timestamp * 1000, duration: cardLifetime[0] * 1000 };
          activeCardsRef.current = [...activeCardsRef.current, nc];
          setActiveCards([...activeCardsRef.current]);
        }
      });
      renderFrame(video, canvas, activeCardsRef.current, tMs);
      if (!video.ended && !video.paused) animFrameRef.current = requestAnimationFrame(loop);
      else recorder.stop();
    };
    await video.play();
    setIsPlaying(true); setIsPaused(false);
    animFrameRef.current = requestAnimationFrame(loop);
  };

  const stopExport = () => {
    videoRef.current?.pause();
    mediaRecorderRef.current?.stop();
    cancelAnimationFrame(animFrameRef.current);
    setIsPlaying(false);
  };

  // Filtered items for picker
  const filteredItems = MOCK_ITEMS.filter(item => {
    const matchQuery = !pickerQuery || item.name.zh.includes(pickerQuery) || item.name.en.toLowerCase().includes(pickerQuery.toLowerCase());
    const matchRarity = pickerRarity === 'all' || item.rarity === pickerRarity || item.subcategory === pickerRarity;
    return matchQuery && matchRarity;
  });

  const rarityEntries = Object.entries(RARITIES);

  return (
    <div
      className="flex flex-col h-screen w-full bg-[#0a0a0a] text-slate-200 overflow-hidden"
      onMouseMove={handleProgressMouseMove}
      onMouseUp={handleProgressMouseUp}
    >
      {/* HEADER */}
      <header className="h-14 border-b border-slate-800 bg-[#111] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-200 gap-2">
              <ArrowLeft className="w-4 h-4" />
              {lang === 'zh' ? '返回主界面' : 'Back'}
            </Button>
          </Link>
          <div className="w-px h-6 bg-slate-800" />
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-violet-400" />
            <h1 className="font-bold text-base tracking-wide">
              {lang === 'zh' ? '视频弹窗标记' : 'Video Loot Marker'}
            </h1>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} className="text-slate-400">
          <Globe className="w-4 h-4 mr-1" />
          {lang === 'zh' ? 'EN' : '中'}
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT: VIDEO PLAYER ── */}
        <div className="flex-1 flex flex-col bg-black relative min-w-0">
          {!videoUrl ? (
            <label
              className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-700 m-8 rounded-xl cursor-pointer hover:border-violet-500/50 hover:bg-violet-500/5 transition-all"
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
            >
              <input type="file" accept="video/*" className="hidden" onChange={e => e.target.files?.[0] && handleFileInput(e.target.files[0])} />
              <Upload className="w-16 h-16 text-slate-600 mb-4" />
              <p className="text-slate-400 text-lg font-medium">
                {lang === 'zh' ? '拖放或点击导入游戏录像' : 'Drop or click to import recording'}
              </p>
              <p className="text-slate-600 text-sm mt-2">MP4 · MOV · AVI · WebM</p>
            </label>
          ) : (
            <>
              <canvas ref={canvasRef} className="w-full h-full object-contain bg-black" />
              <video ref={videoRef} src={videoUrl} className="hidden" onLoadedMetadata={handleVideoLoaded} preload="auto" />

              {/* Record indicator */}
              {isRecording && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-900/90 border border-red-700 rounded-full px-4 py-1.5 flex items-center gap-3 pointer-events-none">
                  <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
                  <span className="text-sm text-red-200 font-bold">合成渲染中 {recordProgress}%</span>
                  <div className="w-20 h-1.5 bg-red-900 rounded-full overflow-hidden">
                    <div className="h-full bg-red-400 rounded-full" style={{ width: `${recordProgress}%` }} />
                  </div>
                </div>
              )}

              {/* Floating "Mark Loot" button — visible during play or pause */}
              {videoUrl && !isRecording && (
                <div className="absolute top-4 right-4">
                  <button
                    onClick={handleMarkLoot}
                    className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-bold rounded-xl shadow-lg shadow-amber-900/40 transition-all text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    {lang === 'zh' ? '出货！添加弹窗' : 'Loot! Add Overlay'}
                  </button>
                </div>
              )}

              {/* CONTROLS */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl px-5 py-3 flex flex-col gap-2 shadow-xl w-[min(560px,90%)]">
                {/* Progress bar */}
                <div className="relative">
                  <div
                    ref={progressBarRef}
                    className="w-full h-2.5 bg-slate-700 rounded-full overflow-visible cursor-pointer select-none"
                    onMouseDown={handleProgressMouseDown}
                  >
                    <div className="h-full bg-violet-500 rounded-full pointer-events-none" style={{ width: `${videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0}%` }} />
                    {/* Event markers */}
                    {markedEvents.map(evt => {
                      const rarity = RARITIES[evt.item.rarity] || RARITIES.mythic;
                      return (
                        <div
                          key={evt.id}
                          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-slate-900 pointer-events-none"
                          style={{ left: `${(evt.timestamp / videoDuration) * 100}%`, backgroundColor: rarity.color, transform: 'translate(-50%, -50%)' }}
                          title={`${evt.item.name[lang]} @ ${formatTime(evt.timestamp)}`}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 font-mono shrink-0">{formatTime(currentTime)}</span>

                  <div className="flex items-center gap-1.5 flex-1 justify-center">
                    {(isPlaying || isPaused) && (
                      <button onClick={handleStop} className="w-7 h-7 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded-full transition-colors" title={lang === 'zh' ? '停止重置' : 'Stop'}>
                        <Square className="w-3 h-3" />
                      </button>
                    )}
                    {isPlaying ? (
                      <button onClick={handlePause} className="w-9 h-9 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded-full transition-colors">
                        <Pause className="w-4 h-4" />
                      </button>
                    ) : (
                      <button onClick={handlePlay} className="w-9 h-9 flex items-center justify-center bg-violet-500 hover:bg-violet-400 rounded-full transition-colors shadow-lg">
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    {isPaused && !showPicker && (
                      <button
                        onClick={handleMarkLoot}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg transition-colors ml-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {lang === 'zh' ? '在此出货' : 'Add here'}
                      </button>
                    )}
                  </div>

                  <span className="text-xs text-slate-500 font-mono shrink-0">{formatTime(videoDuration)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT: EVENTS + EXPORT ── */}
        <div className="w-[340px] flex flex-col bg-[#111] border-l border-slate-800 shrink-0">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-800 shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-300">
                {lang === 'zh' ? '已标记出货点' : 'Marked Events'}
              </h2>
              <span className="text-xs text-violet-400 font-bold bg-violet-400/10 px-2 py-0.5 rounded-full">
                {markedEvents.length}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 mt-1">
              {lang === 'zh' ? '播放时点击「出货！添加弹窗」，或暂停后点「在此出货」' : 'Click "Loot!" button during play, or pause and mark'}
            </p>
          </div>

          {/* Event list */}
          <ScrollArea className="flex-1">
            {markedEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-700">
                <Clock className="w-10 h-10 mb-2 opacity-40" />
                <p className="text-sm">{lang === 'zh' ? '还没有标记' : 'No marks yet'}</p>
                <p className="text-xs mt-1 opacity-60">{lang === 'zh' ? '播放视频，出货时点右上角按钮' : 'Play video and mark loot drops'}</p>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {markedEvents.map((evt, idx) => {
                  const rarity = RARITIES[evt.item.rarity] || RARITIES.mythic;
                  return (
                    <div key={evt.id} className="flex items-center gap-2.5 p-2.5 bg-slate-900 border border-slate-800 rounded-lg group">
                      <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: rarity.color }} />
                      {evt.item.image && <img src={evt.item.image} alt="" className="w-8 h-8 object-contain shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-200 truncate">{evt.item.name[lang]}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{formatTime(evt.timestamp)}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteEvent(evt.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-red-400 transition-all shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Export section */}
          <div className="border-t border-slate-800 p-4 space-y-3 shrink-0">
            <div>
              <Label className="text-xs text-slate-400 mb-2 block">
                {lang === 'zh' ? `弹窗大小: ${overlayScale[0].toFixed(1)}x` : `Scale: ${overlayScale[0].toFixed(1)}x`}
              </Label>
              <Slider value={overlayScale} onValueChange={setOverlayScale} min={0.5} max={2} step={0.1} />
            </div>
            <div>
              <Label className="text-xs text-slate-400 mb-2 block">
                {lang === 'zh' ? `停留时长: ${cardLifetime[0]}s` : `Duration: ${cardLifetime[0]}s`}
              </Label>
              <Slider value={cardLifetime} onValueChange={setCardLifetime} min={3} max={20} step={1} />
            </div>

            {!exportDone ? (
              <Button
                className={cn("w-full text-white font-bold", isRecording ? "bg-red-600 hover:bg-red-500" : "bg-violet-600 hover:bg-violet-500")}
                onClick={isRecording ? stopExport : startExport}
                disabled={markedEvents.length === 0 || isPlaying}
              >
                {isRecording
                  ? <><Square className="w-4 h-4 mr-2" />{lang === 'zh' ? `停止 ${recordProgress}%` : `Stop ${recordProgress}%`}</>
                  : <><Film className="w-4 h-4 mr-2" />{lang === 'zh' ? '合成并导出视频' : 'Render & Export'}</>
                }
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" />{lang === 'zh' ? '导出完成！' : 'Export done!'}
                </div>
                <a href={exportUrl!} download={`loot_overlay_${Date.now()}.webm`}
                  className="flex items-center justify-center gap-2 w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-sm transition-colors"
                >
                  <Download className="w-4 h-4" />{lang === 'zh' ? '下载视频' : 'Download'}
                </a>
                <button
                  onClick={() => { setExportDone(false); setExportUrl(null); setIsPlaying(false); }}
                  className="w-full py-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {lang === 'zh' ? '重新导出' : 'Re-export'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── ITEM PICKER OVERLAY ── */}
      <AnimatePresence>
        {showPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
            onClick={() => setShowPicker(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 16 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Picker header */}
              <div className="px-5 py-4 border-b border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-slate-100 text-base">
                      {lang === 'zh' ? '选择出货物品' : 'Select Loot Item'}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono">
                      @ {formatTime(pickerTimestamp)}
                    </p>
                  </div>
                  <button onClick={() => setShowPicker(false)} className="text-slate-500 hover:text-slate-300 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 transition-colors">×</button>
                </div>

                {/* Search + Rarity filter */}
                <div className="flex gap-2">
                  <input
                    autoFocus
                    type="text"
                    placeholder={lang === 'zh' ? '搜索物品名称...' : 'Search items...'}
                    value={pickerQuery}
                    onChange={e => setPickerQuery(e.target.value)}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-violet-500 transition-colors"
                  />
                </div>

                {/* Rarity filter pills */}
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  <button
                    onClick={() => setPickerRarity('all')}
                    className={cn("px-2.5 py-1 rounded-full text-xs font-medium transition-all", pickerRarity === 'all' ? "bg-slate-600 text-white" : "bg-slate-800 text-slate-500 hover:bg-slate-700")}
                  >
                    {lang === 'zh' ? '全部' : 'All'}
                  </button>
                  {rarityEntries.map(([key, val]) => (
                    <button
                      key={key}
                      onClick={() => setPickerRarity(pickerRarity === key ? 'all' : key)}
                      className={cn("px-2.5 py-1 rounded-full text-xs font-medium border transition-all", pickerRarity === key ? "text-white" : "bg-slate-800 text-slate-500 hover:bg-slate-700 border-slate-700")}
                      style={pickerRarity === key ? { backgroundColor: val.color, borderColor: val.color } : {}}
                    >
                      {val[lang]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Item grid */}
              <ScrollArea className="h-72">
                <div className="p-3 grid grid-cols-2 gap-1.5">
                  {filteredItems.length === 0 ? (
                    <div className="col-span-2 text-center py-8 text-slate-600 text-sm">
                      {lang === 'zh' ? '没有匹配的物品' : 'No items found'}
                    </div>
                  ) : (
                    filteredItems.map(item => {
                      const rarity = RARITIES[item.rarity] || RARITIES.mythic;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handlePickerSelect(item)}
                          className="flex items-center gap-2 p-2.5 bg-slate-800 hover:bg-slate-700 border border-transparent hover:border-violet-500/40 rounded-xl text-left transition-all active:scale-[0.97]"
                        >
                          <div className="w-1 h-9 rounded-full shrink-0" style={{ backgroundColor: rarity.color }} />
                          {item.image ? (
                            <img src={item.image} alt="" className="w-8 h-8 object-contain shrink-0" />
                          ) : (
                            <div className="w-8 h-8 bg-slate-700 rounded shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-200 truncate font-medium">{item.name[lang]}</p>
                            <p className="text-[10px] font-medium" style={{ color: rarity.color }}>{rarity[lang]}</p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
