import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, Upload, Play, Square, Download,
  Trash2, CheckCircle2, Pause, Film, Globe,
  Plus, Video, Clock, Save, RotateCcw, Type, Package, RefreshCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useItemLibrary, type LibraryItem } from "@/lib/useItemLibrary";
import { AddItemDialog } from "@/components/AddItemDialog";
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
  junk:        { color: "#9ca3af",   zh: "劣质",  en: "Junk" },
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

// ── JUNK CRACK DRAWING (module-level, no React deps) ──
const JUNK_CRACK_SEGS: [number, number][][] = [
  [[0.60,0.50],[0.40,0.18],[0.20,0.06]],
  [[0.40,0.18],[0.32,0.36]],
  [[0.60,0.50],[0.76,0.12],[0.97,0.02]],
  [[0.76,0.12],[0.88,0.28]],
  [[0.60,0.50],[0.84,0.52],[1.00,0.50]],
  [[0.60,0.50],[0.78,0.82],[0.97,0.97]],
  [[0.60,0.50],[0.56,0.92]],
  [[0.60,0.50],[0.38,0.80],[0.18,0.97]],
  [[0.60,0.50],[0.28,0.50],[0.05,0.48]],
  [[0.28,0.50],[0.24,0.68]],
  [[0.60,0.50],[0.54,0.20]],
];
function drawCrackEffect(
  ctx: CanvasRenderingContext2D,
  cardX: number, cardY: number, cw: number, ch: number,
  crackProgress: number
) {
  if (crackProgress <= 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  JUNK_CRACK_SEGS.forEach((seg, i) => {
    const delay = i * 0.07;
    if (crackProgress <= delay) return;
    const prog = Math.min(1, (crackProgress - delay) / 0.45);
    const totalSegs = seg.length - 1;
    const segsProgress = prog * totalSegs;
    ctx.beginPath();
    ctx.moveTo(cardX + seg[0][0] * cw, cardY + seg[0][1] * ch);
    for (let j = 0; j < totalSegs; j++) {
      const sp = Math.max(0, Math.min(1, segsProgress - j));
      const x0 = cardX + seg[j][0] * cw, y0 = cardY + seg[j][1] * ch;
      const x1 = cardX + seg[j+1][0] * cw, y1 = cardY + seg[j+1][1] * ch;
      ctx.lineTo(x0 + (x1 - x0) * sp, y0 + (y1 - y0) * sp);
      if (sp < 1) break;
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.strokeStyle = 'rgba(210,225,240,0.8)'; ctx.lineWidth = 0.9; ctx.stroke();
  });
  if (crackProgress > 0.3) {
    const impX = cardX + 0.60 * cw, impY = cardY + 0.50 * ch;
    const r = Math.min(5, (crackProgress - 0.3) * 12);
    ctx.beginPath(); ctx.arc(impX, impY, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(210,225,240,0.35)'; ctx.fill();
  }
  ctx.restore();
}

// ── TYPES ──
interface MarkedEvent {
  id: string;
  timestamp: number;
  item?: LibraryItem;
  isText?: true;
  textContent?: string;
  textRarity?: string;
  // Per-item overrides
  customScale?: number;    // multiplier on top of global overlayScale
  customDuration?: number; // seconds, overrides cardLifetime
  customFontSize?: number; // text size multiplier (text events only)
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
    customScale?: number;
    customDuration?: number;
    customFontSize?: number;
  }>;
}

const CARD_W = 280;
const CARD_H = 72;
const CARD_X_OFFSET = 16;
const CARD_Y_START = 80;
const CARD_GAP = 8;
const MAX_STACK = 4;

// Pure util — defined outside component so it's safe to call from interval callbacks
function formatTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const cs = Math.floor((secs % 1) * 100);
  return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}.${cs.toString().padStart(2,'0')}`;
}

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

  const activeCardsRef = useRef<ActiveCard[]>([]);
  const scheduledRef = useRef<Set<string>>(new Set());

  // ── AudioContext for reliable audio capture during export ──
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // ── DOM refs for live-update during playback/recording (zero React re-renders) ──
  const videoDurationRef = useRef(0);
  const exportMimeRef = useRef<string>('video/webm');
  const progressFillRef = useRef<HTMLDivElement>(null);
  const progressThumbRef = useRef<HTMLDivElement>(null);
  const timeTextRef = useRef<HTMLSpanElement>(null);
  const exportProgressFillRef = useRef<HTMLDivElement>(null);
  const exportProgressTextRef = useRef<HTMLSpanElement>(null);
  const exportBtnPctRef = useRef<HTMLSpanElement>(null);

  // ── UI tick: directly writes to DOM at 100ms — NO React setState in the loop ──
  const uiTickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordProgressRef = useRef(0);

  const stopUiTick = useCallback(() => {
    if (uiTickIntervalRef.current !== null) {
      clearInterval(uiTickIntervalRef.current);
      uiTickIntervalRef.current = null;
    }
  }, []);

  const startUiTick = useCallback(() => {
    stopUiTick();
    uiTickIntervalRef.current = setInterval(() => {
      const t = videoRef.current?.currentTime ?? 0;
      const dur = videoDurationRef.current || 1;
      const pct = (t / dur) * 100;
      const rPct = recordProgressRef.current;
      if (timeTextRef.current) timeTextRef.current.textContent = formatTime(t);
      if (progressFillRef.current) progressFillRef.current.style.width = `${pct}%`;
      if (progressThumbRef.current) progressThumbRef.current.style.left = `${pct}%`;
      if (exportProgressFillRef.current) exportProgressFillRef.current.style.width = `${rPct}%`;
      if (exportProgressTextRef.current) exportProgressTextRef.current.textContent = `合成渲染中 ${rPct}%`;
      if (exportBtnPctRef.current) exportBtnPctRef.current.textContent = lang === 'zh' ? `停止 ${rPct}%` : `Stop ${rPct}%`;
    }, 100);
  }, [stopUiTick, lang]);

  // Sync time display + progress bar DOM directly (called on seek/stop/reset too)
  const syncTimeToDOM = useCallback((t: number) => {
    const dur = videoDurationRef.current || 1;
    const pct = (t / dur) * 100;
    if (timeTextRef.current) timeTextRef.current.textContent = formatTime(t);
    if (progressFillRef.current) progressFillRef.current.style.width = `${pct}%`;
    if (progressThumbRef.current) progressThumbRef.current.style.left = `${pct}%`;
  }, []);

  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [exportDone, setExportDone] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  // Animation params (mirrors home.tsx sliders)
  const [overlayScale, setOverlayScale] = useState([1]);
  const [cardLifetime, setCardLifetime] = useState([2000]); // in ms
  const [pauseBeforeExpand, setPauseBeforeExpand] = useState([500]);
  const [expandDuration, setExpandDuration] = useState([300]);
  const [pauseAfterExpand, setPauseAfterExpand] = useState([1000]);
  const [expandScale, setExpandScale] = useState([1.5]);
  const [maxStackItems, setMaxStackItems] = useState([3]);

  // Item picker state
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTimestamp, setPickerTimestamp] = useState(0);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerRarity, setPickerRarity] = useState('all');
  const [pickerTab, setPickerTab] = useState<'item' | 'text'>('item');
  const [textInput, setTextInput] = useState('');
  const [textRarity, setTextRarity] = useState('mythic');

  // ── Item library (default + custom, deletable) ──
  const { allItems, hasDeletedDefaults, addCustomItem, deleteItem, restoreDefaults } = useItemLibrary(MOCK_ITEMS);
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Save state
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [savedSession, setSavedSession] = useState<SavedSession | null>(null);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Progress bar drag
  const progressBarRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const loadedImagesRef = useRef<Record<string, HTMLImageElement>>({});

  // Load images (runs whenever allItems changes, picks up custom items too)
  useEffect(() => {
    allItems.forEach(item => {
      if (item.image && !loadedImagesRef.current[item.id]) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = item.image;
        img.onload = () => { loadedImagesRef.current[item.id] = img; };
      }
    });
  }, [allItems]);

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
        customScale: e.customScale,
        customDuration: e.customDuration,
        customFontSize: e.customFontSize,
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
      const overrides = {
        customScale: e.customScale,
        customDuration: e.customDuration,
        customFontSize: e.customFontSize,
      };
      if (e.isText) {
        restored.push({ id: e.id, timestamp: e.timestamp, isText: true, textContent: e.textContent, textRarity: e.textRarity, ...overrides });
      } else if (e.itemId) {
        const item = allItems.find(i => i.id === e.itemId);
        if (item) restored.push({ id: e.id, timestamp: e.timestamp, item, ...overrides });
      }
    }
    setMarkedEvents(restored.sort((a, b) => a.timestamp - b.timestamp));
    setShowRestorePrompt(false);
  };

  // ── EXPORT / IMPORT EVENTS JSON ──
  const handleExportEvents = () => {
    const session: SavedSession = {
      videoFileName: videoFile?.name || '',
      savedAt: Date.now(),
      events: markedEvents.map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        itemId: e.item?.id,
        isText: e.isText,
        textContent: e.textContent,
        textRarity: e.textRarity,
        customScale: e.customScale,
        customDuration: e.customDuration,
        customFontSize: e.customFontSize,
      })),
    };
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const d = new Date(session.savedAt);
    a.download = `loot-marks-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importInputRef = useRef<HTMLInputElement>(null);
  const handleImportEvents = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const session: SavedSession = JSON.parse(reader.result as string);
        if (!Array.isArray(session.events)) throw new Error('invalid');
        restoreSession(session);
      } catch {
        alert(lang === 'zh' ? '无法读取该文件，请确认是正确的标记文件。' : 'Could not read file. Please select a valid marks JSON file.');
      }
    };
    reader.readAsText(file);
  };



  const handleFileInput = (file: File) => {
    if (!file.type.startsWith('video/')) return;
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setCurrentTime(0); syncTimeToDOM(0);
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
    videoDurationRef.current = v.duration;
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
        setCurrentTime(video.currentTime); syncTimeToDOM(video.currentTime);
        if (!isPlaying) {
          const canvas = canvasRef.current;
          if (canvas) canvas.getContext('2d')!.drawImage(video, 0, 0);
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        const video = videoRef.current; if (!video) return;
        const step = e.shiftKey ? 1 : 0.1;
        video.currentTime = Math.min(video.duration, video.currentTime + step);
        setCurrentTime(video.currentTime); syncTimeToDOM(video.currentTime);
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


    // Apply per-item scale override on top of global scale
    const itemScale = scale * (event.customScale ?? 1);
    const W = CARD_W * itemScale; const H = CARD_H * itemScale;
    const x = canvasW - W - CARD_X_OFFSET * itemScale;
    // Use global scale for slot spacing so other cards don't shift
    const slotH = CARD_H * scale;
    const y = CARD_Y_START * scale + slotIndex * (slotH + CARD_GAP * scale);

    // Compute animation phase fractions dynamically from slider values
    // customDuration (seconds) overrides global cardLifetime (now in ms)
    const lifeMs = (event.customDuration !== undefined ? event.customDuration * 1000 : cardLifetime[0]);
    const enterMs   = Math.min(400, lifeMs * 0.1);
    const pauseMs   = Math.min(pauseBeforeExpand[0], lifeMs * 0.15);
    const expMs     = Math.min(expandDuration[0],    lifeMs * 0.12);
    const shrinkMs  = expMs;
    const holdMs    = Math.min(pauseAfterExpand[0],  lifeMs * 0.15);
    const exitMs    = Math.min(700, lifeMs * 0.15);
    const T_enter  = enterMs / lifeMs;
    const T_pause1 = T_enter + pauseMs / lifeMs;
    const T_expand = T_pause1 + expMs / lifeMs;
    const T_shrink = T_expand + shrinkMs / lifeMs;
    const T_hold   = T_shrink + holdMs / lifeMs;
    const exScale  = expandScale[0]; // user-controlled expand multiplier

    // Compute right-edge anchor so expansion never detaches from canvas edge
    const rightEdge = canvasW - CARD_X_OFFSET * itemScale;
    let cardX = x, cardScale = scale, opacity = 1, cardY = y;

    if (animProgress < T_enter) {
      const p = animProgress / T_enter; cardX = x + (1 - p) * W; opacity = p;
    } else if (animProgress < T_pause1) {
      cardX = x;
    } else if (animProgress < T_expand) {
      const p = (animProgress - T_pause1) / Math.max(0.001, T_expand - T_pause1);
      cardScale = scale * (1 + p * (exScale - 1)); cardX = rightEdge - CARD_W * cardScale;
    } else if (animProgress < T_shrink) {
      const p = (animProgress - T_expand) / Math.max(0.001, T_shrink - T_expand);
      cardScale = scale * (exScale - p * (exScale - 1)); cardX = rightEdge - CARD_W * cardScale;
    } else if (animProgress < T_hold) {
      cardX = x;
    } else {
      const p = (animProgress - T_hold) / Math.max(0.001, 1 - T_hold);
      opacity = 1 - p; cardY = y - p * H * 1.5;
    }

    ctx.save(); ctx.globalAlpha = Math.max(0, opacity);
    // Width expands with cardScale; height is FIXED to avoid overlapping adjacent slots
    const CW = CARD_W * cardScale;
    const CH = H; // fixed height — only width/x changes during expand
    const barW = 5 * itemScale;

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
    // Per-item font size multiplier (text events only)
    const fontMult = (event.isText ? (event.customFontSize ?? 1) : 1) * itemScale;

    if (event.isText) {
      // ── TEXT ONLY CARD ──
      ctx.fillStyle = textColor;
      ctx.font = `bold ${11 * fontMult}px Arial, sans-serif`;
      ctx.fillText(rarityDef[lang].toUpperCase(), cardX + barW + 12 * itemScale, cardY + CH * 0.38);
      ctx.fillStyle = isPrismatic ? getPrismaticTextColor(animProgress + 0.1) : 'rgba(255,255,255,0.95)';
      ctx.font = `bold ${15 * fontMult}px Arial, sans-serif`;
      const txt = event.textContent || '';
      const maxW2 = CW - barW - 16 * itemScale;
      let disp = txt;
      while (ctx.measureText(disp).width > maxW2 && disp.length > 1) disp = disp.slice(0, -1);
      if (disp !== txt) disp += '…';
      ctx.fillText(disp, cardX + barW + 12 * itemScale, cardY + CH * 0.7);
    } else {
      // ── ITEM CARD ──
      const item = event.item!;
      const iconSize = CH * 0.7;
      const iconX = cardX + barW + 8 * itemScale;
      const iconY = cardY + (CH - iconSize) / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(iconX, iconY, iconSize, iconSize);
      const img = item.image ? loadedImagesRef.current[item.id] : null;
      if (img) {
        try {
          // Contain: preserve natural aspect ratio within the icon box
          const pad = 2;
          const boxW = iconSize - pad * 2;
          const boxH = iconSize - pad * 2;
          const nat = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
          let dw = boxW, dh = boxH;
          if (nat > 1) { dh = boxW / nat; } else { dw = boxH * nat; }
          const dx = iconX + pad + (boxW - dw) / 2;
          const dy = iconY + pad + (boxH - dh) / 2;
          ctx.drawImage(img, dx, dy, dw, dh);
        } catch {}
      }
      const textX = iconX + iconSize + 8 * itemScale;
      ctx.fillStyle = textColor;
      ctx.font = `bold ${10 * itemScale}px Arial, sans-serif`;
      ctx.fillText(rarityDef[lang].toUpperCase(), textX, cardY + CH * 0.38);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = `bold ${13 * itemScale}px Arial, sans-serif`;
      const name = item.name[lang] || item.name.zh;
      const maxW = CW - (textX - cardX) - 8 * itemScale;
      let disp = name;
      while (ctx.measureText(disp).width > maxW && disp.length > 1) disp = disp.slice(0, -1);
      if (disp !== name) disp += '…';
      ctx.fillText(disp, textX, cardY + CH * 0.68);
    }

    // ── Junk crack overlay ──
    if (rarityKey === 'junk') {
      let crackProgress = 0;
      if (animProgress >= T_pause1 && animProgress < T_shrink) {
        crackProgress = (animProgress - T_pause1) / Math.max(0.001, T_shrink - T_pause1);
      } else if (animProgress >= T_shrink) {
        crackProgress = 1;
      }
      drawCrackEffect(ctx, cardX, cardY, CW, CH, crackProgress);
    }

    ctx.restore();
  }, [lang, cardLifetime, pauseBeforeExpand, expandDuration, pauseAfterExpand, expandScale]);

  const renderFrame = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement, cards: ActiveCard[], tMs: number) => {
    const ctx = canvas.getContext('2d')!;
    const scale = overlayScale[0];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    cards.filter(c => tMs >= c.startTime && tMs < c.startTime + c.duration)
      .slice(-maxStackItems[0])
      .forEach((card, idx) => {
        const progress = Math.min(1, (tMs - card.startTime) / card.duration);
        drawCard(ctx, card.event, idx, progress, scale, canvas.width);
      });
  }, [overlayScale, maxStackItems, drawCard]);

  // ── PLAYBACK ──
  const playbackLoop = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
    const loop = () => {
      const tMs = video.currentTime * 1000;
      markedEventsRef.current.forEach(evt => {
        if (scheduledRef.current.has(evt.id)) return;
        if (tMs >= evt.timestamp * 1000 - 50) {
          scheduledRef.current.add(evt.id);
          const nc: ActiveCard = { uid: `${evt.id}_p`, event: evt, startTime: evt.timestamp * 1000, duration: cardLifetime[0] };
          activeCardsRef.current = [...activeCardsRef.current, nc];
        }
      });
      renderFrame(video, canvas, activeCardsRef.current, tMs);
      if (!video.paused && !video.ended) animFrameRef.current = requestAnimationFrame(loop);
      else if (video.ended) { stopUiTick(); setCurrentTime(video.currentTime); syncTimeToDOM(video.currentTime); setIsPlaying(false); setIsPaused(false); }
    };
    animFrameRef.current = requestAnimationFrame(loop);
    startUiTick();
  }, [renderFrame, cardLifetime, startUiTick, stopUiTick]);

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
      activeCardsRef.current = [];
      setCurrentTime(0); syncTimeToDOM(0);
      video.play().then(() => { setIsPlaying(true); setIsPaused(false); playbackLoop(video, canvas); });
    }
  }, [videoSize, isPaused, playbackLoop]);

  const handlePause = useCallback(() => {
    const video = videoRef.current; if (!video) return;
    video.pause();
    cancelAnimationFrame(animFrameRef.current);
    stopUiTick();
    setCurrentTime(video.currentTime); syncTimeToDOM(video.currentTime);
    setIsPlaying(false); setIsPaused(true);
  }, [stopUiTick]);

  const handleStop = () => {
    const video = videoRef.current; if (!video) return;
    video.pause(); cancelAnimationFrame(animFrameRef.current);
    stopUiTick();
    setIsPlaying(false); setIsPaused(false);
    activeCardsRef.current = [];
    scheduledRef.current = new Set();
    video.currentTime = 0; setCurrentTime(0); syncTimeToDOM(0);
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

  const handlePickerSelectItem = (item: LibraryItem) => {
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

  // ── PER-ITEM CONTEXT MENU ──
  const [ctxMenu, setCtxMenu] = useState<{ eventId: string; x: number; y: number } | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);

  const handleUpdateEventParam = (id: string, param: 'customScale' | 'customDuration' | 'customFontSize', value: number) => {
    setMarkedEvents(prev => prev.map(e => e.id === id ? { ...e, [param]: value } : e));
  };

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e: MouseEvent) => {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    };
    setTimeout(() => window.addEventListener('mousedown', handler), 10);
    return () => window.removeEventListener('mousedown', handler);
  }, [ctxMenu]);

  // ── SEEK ──
  const seekTo = (pct: number) => {
    const video = videoRef.current; if (!video) return;
    const t = pct * videoDuration;
    const tMs = t * 1000;
    video.currentTime = t; setCurrentTime(t); syncTimeToDOM(t);
    // Only mark events strictly before seek point as "already shown"
    scheduledRef.current = new Set(
      markedEventsRef.current.filter(e => e.timestamp * 1000 < tMs).map(e => e.id)
    );
    // CRITICAL: clear all active cards so they don't duplicate when replaying
    activeCardsRef.current = [];
    // Redraw video frame when not playing
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d')!.drawImage(video, 0, 0);
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

  // Cleanup on unmount: cancel animation frame, stop MediaRecorder, close AudioContext
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      stopUiTick();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
      try { audioCtxRef.current?.close(); } catch {}
    };
  }, [stopUiTick]);

  // ── EXPORT ──
  const startExport = async () => {
    const video = videoRef.current; const canvas = canvasRef.current; if (!video || !canvas) return;

    // Cancel any existing animation loop first
    cancelAnimationFrame(animFrameRef.current);
    // Stop any in-progress recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    // Pause and reset video
    video.pause();
    setIsPlaying(false); setIsPaused(false);

    try {
      canvas.width = videoSize.w; canvas.height = videoSize.h;
      scheduledRef.current = new Set();
      activeCardsRef.current = [];
      chunksRef.current = []; setExportDone(false); setExportUrl(null); setRecordProgress(0);

      // Wait for seek to complete before starting playback
      await new Promise<void>((resolve) => {
        const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
        video.addEventListener('seeked', onSeeked);
        video.currentTime = 0;
        // If already at 0, seeked may not fire
        if (video.currentTime === 0) { video.removeEventListener('seeked', onSeeked); resolve(); }
      });

      const stream = canvas.captureStream(60);

      // ── AudioContext route: most reliable way to capture video audio in Chrome ──
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioContext();
        }
        const audioCtx = audioCtxRef.current;
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        // createMediaElementSource can only be called once per element — reuse the node
        if (!audioSourceRef.current) {
          audioSourceRef.current = audioCtx.createMediaElementSource(video);
        }
        if (!audioDestRef.current) {
          audioDestRef.current = audioCtx.createMediaStreamDestination();
        }
        // reconnect: source → speakers + source → recorder destination
        audioSourceRef.current.disconnect();
        audioSourceRef.current.connect(audioCtx.destination);     // keep audio playing
        audioSourceRef.current.connect(audioDestRef.current);     // also pipe to recorder
        audioDestRef.current.stream.getAudioTracks().forEach(t => stream.addTrack(t));
      } catch (e) {
        console.warn('AudioContext audio capture failed:', e);
      }

      // ── WebM VP9: high bitrate ≈ near-lossless quality ──
      const mimeType =
        MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' :
        MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' :
        MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '';
      if (!mimeType) throw new Error('当前浏览器不支持视频录制，请使用 Chrome 或 Edge。');
      exportMimeRef.current = mimeType;

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 50_000_000,   // 50 Mbps ≈ visually lossless for 1080p VP9
        audioBitsPerSecond: 320_000,
      });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        cancelAnimationFrame(animFrameRef.current);
        if (chunksRef.current.length > 0) {
          const blobType = exportMimeRef.current || mimeType;
          setExportUrl(URL.createObjectURL(new Blob(chunksRef.current, { type: blobType })));
          setExportDone(true);
        }
        setIsRecording(false);
      };
      recorder.start(100); setIsRecording(true);

      const dur = video.duration || 1;
      const loop = () => {
        if (!videoRef.current || !canvasRef.current) { recorder.stop(); return; }
        const tMs = video.currentTime * 1000;
        // Update ref only — UI tick interval reads this at 100ms cadence (no React setState here)
        recordProgressRef.current = Math.round((video.currentTime / dur) * 100);
        markedEventsRef.current.forEach(evt => {
          if (scheduledRef.current.has(evt.id)) return;
          if (tMs >= evt.timestamp * 1000 - 50) {
            scheduledRef.current.add(evt.id);
            const nc: ActiveCard = { uid: evt.id, event: evt, startTime: evt.timestamp * 1000, duration: cardLifetime[0] };
            activeCardsRef.current = [...activeCardsRef.current, nc];
          }
        });
        renderFrame(video, canvas, activeCardsRef.current, tMs);
        if (!video.ended && !video.paused) {
          animFrameRef.current = requestAnimationFrame(loop);
        } else {
          stopUiTick();
          if (recorder.state !== 'inactive') recorder.stop();
        }
      };

      await video.play();
      setIsPlaying(true);
      startUiTick();
      animFrameRef.current = requestAnimationFrame(loop);
    } catch (err) {
      setIsRecording(false);
      const msg = err instanceof Error ? err.message : String(err);
      alert(`导出失败：${msg}`);
    }
  };

  const stopExport = () => {
    cancelAnimationFrame(animFrameRef.current);
    stopUiTick();
    videoRef.current?.pause();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    setIsPlaying(false);
    setIsRecording(false);
  };

  // Filtered items for picker
  const filteredItems = allItems.filter(item => {
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
                  <span ref={exportProgressTextRef} className="text-sm text-red-200 font-bold">合成渲染中 0%</span>
                  <div className="w-20 h-1.5 bg-red-900 rounded-full overflow-hidden">
                    <div ref={exportProgressFillRef} className="h-full bg-red-400 rounded-full transition-none" style={{ width: '0%' }} />
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
                  <div ref={progressFillRef} className="h-full bg-violet-500 rounded-full pointer-events-none transition-none" style={{ width: '0%' }} />
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
                  <div ref={progressThumbRef} className="absolute top-1/2 w-3.5 h-3.5 bg-white rounded-full border-2 border-slate-900 pointer-events-none shadow-md"
                    style={{ left: '0%', transform: 'translate(-50%,-50%)' }}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <span ref={timeTextRef} className="text-xs text-slate-400 font-mono shrink-0">00:00.00</span>
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
          {/* Hidden import file input */}
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportEvents(f); e.target.value = ''; }}
          />

          <div className="px-4 py-3 border-b border-slate-800 shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-300">{lang === 'zh' ? '已标记出货点' : 'Marked Events'}</h2>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-violet-400 font-bold bg-violet-400/10 px-2 py-0.5 rounded-full">{markedEvents.length}</span>
                {/* Import */}
                <button
                  onClick={() => importInputRef.current?.click()}
                  className="p-1 text-slate-500 hover:text-sky-400 transition-colors"
                  title={lang === 'zh' ? '导入标记文件' : 'Import marks JSON'}
                  data-testid="button-import-events"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4 4m0 0l4-4m-4 4V4" />
                  </svg>
                </button>
                {/* Export */}
                {markedEvents.length > 0 && (
                  <button
                    onClick={handleExportEvents}
                    className="p-1 text-slate-500 hover:text-green-400 transition-colors"
                    title={lang === 'zh' ? '导出标记文件' : 'Export marks JSON'}
                    data-testid="button-export-events"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M16 12l-4-4m0 0L8 12m4-4v12" />
                    </svg>
                  </button>
                )}
                {/* Clear all */}
                {markedEvents.length > 0 && (
                  <button
                    onClick={() => {
                      if (window.confirm(lang === 'zh' ? `确定清空全部 ${markedEvents.length} 个标记点？` : `Clear all ${markedEvents.length} marks?`)) {
                        setMarkedEvents([]);
                        scheduledRef.current = new Set();
                        activeCardsRef.current = [];
                      }
                    }}
                    className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                    title={lang === 'zh' ? '清空所有标记' : 'Clear all marks'}
                    data-testid="button-clear-events"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-slate-600 mt-1">
              {lang === 'zh' ? '播放时按 M 键或点右上角「出货」按钮 · 右键调整单项' : 'Press M or click "Loot!" · Right-click to adjust per item'}
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
                  const hasCustom = evt.customScale !== undefined || evt.customDuration !== undefined || evt.customFontSize !== undefined;
                  return (
                    <div
                      key={evt.id}
                      className={cn("flex items-center gap-2.5 p-2.5 bg-slate-900 border rounded-lg group transition-colors cursor-context-menu select-none",
                        hasCustom ? "border-violet-700/50 hover:border-violet-600/60" : "border-slate-800 hover:border-slate-700"
                      )}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setCtxMenu({ eventId: evt.id, x: e.clientX, y: e.clientY });
                      }}
                    >
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
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-slate-500 font-mono">{formatTime(evt.timestamp)}</span>
                          {evt.isText && <span className="text-[10px] text-slate-600 bg-slate-800 px-1 rounded">文字</span>}
                          {evt.customScale !== undefined && <span className="text-[10px] text-violet-400 bg-violet-400/10 px-1 rounded">{evt.customScale.toFixed(1)}x</span>}
                          {evt.customDuration !== undefined && <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1 rounded">{evt.customDuration}s</span>}
                          {evt.customFontSize !== undefined && <span className="text-[10px] text-sky-400 bg-sky-400/10 px-1 rounded">字{evt.customFontSize.toFixed(1)}x</span>}
                        </div>
                      </div>
                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-all gap-0.5 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); setCtxMenu({ eventId: evt.id, x: e.clientX, y: e.clientY }); }}
                          className="p-1 text-slate-500 hover:text-violet-400 transition-colors"
                          title="右键也可调整"
                        >
                          <RefreshCcw className="w-3 h-3" />
                        </button>
                        <button onClick={() => handleDeleteEvent(evt.id)} className="p-1 text-slate-600 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Export */}
          <div className="border-t border-slate-800 p-4 space-y-3 shrink-0">
            {/* Sliders header with reset */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">动画参数</span>
              <button
                onClick={() => {
                  setOverlayScale([1]); setCardLifetime([8]);
                  setPauseBeforeExpand([500]); setExpandDuration([300]);
                  setPauseAfterExpand([1000]); setExpandScale([1.5]);
                  setMaxStackItems([3]);
                }}
                className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-violet-400 transition-colors px-2 py-0.5 rounded hover:bg-violet-400/10"
              >
                <RotateCcw className="w-2.5 h-2.5" />恢复默认
              </button>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              {[
                { label: lang==='zh'?'卡片大小':'Scale', val: overlayScale[0].toFixed(1)+'x', slider: <Slider value={overlayScale} onValueChange={setOverlayScale} min={0.5} max={2} step={0.1} /> },
                { label: lang==='zh'?'消失时间':'Duration', val: cardLifetime[0]+'ms', slider: <Slider value={cardLifetime} onValueChange={setCardLifetime} min={500} max={20000} step={100} /> },
                { label: lang==='zh'?'停留放大':'Pause→Expand', val: pauseBeforeExpand[0]+'ms', slider: <Slider value={pauseBeforeExpand} onValueChange={setPauseBeforeExpand} min={100} max={3000} step={100} /> },
                { label: lang==='zh'?'放大时长':'Expand Time', val: expandDuration[0]+'ms', slider: <Slider value={expandDuration} onValueChange={setExpandDuration} min={100} max={2000} step={100} /> },
                { label: lang==='zh'?'恢复停留':'Hold After', val: pauseAfterExpand[0]+'ms', slider: <Slider value={pauseAfterExpand} onValueChange={setPauseAfterExpand} min={100} max={3000} step={100} /> },
                { label: lang==='zh'?'放大倍率':'Expand Scale', val: expandScale[0].toFixed(1)+'x', slider: <Slider value={expandScale} onValueChange={setExpandScale} min={1.1} max={3} step={0.1} /> },
                { label: lang==='zh'?'同屏最多':'Max Stack', val: maxStackItems[0]+'个', slider: <Slider value={maxStackItems} onValueChange={setMaxStackItems} min={1} max={10} step={1} /> },
              ].map(({ label, val, slider }) => (
                <div key={label} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-400">{label}</span>
                    <span className="text-[10px] text-emerald-400 font-mono">{val}</span>
                  </div>
                  {slider}
                </div>
              ))}
            </div>
            {!exportDone ? (
              <Button
                className={cn("w-full text-white font-bold", isRecording ? "bg-red-600 hover:bg-red-500" : "bg-violet-600 hover:bg-violet-500")}
                onClick={isRecording ? stopExport : startExport}
                disabled={markedEvents.length === 0 || (isPlaying && !isRecording)}
              >
                {isRecording ? <><Square className="w-4 h-4 mr-2" /><span ref={exportBtnPctRef}>{lang === 'zh' ? '停止 0%' : 'Stop 0%'}</span></> : <><Film className="w-4 h-4 mr-2" />{lang === 'zh' ? '合成并导出' : 'Render & Export'}</>}
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium"><CheckCircle2 className="w-4 h-4" />{lang === 'zh' ? '导出完成！' : 'Done!'}</div>
                <a href={exportUrl!} download={`loot_overlay_${Date.now()}.${exportMimeRef.current.includes('mp4') ? 'mp4' : 'webm'}`} className="flex items-center justify-center gap-2 w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-sm transition-colors">
                  <Download className="w-4 h-4" />{lang === 'zh' ? '下载视频' : 'Download'}
                </a>
                <button onClick={() => { setExportDone(false); setExportUrl(null); }} className="w-full py-1 text-xs text-slate-500 hover:text-slate-300 transition-colors">{lang === 'zh' ? '重新导出' : 'Re-export'}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── PER-ITEM CONTEXT MENU ── */}
      {ctxMenu && markedEvents.find(e => e.id === ctxMenu.eventId) && (() => {
          const cEvt = markedEvents.find(e => e.id === ctxMenu.eventId)!;
          const isTextEvt = !!cEvt.isText;
          const menuW = 248, menuH = isTextEvt ? 220 : 160;
          const clampedX = Math.min(ctxMenu.x, window.innerWidth - menuW - 8);
          const clampedY = Math.min(ctxMenu.y, window.innerHeight - menuH - 8);
          return (
            <div
              ref={ctxMenuRef}
              className="fixed z-[100] bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-3 w-[248px] animate-in fade-in zoom-in-95 duration-100"
              style={{ left: clampedX, top: clampedY }}
            >
              <div className="text-[11px] font-semibold text-slate-400 mb-2.5 px-0.5 flex items-center justify-between">
                <span>{lang === 'zh' ? '单独调整' : 'Item Override'}</span>
                <button
                  className="text-slate-600 hover:text-slate-300 transition-colors"
                  onClick={() => {
                    setMarkedEvents(prev => prev.map(e =>
                      e.id === ctxMenu.eventId
                        ? { ...e, customScale: undefined, customDuration: undefined, customFontSize: undefined }
                        : e
                    ));
                  }}
                  title={lang === 'zh' ? '重置' : 'Reset'}
                >
                  <RefreshCcw className="w-3 h-3" />
                </button>
              </div>

              {/* Scale override */}
              <div className="mb-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-slate-300">{lang === 'zh' ? '缩放' : 'Scale'}</span>
                  <span className="text-[11px] text-violet-400 font-mono">{(cEvt.customScale ?? 1).toFixed(2)}x</span>
                </div>
                <input
                  type="range" min="0.5" max="3" step="0.05"
                  value={cEvt.customScale ?? 1}
                  onChange={e => handleUpdateEventParam(ctxMenu.eventId, 'customScale', Number(e.target.value))}
                  className="w-full h-1 accent-violet-500"
                />
              </div>

              {/* Duration override */}
              <div className="mb-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-slate-300">{lang === 'zh' ? '显示时长' : 'Duration'}</span>
                  <span className="text-[11px] text-amber-400 font-mono">{(cEvt.customDuration ?? cardLifetime[0] / 1000).toFixed(1)}s</span>
                </div>
                <input
                  type="range" min="1" max="30" step="0.5"
                  value={cEvt.customDuration ?? cardLifetime[0] / 1000}
                  onChange={e => handleUpdateEventParam(ctxMenu.eventId, 'customDuration', Number(e.target.value))}
                  className="w-full h-1 accent-amber-500"
                />
              </div>

              {/* Font size override (text events only) */}
              {isTextEvt && (
                <div className="mb-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-slate-300">{lang === 'zh' ? '字体大小' : 'Font Size'}</span>
                    <span className="text-[11px] text-sky-400 font-mono">{(cEvt.customFontSize ?? 1).toFixed(2)}x</span>
                  </div>
                  <input
                    type="range" min="0.5" max="3" step="0.05"
                    value={cEvt.customFontSize ?? 1}
                    onChange={e => handleUpdateEventParam(ctxMenu.eventId, 'customFontSize', Number(e.target.value))}
                    className="w-full h-1 accent-sky-500"
                  />
                </div>
              )}

              <div className="flex gap-2 mt-3 pt-2.5 border-t border-slate-700">
                <button
                  className="flex-1 py-1 text-[11px] text-slate-400 bg-slate-700/60 hover:bg-slate-700 rounded-lg transition-colors"
                  onClick={() => setCtxMenu(null)}
                >
                  {lang === 'zh' ? '关闭' : 'Close'}
                </button>
                <button
                  className="flex-1 py-1 text-[11px] text-red-400 bg-red-400/10 hover:bg-red-400/20 rounded-lg transition-colors"
                  onClick={() => { handleDeleteEvent(ctxMenu.eventId); setCtxMenu(null); }}
                >
                  {lang === 'zh' ? '删除' : 'Delete'}
                </button>
              </div>
            </div>
          );
        })()}

      {/* ── ITEM PICKER DIALOG ── */}
      {showPicker && (
          <div
            className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
            onClick={() => setShowPicker(false)}
          >
            <div
              className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-100 text-base">{lang === 'zh' ? '添加出货弹窗' : 'Add Loot Card'}</h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">@ {formatTime(pickerTimestamp)}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {hasDeletedDefaults && (
                    <button onClick={restoreDefaults} title={lang === 'zh' ? '恢复默认物品' : 'Restore Defaults'} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 text-xs font-medium transition-colors">
                      <RefreshCcw className="w-3 h-3" />
                      {lang === 'zh' ? '恢复' : 'Restore'}
                    </button>
                  )}
                  <button onClick={() => setShowAddDialog(true)} title={lang === 'zh' ? '添加自定义物品' : 'Add Custom Item'} className="w-8 h-8 rounded-lg bg-violet-600/15 border border-violet-500/30 text-violet-400 hover:bg-violet-600/25 flex items-center justify-center transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                  <button onClick={() => setShowPicker(false)} className="text-slate-500 hover:text-slate-300 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 text-xl leading-none transition-colors">×</button>
                </div>
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
                          <div key={item.id} className="group relative">
                            <button onClick={() => handlePickerSelectItem(item)}
                              className="w-full flex items-center gap-2 p-2.5 bg-slate-800 hover:bg-slate-700 border border-transparent hover:border-amber-500/40 rounded-xl text-left transition-all active:scale-[0.97]"
                            >
                              <div className="w-1 h-9 rounded-full shrink-0" style={def.prismatic ? { background: PRISMATIC_GRADIENT } : { backgroundColor: def.color }} />
                              {item.image ? <img src={item.image} alt="" className="w-8 h-8 object-contain shrink-0" /> : <div className="w-8 h-8 bg-slate-700 rounded shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-slate-200 truncate font-medium">{item.name[lang]}</p>
                                <RarityBadge rarityKey={item.rarity} size="xs" />
                              </div>
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); deleteItem(item.id); }}
                              className="absolute top-1.5 right-1.5 w-5 h-5 rounded bg-slate-700/80 border border-slate-600/50 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-400 text-slate-500 transition-all"
                              title={lang === 'zh' ? '删除' : 'Delete'}
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
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
            </div>
          </div>
        )}

      {/* Add Custom Item Dialog */}
      {showAddDialog && (
        <AddItemDialog
          lang={lang}
          onAdd={addCustomItem}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  );
}
