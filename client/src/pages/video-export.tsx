import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Upload, Play, Square, Download,
  Trash2, CheckCircle2, Pause, Film, Globe,
  Plus, Video, Clock, Save, RotateCcw, Type, Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import MOCK_ITEMS_DATA from "../data.json";

const MOCK_ITEMS: { id: string; category: string; subcategory?: string; rarity: string; name: { zh: string; en: string }; image?: string }[] = MOCK_ITEMS_DATA;

// ── RARITIES (including prismatic) ──
const RARITIES: Record<string, { color: string; zh: string; en: string; prismatic?: boolean }> = {
  mythic:      { color: "#ef4444", zh: "神话",  en: "Mythic" },
  legendary:   { color: "#f59e0b", zh: "传说",  en: "Legendary" },
  epic:        { color: "#8b5cf6", zh: "史诗",  en: "Epic" },
  rare:        { color: "#3b82f6", zh: "稀有",  en: "Rare" },
  red_card:    { color: "#ef4444", zh: "红卡",  en: "Red Card" },
  gold_card:   { color: "#f59e0b", zh: "金卡",  en: "Gold Card" },
  purple_card: { color: "#8b5cf6", zh: "紫卡",  en: "Purple Card" },
  blue_card:   { color: "#3b82f6", zh: "蓝卡",  en: "Blue Card" },
  prismatic:   { color: "prismatic", zh: "棱彩",  en: "Prismatic", prismatic: true },
};

// CSS gradient string for prismatic UI elements
const PRISMATIC_GRADIENT = "linear-gradient(90deg,#ff4444,#ff9500,#ffe600,#4dff91,#00c3ff,#a64dff,#ff4d91)";

// Creates a canvas gradient for the prismatic rarity bar (vertical)
function makePrismaticGradient(ctx: CanvasRenderingContext2D, x: number, y: number, h: number) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0,    "#ff4444");
  g.addColorStop(0.17, "#ff9500");
  g.addColorStop(0.34, "#ffe600");
  g.addColorStop(0.5,  "#4dff91");
  g.addColorStop(0.67, "#00c3ff");
  g.addColorStop(0.84, "#a64dff");
  g.addColorStop(1,    "#ff4d91");
  return g;
}

// For prismatic text color, pick a hue based on time (animated in preview, fixed for export)
function getPrismaticTextColor(progress: number) {
  const hue = (progress * 360 * 3) % 360;
  return `hsl(${hue},100%,65%)`;
}

// ── TYPES ──
interface MarkedEvent {
  id: string;
  timestamp: number;
  // Either item-based or text-based
  item?: typeof MOCK_ITEMS[0];
  isText?: true;
  textContent?: string;
  textRarity?: string;
}

interface ActiveCard {
  uid: string;
  event: MarkedEvent;
  startTime: number;
  duration: number;
}

// ── STORAGE KEY ──
const STORAGE_KEY = "loot_marker_session_v1";

interface SavedSession {
  videoFileName: string;
  savedAt: number;
  events: Array<{
    id: string;
    timestamp: number;
    itemId?: string;
    isText?: true;
    textContent?: string;
    textRarity?: string;
  }>;
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
  const [pickerRarity, setPickerRarity] = useState('all');
  const [pickerTab, setPickerTab] = useState<'item' | 'text'>('item');
  const [textInput, setTextInput] = useState('');
  const [textRarity, setTextRarity] = useState('mythic');

  // Save state
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [savedSession, setSavedSession] = useState<SavedSession | null>(null);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Progress bar drag
  const progressBarRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const loadedImagesRef = useRef<Record<string, HTMLImageElement>>({});

  // Load images
  useEffect(() => {
    MOCK_ITEMS.forEach(item => {
      if (item.image && !loadedImagesRef.current[item.id]) {
        const img = new Image();
        img.src = item.image;
        img.onload = () => { loadedImagesRef.current[item.id] = img; };
      }
    });
  }, []);

  // Check for saved session on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const session: SavedSession = JSON.parse(raw);
        setSavedSession(session);
        setShowRestorePrompt(true);
      }
    } catch {}
  }, []);

  // Auto-save when events change
  useEffect(() => {
    markedEventsRef.current = markedEvents;
    if (markedEvents.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => doSave(false), 2000);
  }, [markedEvents]);

  const doSave = (manual: boolean) => {
    if (!videoFile && markedEvents.length === 0) return;
    const session: SavedSession = {
      videoFileName: videoFile?.name || '',
      savedAt: Date.now(),
      events: markedEventsRef.current.map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        itemId: e.item?.id,
        isText: e.isText,
        textContent: e.textContent,
        textRarity: e.textRarity,
      }))
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      if (manual) { setSaveStatus('saved'); setTimeout(() => setSaveStatus('idle'), 2000); }
    } catch {}
  };

  const restoreSession = (session: SavedSession) => {
    const restored: MarkedEvent[] = [];
    for (const e of session.events) {
      if (e.isText) {
        restored.push({ id: e.id, timestamp: e.timestamp, isText: true, textContent: e.textContent, textRarity: e.textRarity });
      } else if (e.itemId) {
        const item = MOCK_ITEMS.find(i => i.id === e.itemId);
        if (item) restored.push({ id: e.id, timestamp: e.timestamp, item });
      }
    }
    setMarkedEvents(restored.sort((a, b) => a.timestamp - b.timestamp));
    setShowRestorePrompt(false);
  };

  useEffect(() => { activeCardsRef.current = activeCards; }, [activeCards]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const cs = Math.floor((secs % 1) * 100);
    return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}.${cs.toString().padStart(2,'0')}`;
  };

  const handleFileInput = (file: File) => {
    if (!file.type.startsWith('video/')) return;
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setCurrentTime(0);
    setIsPlaying(false); setIsPaused(false);
    setExportDone(false); setExportUrl(null);
    scheduledRef.current = new Set();
    cancelAnimationFrame(animFrameRef.current);
    setShowRestorePrompt(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileInput(file);
  };

  const handleVideoLoaded = () => {
    const v = videoRef.current; if (!v) return;
    setVideoDuration(v.duration);
    setVideoSize({ w: v.videoWidth || 1920, h: v.videoHeight || 1080 });
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = v.videoWidth || 1920;
      canvas.height = v.videoHeight || 1080;
      canvas.getContext('2d')!.drawImage(v, 0, 0);
    }
  };

  // ── KEYBOARD SHORTCUTS ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!videoUrl) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) handlePause();
        else handlePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const video = videoRef.current; if (!video) return;
        const step = e.shiftKey ? 1 : 0.1;
        video.currentTime = Math.max(0, video.currentTime - step);
        setCurrentTime(video.currentTime);
        if (!isPlaying) {
          const canvas = canvasRef.current;
          if (canvas) canvas.getContext('2d')!.drawImage(video, 0, 0);
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        const video = videoRef.current; if (!video) return;
        const step = e.shiftKey ? 1 : 0.1;
        video.currentTime = Math.min(video.duration, video.currentTime + step);
        setCurrentTime(video.currentTime);
        if (!isPlaying) {
          const canvas = canvasRef.current;
          if (canvas) canvas.getContext('2d')!.drawImage(video, 0, 0);
        }
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        handleMarkLoot();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [videoUrl, isPlaying, isPaused]);

  // ── CANVAS DRAWING ──
  const drawCard = useCallback((
    ctx: CanvasRenderingContext2D,
    event: MarkedEvent,
    slotIndex: number,
    animProgress: number,
    scale: number,
    canvasW: number
  ) => {
    const rarityKey = event.isText ? (event.textRarity || 'mythic') : (event.item?.rarity || 'mythic');
    const rarityDef = RARITIES[rarityKey] || RARITIES.mythic;
    const isPrismatic = rarityDef.prismatic;

    const W = CARD_W * scale; const H = CARD_H * scale;
    const x = canvasW - W - CARD_X_OFFSET * scale;
    const y = CARD_Y_START * scale + slotIndex * (H + CARD_GAP * scale);

    const T_enter = 0.08, T_pause1 = 0.18, T_expand = 0.28, T_shrink = 0.38, T_hold = 0.85;
    let cardX = x, cardScale = scale, opacity = 1, cardY = y;

    if (animProgress < T_enter) {
      const p = animProgress / T_enter; cardX = x + (1 - p) * W; opacity = p;
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
    const CW = CARD_W * cardScale; const CH = CARD_H * cardScale;
    const barW = 5 * cardScale;

    // Card background
    ctx.fillStyle = 'rgba(10,12,18,0.93)';
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.rect(cardX, cardY, CW, CH); ctx.fill(); ctx.stroke();

    // Rarity bar
    if (isPrismatic) {
      ctx.fillStyle = makePrismaticGradient(ctx, cardX, cardY, CH);
    } else {
      ctx.fillStyle = rarityDef.color;
      ctx.shadowColor = rarityDef.color; ctx.shadowBlur = 8;
    }
    ctx.fillRect(cardX, cardY, barW, CH);
    ctx.shadowBlur = 0;

    const textColor = isPrismatic ? getPrismaticTextColor(animProgress) : rarityDef.color;

    if (event.isText) {
      // ── TEXT ONLY CARD ──
      ctx.fillStyle = textColor;
      ctx.font = `bold ${11 * cardScale}px Arial, sans-serif`;
      ctx.fillText(rarityDef[lang].toUpperCase(), cardX + barW + 12 * cardScale, cardY + CH * 0.38);
      ctx.fillStyle = isPrismatic ? getPrismaticTextColor(animProgress + 0.1) : 'rgba(255,255,255,0.95)';
      ctx.font = `bold ${15 * cardScale}px Arial, sans-serif`;
      const txt = event.textContent || '';
      const maxW2 = CW - barW - 16 * cardScale;
      let disp = txt;
      while (ctx.measureText(disp).width > maxW2 && disp.length > 1) disp = disp.slice(0, -1);
      if (disp !== txt) disp += '…';
      ctx.fillText(disp, cardX + barW + 12 * cardScale, cardY + CH * 0.7);
    } else {
      // ── ITEM CARD ──
      const item = event.item!;
      const iconSize = CH * 0.7;
      const iconX = cardX + barW + 8 * cardScale;
      const iconY = cardY + (CH - iconSize) / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(iconX, iconY, iconSize, iconSize);
      const img = item.image ? loadedImagesRef.current[item.id] : null;
      if (img) { try { ctx.drawImage(img, iconX + 2, iconY + 2, iconSize - 4, iconSize - 4); } catch {} }
      const textX = iconX + iconSize + 8 * cardScale;
      ctx.fillStyle = textColor;
      ctx.font = `bold ${10 * cardScale}px Arial, sans-serif`;
      ctx.fillText(rarityDef[lang].toUpperCase(), textX, cardY + CH * 0.38);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = `bold ${13 * cardScale}px Arial, sans-serif`;
      const name = item.name[lang] || item.name.zh;
      const maxW = CW - (textX - cardX) - 8 * cardScale;
      let disp = name;
      while (ctx.measureText(disp).width > maxW && disp.length > 1) disp = disp.slice(0, -1);
      if (disp !== name) disp += '…';
      ctx.fillText(disp, textX, cardY + CH * 0.68);
    }
    ctx.restore();
  }, [lang]);

  const renderFrame = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement, cards: ActiveCard[], tMs: number) => {
    const ctx = canvas.getContext('2d')!;
    const scale = overlayScale[0];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    cards.filter(c => tMs >= c.startTime && tMs < c.startTime + c.duration)
      .slice(-MAX_STACK)
      .forEach((card, idx) => {
        const progress = Math.min(1, (tMs - card.startTime) / card.duration);
        drawCard(ctx, card.event, idx, progress, scale, canvas.width);
      });
  }, [overlayScale, drawCard]);

  // ── PLAYBACK ──
  const playbackLoop = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
    const loop = () => {
      const tMs = video.currentTime * 1000;
      setCurrentTime(video.currentTime);
      markedEventsRef.current.forEach(evt => {
        if (scheduledRef.current.has(evt.id)) return;
        if (tMs >= evt.timestamp * 1000 - 50) {
          scheduledRef.current.add(evt.id);
          const nc: ActiveCard = { uid: `${evt.id}_p`, event: evt, startTime: evt.timestamp * 1000, duration: cardLifetime[0] * 1000 };
          activeCardsRef.current = [...activeCardsRef.current, nc];
          setActiveCards([...activeCardsRef.current]);
        }
      });
      renderFrame(video, canvas, activeCardsRef.current, tMs);
      if (!video.paused && !video.ended) animFrameRef.current = requestAnimationFrame(loop);
      else if (video.ended) { setIsPlaying(false); setIsPaused(false); }
    };
    animFrameRef.current = requestAnimationFrame(loop);
  }, [renderFrame, cardLifetime]);

  const handlePlay = useCallback(() => {
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
  }, [videoSize, isPaused, playbackLoop]);

  const handlePause = useCallback(() => {
    const video = videoRef.current; if (!video) return;
    video.pause();
    cancelAnimationFrame(animFrameRef.current);
    setIsPlaying(false); setIsPaused(true);
  }, []);

  const handleStop = () => {
    const video = videoRef.current; if (!video) return;
    video.pause(); cancelAnimationFrame(animFrameRef.current);
    setIsPlaying(false); setIsPaused(false);
    setActiveCards([]); activeCardsRef.current = [];
    scheduledRef.current = new Set();
    video.currentTime = 0; setCurrentTime(0);
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d')!.drawImage(video, 0, 0);
  };

  // ── MARK LOOT ──
  const handleMarkLoot = useCallback(() => {
    const video = videoRef.current; if (!video) return;
    if (isPlaying) {
      video.pause(); cancelAnimationFrame(animFrameRef.current);
      setIsPlaying(false); setIsPaused(true);
    }
    setPickerTimestamp(video.currentTime);
    setPickerQuery(''); setPickerRarity('all');
    setPickerTab('item'); setTextInput(''); setTextRarity('mythic');
    setShowPicker(true);
  }, [isPlaying]);

  const handlePickerSelectItem = (item: typeof MOCK_ITEMS[0]) => {
    const evt: MarkedEvent = { id: `mark_${Date.now()}`, timestamp: parseFloat(pickerTimestamp.toFixed(2)), item };
    setMarkedEvents(prev => [...prev, evt].sort((a, b) => a.timestamp - b.timestamp));
    setShowPicker(false);
  };

  const handlePickerAddText = () => {
    if (!textInput.trim()) return;
    const evt: MarkedEvent = { id: `text_${Date.now()}`, timestamp: parseFloat(pickerTimestamp.toFixed(2)), isText: true, textContent: textInput.trim(), textRarity };
    setMarkedEvents(prev => [...prev, evt].sort((a, b) => a.timestamp - b.timestamp));
    setShowPicker(false);
  };

  const handleDeleteEvent = (id: string) => setMarkedEvents(prev => prev.filter(e => e.id !== id));

  // ── SEEK ──
  const seekTo = (pct: number) => {
    const video = videoRef.current; if (!video) return;
    const t = pct * videoDuration;
    video.currentTime = t; setCurrentTime(t);
    scheduledRef.current = new Set(markedEventsRef.current.filter(e => e.timestamp * 1000 < t * 1000).map(e => e.id));
    if (!isPlaying) {
      const canvas = canvasRef.current;
      if (canvas) canvas.getContext('2d')!.drawImage(video, 0, 0);
    }
  };

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    const bar = progressBarRef.current; if (!bar) return;
    const rect = bar.getBoundingClientRect();
    seekTo(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  };
  const handleProgressMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const bar = progressBarRef.current; if (!bar) return;
    const rect = bar.getBoundingClientRect();
    seekTo(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  };
  const handleProgressMouseUp = () => { isDraggingRef.current = false; };

  // ── EXPORT ──
  const startExport = async () => {
    const video = videoRef.current; const canvas = canvasRef.current; if (!video || !canvas) return;
    canvas.width = videoSize.w; canvas.height = videoSize.h;
    video.currentTime = 0; scheduledRef.current = new Set();
    setActiveCards([]); activeCardsRef.current = [];
    chunksRef.current = []; setExportDone(false); setExportUrl(null); setRecordProgress(0);
    const stream = canvas.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => { setExportUrl(URL.createObjectURL(new Blob(chunksRef.current, { type: mimeType }))); setExportDone(true); setIsRecording(false); cancelAnimationFrame(animFrameRef.current); };
    recorder.start(100); setIsRecording(true);
    const dur = video.duration;
    const loop = () => {
      const tMs = video.currentTime * 1000;
      setRecordProgress(Math.round((video.currentTime / dur) * 100)); setCurrentTime(video.currentTime);
      markedEventsRef.current.forEach(evt => {
        if (scheduledRef.current.has(evt.id)) return;
        if (tMs >= evt.timestamp * 1000 - 50) {
          scheduledRef.current.add(evt.id);
          const nc: ActiveCard = { uid: evt.id, event: evt, startTime: evt.timestamp * 1000, duration: cardLifetime[0] * 1000 };
          activeCardsRef.current = [...activeCardsRef.current, nc]; setActiveCards([...activeCardsRef.current]);
        }
      });
      renderFrame(video, canvas, activeCardsRef.current, tMs);
      if (!video.ended && !video.paused) animFrameRef.current = requestAnimationFrame(loop);
      else recorder.stop();
    };
    await video.play(); setIsPlaying(true); setIsPaused(false);
    animFrameRef.current = requestAnimationFrame(loop);
  };

  const stopExport = () => { videoRef.current?.pause(); mediaRecorderRef.current?.stop(); cancelAnimationFrame(animFrameRef.current); setIsPlaying(false); };

  // Filtered items for picker
  const filteredItems = MOCK_ITEMS.filter(item => {
    const qOk = !pickerQuery || item.name.zh.includes(pickerQuery) || item.name.en.toLowerCase().includes(pickerQuery.toLowerCase());
    const rOk = pickerRarity === 'all' || item.rarity === pickerRarity || item.subcategory === pickerRarity;
    return qOk && rOk;
  });

  const rarityEntries = Object.entries(RARITIES);

  // Rarity display helper for UI (prismatic uses gradient)
  const RarityBadge = ({ rarityKey, size = 'sm' }: { rarityKey: string; size?: 'sm' | 'xs' }) => {
    const def = RARITIES[rarityKey] || RARITIES.mythic;
    if (def.prismatic) {
      return (
        <span className={cn("font-bold", size === 'xs' ? "text-[10px]" : "text-xs")}
          style={{ background: PRISMATIC_GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          {def[lang]}
        </span>
      );
    }
    return <span className={cn("font-medium", size === 'xs' ? "text-[10px]" : "text-xs")} style={{ color: def.color }}>{def[lang]}</span>;
  };

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
              <ArrowLeft className="w-4 h-4" />{lang === 'zh' ? '返回主界面' : 'Back'}
            </Button>
          </Link>
          <div className="w-px h-6 bg-slate-800" />
          <Video className="w-5 h-5 text-violet-400" />
          <h1 className="font-bold text-base">{lang === 'zh' ? '视频弹窗标记' : 'Video Loot Marker'}</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Save button */}
          {markedEvents.length > 0 && (
            <button
              onClick={() => doSave(true)}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                saveStatus === 'saved' ? "bg-emerald-600/20 text-emerald-400" : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
              )}
            >
              <Save className="w-3.5 h-3.5" />
              {saveStatus === 'saved' ? (lang === 'zh' ? '已保存' : 'Saved!') : (lang === 'zh' ? '暂时保存' : 'Save')}
            </button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} className="text-slate-400">
            <Globe className="w-4 h-4 mr-1" />{lang === 'zh' ? 'EN' : '中'}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT: VIDEO ── */}
        <div className="flex-1 flex flex-col bg-black relative min-w-0">
          {!videoUrl ? (
            <label
              className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-700 m-8 rounded-xl cursor-pointer hover:border-violet-500/50 hover:bg-violet-500/5 transition-all"
              onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            >
              <input type="file" accept="video/*" className="hidden" onChange={e => e.target.files?.[0] && handleFileInput(e.target.files[0])} />
              <Upload className="w-16 h-16 text-slate-600 mb-4" />
              <p className="text-slate-400 text-lg font-medium">{lang === 'zh' ? '拖放或点击导入游戏录像' : 'Drop or click to import'}</p>
              <p className="text-slate-600 text-sm mt-2">MP4 · MOV · AVI · WebM</p>

              {/* Restore prompt when no video loaded yet */}
              {showRestorePrompt && savedSession && (
                <div className="mt-6 bg-slate-800 border border-slate-700 rounded-xl p-4 max-w-sm text-center" onClick={e => e.stopPropagation()}>
                  <RotateCcw className="w-6 h-6 text-violet-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-300 font-medium">{lang === 'zh' ? '发现未完成的标记' : 'Unsaved session found'}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {savedSession.videoFileName} · {savedSession.events.length}{lang === 'zh' ? ' 个标记' : ' marks'}
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => restoreSession(savedSession)} className="flex-1 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs rounded-lg font-bold transition-colors">
                      {lang === 'zh' ? '恢复标记' : 'Restore'}
                    </button>
                    <button onClick={() => { setShowRestorePrompt(false); localStorage.removeItem(STORAGE_KEY); }} className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-lg transition-colors">
                      {lang === 'zh' ? '忽略' : 'Discard'}
                    </button>
                  </div>
                </div>
              )}
            </label>
          ) : (
            <>
              <canvas ref={canvasRef} className="w-full h-full object-contain bg-black" />
              <video ref={videoRef} src={videoUrl} className="hidden" onLoadedMetadata={handleVideoLoaded} preload="auto" />

              {/* Recording indicator */}
              {isRecording && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-900/90 border border-red-700 rounded-full px-4 py-1.5 flex items-center gap-3 pointer-events-none">
                  <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
                  <span className="text-sm text-red-200 font-bold">合成渲染中 {recordProgress}%</span>
                  <div className="w-20 h-1.5 bg-red-900 rounded-full overflow-hidden">
                    <div className="h-full bg-red-400 rounded-full transition-none" style={{ width: `${recordProgress}%` }} />
                  </div>
                </div>
              )}

              {/* Floating mark button */}
              {!isRecording && (
                <div className="absolute top-4 right-4">
                  <button
                    onClick={handleMarkLoot}
                    className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-bold rounded-xl shadow-lg shadow-amber-900/40 transition-all text-sm select-none"
                  >
                    <Plus className="w-4 h-4" />
                    {lang === 'zh' ? '出货！添加弹窗' : 'Loot! Add Card'}
                  </button>
                </div>
              )}

              {/* Keyboard hint */}
              <div className="absolute top-4 left-4 flex items-center gap-1.5 pointer-events-none">
                {[['Space','暂停/播放'],['←→','±0.1s'],['Shift+←→','±1s'],['M','标记']].map(([k, d]) => (
                  <div key={k} className="flex items-center gap-1 bg-black/60 border border-slate-700/50 rounded px-1.5 py-0.5">
                    <kbd className="text-[10px] text-slate-400 font-mono">{k}</kbd>
                    <span className="text-[10px] text-slate-600">{d}</span>
                  </div>
                ))}
              </div>

              {/* CONTROLS */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl px-5 py-3 flex flex-col gap-2 shadow-xl w-[min(580px,92%)]">
                {/* Progress bar */}
                <div
                  ref={progressBarRef}
                  className="relative w-full h-3 bg-slate-700 rounded-full cursor-pointer select-none"
                  onMouseDown={handleProgressMouseDown}
                >
                  <div className="h-full bg-violet-500 rounded-full pointer-events-none transition-none" style={{ width: `${videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0}%` }} />
                  {markedEvents.map(evt => {
                    const rk = evt.isText ? (evt.textRarity || 'mythic') : (evt.item?.rarity || 'mythic');
                    const def = RARITIES[rk] || RARITIES.mythic;
                    return (
                      <div key={evt.id} className="absolute top-1/2 w-3 h-3 rounded-full border-2 border-slate-900 pointer-events-none"
                        style={{ left: `${(evt.timestamp / videoDuration) * 100}%`, backgroundColor: def.prismatic ? '#a64dff' : def.color, transform: 'translate(-50%,-50%)' }}
                      />
                    );
                  })}
                  {/* Playhead */}
                  <div className="absolute top-1/2 w-3.5 h-3.5 bg-white rounded-full border-2 border-slate-900 pointer-events-none shadow-md"
                    style={{ left: `${videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0}%`, transform: 'translate(-50%,-50%)' }}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 font-mono shrink-0">{formatTime(currentTime)}</span>
                  <div className="flex items-center gap-1.5 flex-1 justify-center">
                    {(isPlaying || isPaused) && (
                      <button onClick={handleStop} className="w-7 h-7 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded-full transition-colors" title="停止">
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
                      <button onClick={handleMarkLoot} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg transition-colors ml-1">
                        <Plus className="w-3.5 h-3.5" />{lang === 'zh' ? '在此出货' : 'Mark here'}
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
        <div className="w-[330px] flex flex-col bg-[#111] border-l border-slate-800 shrink-0">
          <div className="px-4 py-3 border-b border-slate-800 shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-300">{lang === 'zh' ? '已标记出货点' : 'Marked Events'}</h2>
              <span className="text-xs text-violet-400 font-bold bg-violet-400/10 px-2 py-0.5 rounded-full">{markedEvents.length}</span>
            </div>
            <p className="text-[11px] text-slate-600 mt-1">
              {lang === 'zh' ? '播放时按 M 键或点右上角「出货」按钮' : 'Press M or click "Loot!" button to mark'}
            </p>
          </div>

          <ScrollArea className="flex-1">
            {markedEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-44 text-slate-700">
                <Clock className="w-9 h-9 mb-2 opacity-40" />
                <p className="text-sm">{lang === 'zh' ? '还没有标记' : 'No marks yet'}</p>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {markedEvents.map(evt => {
                  const rk = evt.isText ? (evt.textRarity || 'mythic') : (evt.item?.rarity || 'mythic');
                  const def = RARITIES[rk] || RARITIES.mythic;
                  return (
                    <div key={evt.id} className="flex items-center gap-2.5 p-2.5 bg-slate-900 border border-slate-800 rounded-lg group hover:border-slate-700 transition-colors">
                      {def.prismatic ? (
                        <div className="w-1 h-10 rounded-full shrink-0" style={{ background: PRISMATIC_GRADIENT }} />
                      ) : (
                        <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: def.color }} />
                      )}
                      {evt.isText ? (
                        <div className="w-8 h-8 flex items-center justify-center bg-slate-800 rounded shrink-0">
                          <Type className="w-4 h-4 text-slate-500" />
                        </div>
                      ) : evt.item?.image ? (
                        <img src={evt.item.image} alt="" className="w-8 h-8 object-contain shrink-0" />
                      ) : (
                        <div className="w-8 h-8 bg-slate-800 rounded shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-200 truncate">
                          {evt.isText ? (evt.textContent || '—') : (evt.item?.name[lang] || '—')}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-500 font-mono">{formatTime(evt.timestamp)}</span>
                          {evt.isText && <span className="text-[10px] text-slate-600 bg-slate-800 px-1 rounded">文字</span>}
                        </div>
                      </div>
                      <button onClick={() => handleDeleteEvent(evt.id)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-red-400 transition-all shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Export */}
          <div className="border-t border-slate-800 p-4 space-y-3 shrink-0">
            <div>
              <Label className="text-xs text-slate-400 mb-1.5 block">{lang === 'zh' ? `弹窗大小 ${overlayScale[0].toFixed(1)}x` : `Scale ${overlayScale[0].toFixed(1)}x`}</Label>
              <Slider value={overlayScale} onValueChange={setOverlayScale} min={0.5} max={2} step={0.1} />
            </div>
            <div>
              <Label className="text-xs text-slate-400 mb-1.5 block">{lang === 'zh' ? `停留时长 ${cardLifetime[0]}s` : `Duration ${cardLifetime[0]}s`}</Label>
              <Slider value={cardLifetime} onValueChange={setCardLifetime} min={3} max={20} step={1} />
            </div>
            {!exportDone ? (
              <Button
                className={cn("w-full text-white font-bold", isRecording ? "bg-red-600 hover:bg-red-500" : "bg-violet-600 hover:bg-violet-500")}
                onClick={isRecording ? stopExport : startExport}
                disabled={markedEvents.length === 0 || (isPlaying && !isRecording)}
              >
                {isRecording ? <><Square className="w-4 h-4 mr-2" />{lang === 'zh' ? `停止 ${recordProgress}%` : `Stop ${recordProgress}%`}</> : <><Film className="w-4 h-4 mr-2" />{lang === 'zh' ? '合成并导出' : 'Render & Export'}</>}
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium"><CheckCircle2 className="w-4 h-4" />{lang === 'zh' ? '导出完成！' : 'Done!'}</div>
                <a href={exportUrl!} download={`loot_overlay_${Date.now()}.webm`} className="flex items-center justify-center gap-2 w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-sm transition-colors">
                  <Download className="w-4 h-4" />{lang === 'zh' ? '下载视频' : 'Download'}
                </a>
                <button onClick={() => { setExportDone(false); setExportUrl(null); }} className="w-full py-1 text-xs text-slate-500 hover:text-slate-300 transition-colors">{lang === 'zh' ? '重新导出' : 'Re-export'}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── ITEM PICKER DIALOG ── */}
      <AnimatePresence>
        {showPicker && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
            onClick={() => setShowPicker(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0, y: 8 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-100 text-base">{lang === 'zh' ? '添加出货弹窗' : 'Add Loot Card'}</h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">@ {formatTime(pickerTimestamp)}</p>
                </div>
                <button onClick={() => setShowPicker(false)} className="text-slate-500 hover:text-slate-300 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 text-xl leading-none transition-colors">×</button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-800">
                <button
                  onClick={() => setPickerTab('item')}
                  className={cn("flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border-b-2",
                    pickerTab === 'item' ? "border-amber-500 text-amber-400 bg-amber-500/5" : "border-transparent text-slate-500 hover:text-slate-300"
                  )}
                >
                  <Package className="w-3.5 h-3.5" />{lang === 'zh' ? '选择物品' : 'Item'}
                </button>
                <button
                  onClick={() => setPickerTab('text')}
                  className={cn("flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border-b-2",
                    pickerTab === 'text' ? "border-violet-500 text-violet-400 bg-violet-500/5" : "border-transparent text-slate-500 hover:text-slate-300"
                  )}
                >
                  <Type className="w-3.5 h-3.5" />{lang === 'zh' ? '文字模式' : 'Text Mode'}
                </button>
              </div>

              {/* Item tab */}
              {pickerTab === 'item' && (
                <>
                  <div className="p-3 border-b border-slate-800 space-y-2">
                    <input autoFocus type="text" placeholder={lang === 'zh' ? '搜索物品...' : 'Search...'}
                      value={pickerQuery} onChange={e => setPickerQuery(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-violet-500 transition-colors"
                    />
                    <div className="flex gap-1.5 flex-wrap">
                      <button onClick={() => setPickerRarity('all')} className={cn("px-2.5 py-1 rounded-full text-xs font-medium transition-all", pickerRarity === 'all' ? "bg-slate-500 text-white" : "bg-slate-800 text-slate-500 hover:bg-slate-700 border border-slate-700")}>
                        {lang === 'zh' ? '全部' : 'All'}
                      </button>
                      {rarityEntries.map(([key, val]) => (
                        <button key={key} onClick={() => setPickerRarity(pickerRarity === key ? 'all' : key)}
                          className={cn("px-2.5 py-1 rounded-full text-xs font-medium border transition-all", pickerRarity === key ? "text-black border-transparent" : "bg-slate-800 text-slate-500 hover:bg-slate-700 border-slate-700")}
                          style={val.prismatic ? (pickerRarity === key ? { background: PRISMATIC_GRADIENT } : {}) : (pickerRarity === key ? { backgroundColor: val.color, borderColor: val.color, color: '#000' } : {})}
                        >
                          {val.prismatic && pickerRarity !== key ? (
                            <span style={{ background: PRISMATIC_GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{val[lang]}</span>
                          ) : val[lang]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ScrollArea className="h-64">
                    <div className="p-3 grid grid-cols-2 gap-1.5">
                      {filteredItems.length === 0 ? (
                        <div className="col-span-2 text-center py-8 text-slate-600 text-sm">{lang === 'zh' ? '无匹配物品' : 'No items'}</div>
                      ) : filteredItems.map(item => {
                        const def = RARITIES[item.rarity] || RARITIES.mythic;
                        return (
                          <button key={item.id} onClick={() => handlePickerSelectItem(item)}
                            className="flex items-center gap-2 p-2.5 bg-slate-800 hover:bg-slate-700 border border-transparent hover:border-amber-500/40 rounded-xl text-left transition-all active:scale-[0.97]"
                          >
                            <div className="w-1 h-9 rounded-full shrink-0" style={def.prismatic ? { background: PRISMATIC_GRADIENT } : { backgroundColor: def.color }} />
                            {item.image ? <img src={item.image} alt="" className="w-8 h-8 object-contain shrink-0" /> : <div className="w-8 h-8 bg-slate-700 rounded shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-slate-200 truncate font-medium">{item.name[lang]}</p>
                              <RarityBadge rarityKey={item.rarity} size="xs" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </>
              )}

              {/* Text tab */}
              {pickerTab === 'text' && (
                <div className="p-4 space-y-4">
                  <div>
                    <Label className="text-xs text-slate-400 mb-2 block">{lang === 'zh' ? '弹窗文字内容' : 'Card Text'}</Label>
                    <input
                      autoFocus
                      type="text"
                      placeholder={lang === 'zh' ? '输入要显示的文字...' : 'Enter display text...'}
                      value={textInput}
                      onChange={e => setTextInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && textInput.trim()) handlePickerAddText(); }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-violet-500 transition-colors"
                      maxLength={30}
                    />
                    <p className="text-[10px] text-slate-600 mt-1">{textInput.length}/30</p>
                  </div>

                  <div>
                    <Label className="text-xs text-slate-400 mb-2 block">{lang === 'zh' ? '品质（决定文字颜色）' : 'Quality (determines color)'}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {rarityEntries.map(([key, val]) => (
                        <button key={key} onClick={() => setTextRarity(key)}
                          className={cn("flex items-center gap-2 p-2 rounded-lg border text-sm font-medium transition-all", textRarity === key ? "border-transparent" : "border-slate-700 bg-slate-800 hover:bg-slate-700")}
                          style={val.prismatic ? (textRarity === key ? { background: PRISMATIC_GRADIENT, color: '#000', borderColor: 'transparent' } : {}) : (textRarity === key ? { backgroundColor: val.color + '30', borderColor: val.color, color: val.color } : {})}
                        >
                          <div className="w-3 h-3 rounded-full shrink-0" style={val.prismatic ? { background: PRISMATIC_GRADIENT } : { backgroundColor: val.color }} />
                          <span>{val[lang]}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Preview */}
                  {textInput && (
                    <div className="bg-slate-800 rounded-lg p-3">
                      <p className="text-[10px] text-slate-600 mb-2">{lang === 'zh' ? '预览' : 'Preview'}</p>
                      <div className="flex items-center gap-2 bg-[#0a0c12] rounded p-2">
                        <div className="w-1 h-8 rounded-full shrink-0" style={RARITIES[textRarity]?.prismatic ? { background: PRISMATIC_GRADIENT } : { backgroundColor: RARITIES[textRarity]?.color || '#ef4444' }} />
                        <div>
                          {RARITIES[textRarity]?.prismatic ? (
                            <p className="text-[10px] font-bold" style={{ background: PRISMATIC_GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                              {RARITIES[textRarity][lang].toUpperCase()}
                            </p>
                          ) : (
                            <p className="text-[10px] font-bold" style={{ color: RARITIES[textRarity]?.color }}>{RARITIES[textRarity]?.[lang].toUpperCase()}</p>
                          )}
                          <p className="text-sm font-bold text-white">{textInput}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <Button
                    className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold"
                    onClick={handlePickerAddText}
                    disabled={!textInput.trim()}
                  >
                    <Plus className="w-4 h-4 mr-2" />{lang === 'zh' ? '添加文字弹窗' : 'Add Text Card'}
                  </Button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
