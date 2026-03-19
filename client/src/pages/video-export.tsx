import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Upload, Play, Square, Download, Scan, Video,
  Clock, Trash2, CheckCircle2, Loader2, Plus,
  ChevronRight, Pause, Film, Globe, Package, RefreshCcw,
  AlertCircle, Image as ImageIcon
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

// Rarity → rarity key mapping for items
const RARITY_ALIASES: Record<string, string> = {
  mythic: "mythic", legendary: "legendary", epic: "epic", rare: "rare",
  red_card: "mythic", gold_card: "legendary", purple_card: "epic", blue_card: "rare",
};

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

// Pre-built rarity color entries for fast lookup
const RARITY_ENTRIES = Object.entries(RARITIES).map(([key, val]) => ({
  key, ...hexToRgb(val.color)
}));

interface ItemMatch {
  item: typeof MOCK_ITEMS[0];
  score: number; // lower = better (SSD)
}

interface DetectedEvent {
  id: string;
  timestamp: number;
  detectedRarity: string;
  confidence: number;        // 0–1 how sure we are a loot event happened
  frameThumb: string;        // data-url of frame at that timestamp
  suggestedItems: ItemMatch[]; // ranked by pixel similarity, best first
  assignedItem: typeof MOCK_ITEMS[0] | null;
  confirmed: boolean;
}

interface ActiveCard {
  uid: string;
  item: typeof MOCK_ITEMS[0];
  startTime: number;
  duration: number;
  customScale: number;
}

const CARD_W = 280;
const CARD_H = 72;
const CARD_X_OFFSET = 16;
const CARD_Y_START = 80;
const CARD_GAP = 8;
const MAX_STACK = 4;

// ----------- IMAGE SIMILARITY HELPERS -----------

// Load all item images into canvas pixel buffers (16×16) once
const itemPixelCache: Map<string, Uint8ClampedArray> = new Map();

async function loadItemPixels(item: typeof MOCK_ITEMS[0]): Promise<Uint8ClampedArray | null> {
  if (!item.image) return null;
  if (itemPixelCache.has(item.id)) return itemPixelCache.get(item.id)!;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 16; c.height = 16;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, 16, 16);
      const data = ctx.getImageData(0, 0, 16, 16).data;
      itemPixelCache.set(item.id, data);
      resolve(data);
    };
    img.onerror = () => resolve(null);
    img.src = item.image!;
  });
}

// Compare two 16×16 RGBA pixel arrays, return normalized SSD (0=identical,1=max diff)
function pixelSSD(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) {
    sum += (a[i] - b[i]) ** 2 + (a[i+1] - b[i+1]) ** 2 + (a[i+2] - b[i+2]) ** 2;
  }
  return sum / (a.length / 4 * 3 * 255 * 255);
}

// ----------- STRIP DETECTION -----------
// Looks for a full-height vertical strip matching a rarity color
// This matches the thin left-border bar of loot notifications.
function detectRarityStrip(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  threshold: number
): { rarityKey: string; x: number; score: number } | null {
  // Scan right 60% of the frame (notifications appear on right side)
  const xStart = Math.floor(W * 0.4);
  let best: { rarityKey: string; x: number; score: number } | null = null;
  let bestScore = 0;

  for (let x = xStart; x < W; x++) {
    for (const rc of RARITY_ENTRIES) {
      let matches = 0;
      for (let y = 0; y < H; y++) {
        const i = (y * W + x) * 4;
        if (colorDist(data[i], data[i+1], data[i+2], rc.r, rc.g, rc.b) < threshold) matches++;
      }
      const ratio = matches / H;
      if (ratio > 0.55 && ratio > bestScore) {
        bestScore = ratio;
        best = { rarityKey: rc.key, x, score: ratio };
      }
    }
  }
  return best;
}

// Extract a 64×64 crop from the icon region right next to the detected strip
function extractIconCrop(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  stripX: number
): Uint8ClampedArray {
  const iconX = Math.min(stripX + 4, W - 64);
  const iconY = Math.max(0, Math.floor(H / 2) - 32);
  return ctx.getImageData(iconX, iconY, 64, 64).data;
}

// Resize a 64×64 buffer to 16×16 by block-averaging
function downsample64to16(src: Uint8ClampedArray): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(16 * 16 * 4);
  for (let ty = 0; ty < 16; ty++) {
    for (let tx = 0; tx < 16; tx++) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let sy = ty * 4; sy < ty * 4 + 4; sy++) {
        for (let sx = tx * 4; sx < tx * 4 + 4; sx++) {
          const i = (sy * 64 + sx) * 4;
          r += src[i]; g += src[i+1]; b += src[i+2];
          count++;
        }
      }
      const di = (ty * 16 + tx) * 4;
      dst[di] = r / count; dst[di+1] = g / count; dst[di+2] = b / count; dst[di+3] = 255;
    }
  }
  return dst;
}

// ----------- MAIN COMPONENT -----------
export default function VideoExport() {
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const [step, setStep] = useState<'import' | 'scan' | 'review' | 'export'>('import');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoSize, setVideoSize] = useState({ w: 1920, h: 1080 });

  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanPhase, setScanPhase] = useState('');
  const [detectedEvents, setDetectedEvents] = useState<DetectedEvent[]>([]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const [activeCards, setActiveCards] = useState<ActiveCard[]>([]);
  const activeCardsRef = useRef<ActiveCard[]>([]);
  const scheduledRef = useRef<Set<string>>(new Set());
  const confirmedEventsRef = useRef<DetectedEvent[]>([]);

  // Progress bar drag state
  const progressBarRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const [overlayScale, setOverlayScale] = useState([1]);
  const [cardLifetime, setCardLifetime] = useState([8]);
  const [colorThreshold, setColorThreshold] = useState([40]);
  const [exportDone, setExportDone] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  const [assigningEventId, setAssigningEventId] = useState<string | null>(null);
  const [itemSearchQuery, setItemSearchQuery] = useState('');

  const loadedImagesRef = useRef<Record<string, HTMLImageElement>>({});

  // Pre-load all item images for rendering
  useEffect(() => {
    MOCK_ITEMS.forEach(item => {
      if (item.image && !loadedImagesRef.current[item.id]) {
        const img = new Image();
        img.src = item.image;
        img.onload = () => { loadedImagesRef.current[item.id] = img; };
      }
    });
    // also warm up pixel cache
    MOCK_ITEMS.forEach(item => { if (item.image) loadItemPixels(item); });
  }, []);

  const handleFileInput = (file: File) => {
    if (!file.type.startsWith('video/')) return;
    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setDetectedEvents([]);
    setStep('import');
    setExportDone(false);
    setExportUrl(null);
    setCurrentTime(0);
    setIsPlaying(false);
    setIsPaused(false);
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
    // Draw first frame to canvas
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = v.videoWidth || 1920;
      canvas.height = v.videoHeight || 1080;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(v, 0, 0);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 1000);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  // ========== IMPROVED SCAN ==========
  const scanVideo = async () => {
    const video = videoRef.current;
    const canvas = scanCanvasRef.current;
    if (!video || !canvas || !videoUrl) return;

    setIsScanning(true);
    setScanProgress(0);
    setScanPhase('正在预处理图片库...');
    setDetectedEvents([]);

    // Warm up pixel cache for all items
    await Promise.all(MOCK_ITEMS.map(item => loadItemPixels(item)));

    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const SW = 320; const SH = 180; // scan at lower resolution for speed
    canvas.width = SW; canvas.height = SH;

    // Thumbnail canvas (full res) for saving frame snapshots
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 160; thumbCanvas.height = 90;
    const thumbCtx = thumbCanvas.getContext('2d')!;

    const threshold = colorThreshold[0];
    const step = 0.33; // scan every 1/3 second
    const total = video.duration;
    const events: DetectedEvent[] = [];
    let lastEventTime = -3;

    setScanPhase('扫描中，识别出货时刻...');

    await new Promise<void>((resolve) => {
      video.currentTime = 0;
      let t = 0;

      const processFrame = async () => {
        if (t > total) { resolve(); return; }

        ctx.drawImage(video, 0, 0, SW, SH);
        const imgData = ctx.getImageData(0, 0, SW, SH);
        const data = imgData.data;

        const strip = detectRarityStrip(data, SW, SH, threshold);

        if (strip && t - lastEventTime > 2.0) {
          // Capture frame thumbnail
          thumbCtx.drawImage(video, 0, 0, 160, 90);
          const thumb = thumbCanvas.toDataURL('image/jpeg', 0.6);

          // Extract icon region and downsample to 16×16
          const iconCrop64 = extractIconCrop(ctx, SW, SH, strip.x);
          const iconCrop16 = downsample64to16(iconCrop64);

          // Rank items: first filter by detected rarity, then by pixel SSD
          const rarityKey = strip.rarityKey;
          const targetRarityValue = RARITY_ALIASES[rarityKey] || rarityKey;

          // Candidates: items with matching rarity (primary) or all items (fallback)
          let candidates = MOCK_ITEMS.filter(item => {
            const itemRarityAlias = RARITY_ALIASES[item.rarity] || item.rarity;
            const subcatAlias = item.subcategory ? RARITY_ALIASES[item.subcategory] || item.subcategory : null;
            return itemRarityAlias === targetRarityValue || subcatAlias === targetRarityValue ||
                   item.rarity === rarityKey || item.subcategory === rarityKey;
          });
          if (candidates.length === 0) candidates = MOCK_ITEMS;

          // Score each candidate by pixel similarity
          const scored: ItemMatch[] = [];
          for (const item of candidates) {
            const itemPx = itemPixelCache.get(item.id);
            if (itemPx) {
              const score = pixelSSD(iconCrop16, itemPx);
              scored.push({ item, score });
            } else {
              scored.push({ item, score: 0.5 }); // neutral score if no image
            }
          }
          scored.sort((a, b) => a.score - b.score);
          const top5 = scored.slice(0, 5);

          events.push({
            id: `evt_${Date.now()}_${t.toFixed(2)}`,
            timestamp: parseFloat(t.toFixed(2)),
            detectedRarity: rarityKey,
            confidence: strip.score,
            frameThumb: thumb,
            suggestedItems: top5,
            assignedItem: top5[0]?.item || null, // auto-assign best match
            confirmed: false
          });
          lastEventTime = t;
        }

        setScanProgress(Math.min(99, Math.round((t / total) * 100)));
        t = parseFloat((t + step).toFixed(2));
        video.currentTime = Math.min(t, total - 0.01);
      };

      video.onseeked = processFrame;
      video.currentTime = 0;
    });

    video.currentTime = 0;
    setScanProgress(100);
    setScanPhase('');
    setDetectedEvents(events.sort((a, b) => a.timestamp - b.timestamp));
    setIsScanning(false);
    if (events.length > 0) setStep('review');
  };

  // ========== CANVAS RENDERING ==========
  const drawCardRect = useCallback((
    ctx: CanvasRenderingContext2D,
    x: number, y: number, W: number, H: number,
    color: string, item: typeof MOCK_ITEMS[0], scale: number
  ) => {
    const barW = 5 * scale;
    ctx.fillStyle = 'rgba(10, 12, 18, 0.93)';
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.rect(x, y, W, H); ctx.fill(); ctx.stroke();

    ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = 8;
    ctx.fillRect(x, y, barW, H);
    ctx.shadowBlur = 0;

    const img = item.image ? loadedImagesRef.current[item.id] : null;
    const iconSize = H * 0.7;
    const iconX = x + barW + 8 * scale;
    const iconY = y + (H - iconSize) / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(iconX, iconY, iconSize, iconSize);
    if (img) { try { ctx.drawImage(img, iconX + 2, iconY + 2, iconSize - 4, iconSize - 4); } catch {} }

    const textX = iconX + iconSize + 8 * scale;
    const rarity = RARITIES[item.rarity] || RARITIES.mythic;
    ctx.fillStyle = rarity.color;
    ctx.font = `bold ${10 * scale}px Arial, sans-serif`;
    ctx.fillText((rarity[lang] || '').toUpperCase(), textX, y + H * 0.38);

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = `bold ${13 * scale}px Arial, sans-serif`;
    const name = item.name[lang] || item.name.zh;
    const maxW = W - (textX - x) - 8 * scale;
    let displayName = name;
    while (ctx.measureText(displayName).width > maxW && displayName.length > 1) displayName = displayName.slice(0, -1);
    if (displayName !== name) displayName += '…';
    ctx.fillText(displayName, textX, y + H * 0.68);
  }, [lang]);

  const drawLootCard = useCallback((
    ctx: CanvasRenderingContext2D, item: typeof MOCK_ITEMS[0],
    slotIndex: number, animProgress: number, scale: number, canvasW: number
  ) => {
    const rarity = RARITIES[item.rarity] || RARITIES.mythic;
    const W = CARD_W * scale; const H = CARD_H * scale;
    const x = canvasW - W - CARD_X_OFFSET * scale;
    const y = CARD_Y_START * scale + slotIndex * (H + CARD_GAP * scale);

    const T_enter = 0.08, T_pause1 = 0.18, T_expand = 0.28, T_shrink = 0.38, T_hold = 0.85;

    let cardX = x, cardScale = scale, opacity = 1, exitY = y;

    if (animProgress < T_enter) {
      const p = animProgress / T_enter;
      cardX = x + (1 - p) * W; opacity = p;
    } else if (animProgress < T_pause1) {
      cardX = x;
    } else if (animProgress < T_expand) {
      const p = (animProgress - T_pause1) / (T_expand - T_pause1);
      cardScale = scale * (1 + p * 0.3);
      cardX = x - (cardScale - scale) * 0.3 * W;
    } else if (animProgress < T_shrink) {
      const p = (animProgress - T_expand) / (T_shrink - T_expand);
      cardScale = scale * (1.3 - p * 0.3);
      cardX = x - (cardScale - scale) * 0.3 * W;
    } else if (animProgress < T_hold) {
      cardX = x;
    } else {
      const p = (animProgress - T_hold) / (1.0 - T_hold);
      cardX = x; opacity = 1 - p;
      exitY = y - p * H * 1.5;
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, opacity);
    drawCardRect(ctx, cardX, exitY === y ? y : exitY, CARD_W * cardScale, CARD_H * cardScale, rarity.color, item, cardScale);
    ctx.restore();
  }, [drawCardRect]);

  const renderFrame = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement, cards: ActiveCard[], videoTimeMs: number) => {
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width; const H = canvas.height;
    const scale = overlayScale[0];
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(video, 0, 0, W, H);
    const toShow = cards.filter(c => videoTimeMs >= c.startTime && videoTimeMs < c.startTime + c.duration).slice(-MAX_STACK);
    toShow.forEach((card, idx) => {
      const elapsed = videoTimeMs - card.startTime;
      const progress = Math.min(1, elapsed / card.duration);
      drawLootCard(ctx, card.item, idx, progress, card.customScale * scale, W);
    });
  }, [overlayScale, drawLootCard]);

  useEffect(() => { activeCardsRef.current = activeCards; }, [activeCards]);

  // ========== PLAYBACK ==========
  const startPlaybackLoop = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement, fromStart: boolean) => {
    const confirmed = confirmedEventsRef.current;

    if (fromStart) {
      video.currentTime = 0;
      scheduledRef.current = new Set();
      setActiveCards([]);
      activeCardsRef.current = [];
      setCurrentTime(0);
    }

    const loop = () => {
      const t = video.currentTime * 1000;
      setCurrentTime(video.currentTime);

      confirmed.forEach(evt => {
        if (!evt.assignedItem || scheduledRef.current.has(evt.id)) return;
        if (t >= evt.timestamp * 1000 - 100) {
          scheduledRef.current.add(evt.id);
          const newCard: ActiveCard = {
            uid: `${evt.id}_${Date.now()}`,
            item: evt.assignedItem,
            startTime: evt.timestamp * 1000,
            duration: cardLifetime[0] * 1000,
            customScale: 1
          };
          activeCardsRef.current = [...activeCardsRef.current, newCard];
          setActiveCards([...activeCardsRef.current]);
        }
      });

      renderFrame(video, canvas, activeCardsRef.current, t);

      if (!video.paused && !video.ended) {
        animFrameRef.current = requestAnimationFrame(loop);
      } else if (video.ended) {
        setIsPlaying(false); setIsPaused(false);
      }
    };

    video.play().then(() => {
      setIsPlaying(true); setIsPaused(false);
      animFrameRef.current = requestAnimationFrame(loop);
    });
  }, [renderFrame, cardLifetime]);

  const handlePlay = () => {
    const video = videoRef.current; const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = videoSize.w; canvas.height = videoSize.h;

    if (isPaused) {
      // Resume from current position without resetting scheduled events
      const confirmed = confirmedEventsRef.current;
      const loop = () => {
        const t = video.currentTime * 1000;
        setCurrentTime(video.currentTime);
        confirmed.forEach(evt => {
          if (!evt.assignedItem || scheduledRef.current.has(evt.id)) return;
          if (t >= evt.timestamp * 1000 - 100) {
            scheduledRef.current.add(evt.id);
            const newCard: ActiveCard = {
              uid: `${evt.id}_${Date.now()}`,
              item: evt.assignedItem,
              startTime: evt.timestamp * 1000,
              duration: cardLifetime[0] * 1000,
              customScale: 1
            };
            activeCardsRef.current = [...activeCardsRef.current, newCard];
            setActiveCards([...activeCardsRef.current]);
          }
        });
        renderFrame(video, canvas, activeCardsRef.current, t);
        if (!video.paused && !video.ended) {
          animFrameRef.current = requestAnimationFrame(loop);
        } else if (video.ended) { setIsPlaying(false); setIsPaused(false); }
      };
      video.play().then(() => { setIsPlaying(true); setIsPaused(false); animFrameRef.current = requestAnimationFrame(loop); });
    } else {
      startPlaybackLoop(video, canvas, true);
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
    // redraw first frame
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0);
    }
  };

  // Seek by time
  const seekTo = (pct: number) => {
    const video = videoRef.current; if (!video) return;
    const t = pct * videoDuration;
    video.currentTime = t;
    setCurrentTime(t);
    // Recompute which events have already been "shown"
    scheduledRef.current = new Set(
      confirmedEventsRef.current
        .filter(e => e.timestamp * 1000 < t * 1000)
        .map(e => e.id)
    );
    // Reset active cards for clean state after seek
    if (isPlaying || isPaused) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(video, 0, 0);
      }
    }
  };

  // Progress bar mouse handlers (drag support)
  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    const bar = progressBarRef.current; if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(pct);
  };
  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const bar = progressBarRef.current; if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(pct);
  };
  const handleProgressMouseUp = () => { isDraggingRef.current = false; };

  // ========== EXPORT ==========
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
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setExportUrl(URL.createObjectURL(blob));
      setExportDone(true); setIsRecording(false);
      cancelAnimationFrame(animFrameRef.current);
    };
    recorder.start(100);
    setIsRecording(true);

    const confirmed = confirmedEventsRef.current;
    const duration = video.duration;
    const loop = () => {
      const t = video.currentTime * 1000;
      setRecordProgress(Math.round((video.currentTime / duration) * 100));
      setCurrentTime(video.currentTime);
      confirmed.forEach(evt => {
        if (!evt.assignedItem || scheduledRef.current.has(evt.id)) return;
        if (t >= evt.timestamp * 1000 - 50) {
          scheduledRef.current.add(evt.id);
          const newCard: ActiveCard = { uid: evt.id, item: evt.assignedItem, startTime: evt.timestamp * 1000, duration: cardLifetime[0] * 1000, customScale: 1 };
          activeCardsRef.current = [...activeCardsRef.current, newCard];
          setActiveCards([...activeCardsRef.current]);
        }
      });
      renderFrame(video, canvas, activeCardsRef.current, t);
      if (!video.ended && !video.paused) { animFrameRef.current = requestAnimationFrame(loop); }
      else { recorder.stop(); }
    };
    await video.play();
    animFrameRef.current = requestAnimationFrame(loop);
  };

  const stopExport = () => {
    const video = videoRef.current; if (video) video.pause();
    mediaRecorderRef.current?.stop();
    cancelAnimationFrame(animFrameRef.current);
  };

  // ========== EVENT MANAGEMENT ==========
  const handleAssignItem = (eventId: string, item: typeof MOCK_ITEMS[0]) => {
    setDetectedEvents(prev => {
      const updated = prev.map(e => e.id === eventId ? { ...e, assignedItem: item, confirmed: true } : e);
      confirmedEventsRef.current = updated.filter(e => e.confirmed && e.assignedItem);
      return updated;
    });
  };

  const handleConfirm = (eventId: string) => {
    setDetectedEvents(prev => {
      const updated = prev.map(e => e.id === eventId ? { ...e, confirmed: true } : e);
      confirmedEventsRef.current = updated.filter(e => e.confirmed && e.assignedItem);
      return updated;
    });
  };

  const handleDeleteEvent = (id: string) => {
    setDetectedEvents(prev => {
      const updated = prev.filter(e => e.id !== id);
      confirmedEventsRef.current = updated.filter(e => e.confirmed && e.assignedItem);
      return updated;
    });
  };

  const handleConfirmAll = () => {
    setDetectedEvents(prev => {
      const updated = prev.map(e => e.assignedItem ? { ...e, confirmed: true } : e);
      confirmedEventsRef.current = updated.filter(e => e.confirmed && e.assignedItem);
      return updated;
    });
  };

  const handleAddManualEvent = () => {
    const input = prompt("输入时间点（秒，例如 12.5）");
    const ts = parseFloat(input || "");
    if (isNaN(ts)) return;
    const newEvt: DetectedEvent = {
      id: `manual_${Date.now()}`,
      timestamp: parseFloat(ts.toFixed(2)),
      detectedRarity: 'mythic',
      confidence: 1,
      frameThumb: '',
      suggestedItems: [],
      assignedItem: null,
      confirmed: false
    };
    setDetectedEvents(prev => [...prev, newEvt].sort((a, b) => a.timestamp - b.timestamp));
  };

  const confirmedCount = detectedEvents.filter(e => e.confirmed && e.assignedItem).length;
  const filteredItems = MOCK_ITEMS.filter(item =>
    item.name.zh.includes(itemSearchQuery) ||
    item.name.en.toLowerCase().includes(itemSearchQuery.toLowerCase())
  );

  const t = {
    zh: { title: "视频导出工具", back: "返回主界面", scanDesc: "逐帧扫描，通过游戏通知栏的竖向色条特征识别出货时刻，并自动匹配最相似物品", startScan: "开始自动扫描", scanning: "扫描中", confirmAll: "全部确认", selectItem: "选择物品", addManual: "手动添加", overlayScale: "弹窗大小", cardLifeLabel: "停留时长(秒)", colorThreshLabel: "检测灵敏度（越大越宽松）", startExport: "合成并导出视频", downloadVideo: "下载视频", preview: "预览" },
    en: { title: "Video Export", back: "Back", scanDesc: "Frame-by-frame scan detects loot events via game UI color strips and auto-matches items", startScan: "Start Auto Scan", scanning: "Scanning", confirmAll: "Confirm All", selectItem: "Select Item", addManual: "Add Manually", overlayScale: "Overlay Scale", cardLifeLabel: "Duration (s)", colorThreshLabel: "Detection Sensitivity", startExport: "Render & Export", downloadVideo: "Download Video", preview: "Preview" }
  }[lang];

  return (
    <div className="flex flex-col h-screen w-full bg-[#0a0a0a] text-slate-200 overflow-hidden"
      onMouseMove={handleProgressMouseMove}
      onMouseUp={handleProgressMouseUp}
    >
      {/* HEADER */}
      <header className="h-14 border-b border-slate-800 bg-[#111] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-200 gap-2">
              <ArrowLeft className="w-4 h-4" /> {t.back}
            </Button>
          </Link>
          <div className="w-px h-6 bg-slate-800" />
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-violet-400" />
            <h1 className="font-bold text-base tracking-wide">{t.title}</h1>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} className="text-slate-400">
          <Globe className="w-4 h-4 mr-1" />{lang === 'zh' ? 'EN' : '中'}
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: Video canvas */}
        <div className="flex-1 flex flex-col bg-black relative">
          {!videoUrl ? (
            <label
              className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-700 m-8 rounded-xl cursor-pointer hover:border-violet-500/50 hover:bg-violet-500/5 transition-all"
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
            >
              <input type="file" accept="video/*" className="hidden" onChange={e => e.target.files?.[0] && handleFileInput(e.target.files[0])} />
              <Upload className="w-16 h-16 text-slate-600 mb-4" />
              <p className="text-slate-400 text-lg font-medium">{lang === 'zh' ? '拖放或点击导入游戏录像' : 'Drop or click to import video'}</p>
              <p className="text-slate-600 text-sm mt-2">MP4 · MOV · AVI · WebM</p>
            </label>
          ) : (
            <>
              <canvas ref={canvasRef} className="w-full h-full object-contain bg-black" />
              <video ref={videoRef} src={videoUrl} className="hidden" onLoadedMetadata={handleVideoLoaded} preload="auto" />
              <canvas ref={scanCanvasRef} className="hidden" />

              {/* Controls */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl px-5 py-3 flex flex-col gap-2 shadow-xl min-w-[360px]">
                {/* Progress bar with drag support */}
                <div
                  ref={progressBarRef}
                  className="w-full h-2 bg-slate-700 rounded-full overflow-hidden cursor-pointer select-none"
                  onMouseDown={handleProgressMouseDown}
                  style={{ userSelect: 'none' }}
                >
                  <div className="h-full bg-violet-500 rounded-full transition-none" style={{ width: `${videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0}%` }} />
                </div>

                {/* Event markers on timeline */}
                <div className="relative w-full h-2 -mt-1">
                  {detectedEvents.filter(e => e.confirmed && e.assignedItem).map(evt => (
                    <div
                      key={evt.id}
                      className="absolute top-0 w-1 h-2 rounded-full"
                      style={{
                        left: `${(evt.timestamp / videoDuration) * 100}%`,
                        backgroundColor: RARITIES[evt.detectedRarity]?.color || '#fff',
                        transform: 'translateX(-50%)'
                      }}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 font-mono w-20">{formatTime(currentTime)}</span>
                  <div className="flex items-center gap-1 flex-1 justify-center">
                    {(isPlaying || isPaused) && (
                      <button onClick={handleStop} className="w-7 h-7 flex items-center justify-center bg-slate-700 rounded-full hover:bg-slate-600 transition-colors" title="停止并重置">
                        <Square className="w-3 h-3" />
                      </button>
                    )}
                    {isPlaying ? (
                      <button onClick={handlePause} className="w-8 h-8 flex items-center justify-center bg-slate-700 rounded-full hover:bg-slate-600 transition-colors">
                        <Pause className="w-4 h-4" />
                      </button>
                    ) : (
                      <button onClick={handlePlay} className="w-8 h-8 flex items-center justify-center bg-violet-500 rounded-full hover:bg-violet-400 transition-colors">
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    {isPaused && <span className="text-xs text-violet-400 font-medium">已暂停 · 点击继续</span>}
                  </div>
                  <span className="text-xs text-slate-500 font-mono w-20 text-right">{formatTime(videoDuration)}</span>
                </div>
              </div>

              {isRecording && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-900/90 border border-red-700 rounded-full px-4 py-2 flex items-center gap-3">
                  <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
                  <span className="text-sm text-red-300 font-bold">合成渲染中</span>
                  <div className="w-24 h-1.5 bg-red-900 rounded-full overflow-hidden">
                    <div className="h-full bg-red-400 rounded-full" style={{ width: `${recordProgress}%` }} />
                  </div>
                  <span className="text-sm text-red-200 font-mono">{recordProgress}%</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div className="w-[420px] flex flex-col bg-[#111] border-l border-slate-800 shrink-0">
          {/* Step tabs */}
          <div className="flex border-b border-slate-800 shrink-0">
            {(['import', 'scan', 'review', 'export'] as const).map((s, i) => (
              <button key={s} onClick={() => videoUrl && setStep(s)}
                className={cn("flex-1 py-3 text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2",
                  step === s ? "border-violet-500 text-violet-400 bg-violet-500/5" : "border-transparent text-slate-500 hover:text-slate-300"
                )}>
                {i + 1}.{lang === 'zh' ? ['导入','扫描','审核','导出'][i] : ['Import','Scan','Review','Export'][i]}
              </button>
            ))}
          </div>

          <ScrollArea className="flex-1 p-4">

            {/* ── IMPORT ── */}
            {step === 'import' && (
              <div className="space-y-4">
                {videoFile ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Film className="w-8 h-8 text-violet-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{videoFile.name}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {(videoFile.size / 1024 / 1024).toFixed(1)} MB · {videoSize.w}×{videoSize.h}
                          {videoDuration > 0 && ` · ${formatTime(videoDuration)}`}
                        </p>
                      </div>
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-600">
                    <Video className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">从左侧区域导入视频</p>
                  </div>
                )}
                <label className="block">
                  <div className="flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg cursor-pointer text-sm text-slate-300 transition-colors">
                    <Upload className="w-4 h-4" />{videoFile ? '重新选择视频' : '选择视频文件'}
                  </div>
                  <input type="file" accept="video/*" className="hidden" onChange={e => e.target.files?.[0] && handleFileInput(e.target.files[0])} />
                </label>
                {videoUrl && (
                  <Button className="w-full bg-violet-600 hover:bg-violet-500 text-white" onClick={() => setStep('scan')}>
                    前往扫描 <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
              </div>
            )}

            {/* ── SCAN ── */}
            {step === 'scan' && (
              <div className="space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-sm text-slate-400 leading-relaxed">
                  <div className="flex items-start gap-2">
                    <Scan className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                    <p>{t.scanDesc}</p>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-slate-400 mb-2 block">{t.colorThreshLabel}: {colorThreshold[0]}</Label>
                  <Slider value={colorThreshold} onValueChange={setColorThreshold} min={20} max={80} step={5} />
                  <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                    <span>更精确</span><span>更宽松</span>
                  </div>
                </div>

                {isScanning ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                      <span className="text-sm text-slate-300">{scanPhase}</span>
                      <span className="ml-auto text-sm font-mono text-violet-400">{scanProgress}%</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${scanProgress}%` }} />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Button className="w-full bg-violet-600 hover:bg-violet-500 text-white" onClick={scanVideo} disabled={!videoUrl}>
                      <Scan className="w-4 h-4 mr-2" />{t.startScan}
                    </Button>
                    <Button variant="outline" className="w-full border-slate-700 text-slate-300 hover:bg-slate-800" onClick={() => setStep('review')}>
                      跳过，手动设置
                    </Button>
                  </div>
                )}

                {detectedEvents.length > 0 && !isScanning && (
                  <div className="bg-violet-900/20 border border-violet-700/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-violet-400 text-sm font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      共检测到 {detectedEvents.length} 个出货时刻，已自动匹配物品
                    </div>
                    <Button className="w-full mt-3 bg-violet-600 hover:bg-violet-500 text-white" onClick={() => setStep('review')}>
                      查看并审核 <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* ── REVIEW ── */}
            {step === 'review' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    已确认: <span className="text-violet-400 font-bold">{confirmedCount}</span> / {detectedEvents.length}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={handleConfirmAll} className="text-xs text-violet-400 hover:text-violet-300 py-1 px-2 bg-violet-400/10 rounded">
                      {t.confirmAll}
                    </button>
                    <button onClick={handleAddManualEvent} className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 py-1 px-2 bg-slate-800 rounded">
                      <Plus className="w-3 h-3" />{t.addManual}
                    </button>
                  </div>
                </div>

                {detectedEvents.length === 0 ? (
                  <div className="text-center py-8 text-slate-600">
                    <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">无检测结果，请手动添加</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {detectedEvents.map(evt => {
                      const rarity = RARITIES[evt.detectedRarity] || RARITIES.mythic;
                      return (
                        <div key={evt.id} className={cn("border rounded-lg overflow-hidden transition-all",
                          evt.confirmed && evt.assignedItem ? "border-emerald-700/40 bg-emerald-900/10" : "border-slate-800 bg-slate-900"
                        )}>
                          {/* Event header */}
                          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/60">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: rarity.color }} />
                            <span className="font-mono text-sm text-slate-300 font-bold">{formatTime(evt.timestamp)}</span>
                            <span className="text-[10px] text-slate-600 bg-slate-800 px-1.5 rounded ml-1">
                              {Math.round(evt.confidence * 100)}% 可信度
                            </span>
                            {evt.confirmed && evt.assignedItem && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 ml-auto shrink-0" />}
                            <button onClick={() => handleDeleteEvent(evt.id)} className="ml-auto p-1 text-slate-600 hover:text-red-400 transition-colors">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Frame thumbnail + auto-matched item */}
                          <div className="p-3 space-y-2">
                            <div className="flex gap-3">
                              {/* Frame thumbnail */}
                              {evt.frameThumb ? (
                                <img src={evt.frameThumb} alt="frame" className="w-24 h-14 object-cover rounded border border-slate-700 shrink-0" />
                              ) : (
                                <div className="w-24 h-14 bg-slate-800 rounded border border-slate-700 flex items-center justify-center shrink-0">
                                  <ImageIcon className="w-4 h-4 text-slate-600" />
                                </div>
                              )}

                              {/* Auto-matched item display */}
                              <div className="flex-1 min-w-0">
                                {evt.assignedItem ? (
                                  <div className="space-y-1">
                                    <p className="text-[10px] text-slate-500">自动匹配结果</p>
                                    <div className="flex items-center gap-2 bg-slate-800 rounded p-1.5">
                                      {evt.assignedItem.image && (
                                        <img src={evt.assignedItem.image} alt="" className="w-7 h-7 object-contain shrink-0" />
                                      )}
                                      <span className="text-xs text-slate-200 truncate font-medium">{evt.assignedItem.name[lang]}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="h-full flex items-center">
                                    <p className="text-xs text-slate-600">无自动匹配</p>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Suggested alternatives */}
                            {evt.suggestedItems.length > 1 && (
                              <div>
                                <p className="text-[10px] text-slate-600 mb-1">其他候选</p>
                                <div className="flex gap-1.5 flex-wrap">
                                  {evt.suggestedItems.slice(1, 4).map((match, i) => (
                                    <button
                                      key={match.item.id}
                                      onClick={() => handleAssignItem(evt.id, match.item)}
                                      className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-violet-500/50 rounded text-xs text-slate-400 hover:text-slate-200 transition-all"
                                      title={match.item.name[lang]}
                                    >
                                      {match.item.image && <img src={match.item.image} alt="" className="w-4 h-4 object-contain" />}
                                      <span className="max-w-16 truncate">{match.item.name[lang]}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex gap-2 pt-1">
                              {!evt.confirmed && evt.assignedItem && (
                                <button
                                  onClick={() => handleConfirm(evt.id)}
                                  className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded transition-colors"
                                >
                                  ✓ 确认
                                </button>
                              )}
                              <button
                                onClick={() => setAssigningEventId(evt.id)}
                                className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded transition-colors"
                              >
                                {evt.assignedItem ? '换物品' : '选择物品'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <Button
                  className="w-full bg-violet-600 hover:bg-violet-500 text-white"
                  disabled={confirmedCount === 0}
                  onClick={() => {
                    handleConfirmAll();
                    setStep('export');
                  }}
                >
                  进入导出 ({confirmedCount} 个弹窗) <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}

            {/* ── EXPORT ── */}
            {step === 'export' && (
              <div className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-slate-400 mb-2 block">{t.overlayScale}: {overlayScale[0].toFixed(1)}x</Label>
                    <Slider value={overlayScale} onValueChange={setOverlayScale} min={0.5} max={2} step={0.1} />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-400 mb-2 block">{t.cardLifeLabel}: {cardLifetime[0]}s</Label>
                    <Slider value={cardLifetime} onValueChange={setCardLifetime} min={3} max={20} step={1} />
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-500 space-y-1.5">
                  <div className="flex justify-between"><span>已确认弹窗</span><span className="text-slate-300">{confirmedCount} 个</span></div>
                  <div className="flex justify-between"><span>视频分辨率</span><span className="text-slate-300">{videoSize.w}×{videoSize.h}</span></div>
                  <div className="flex justify-between"><span>输出格式</span><span className="text-slate-300">WebM (VP9)</span></div>
                </div>

                <div className="space-y-2">
                  <Button variant="outline" className="w-full border-slate-700 text-slate-300 hover:bg-slate-800" onClick={isPlaying ? handlePause : handlePlay} disabled={isRecording}>
                    {isPlaying ? <><Pause className="w-4 h-4 mr-2" />暂停预览</> : <><Play className="w-4 h-4 mr-2" />预览效果</>}
                  </Button>

                  {!exportDone ? (
                    <Button
                      className={cn("w-full text-white", isRecording ? "bg-red-600 hover:bg-red-500" : "bg-violet-600 hover:bg-violet-500")}
                      onClick={isRecording ? stopExport : startExport}
                      disabled={isPlaying}
                    >
                      {isRecording ? <><Square className="w-4 h-4 mr-2" />停止录制 {recordProgress}%</> : <><Film className="w-4 h-4 mr-2" />{t.startExport}</>}
                    </Button>
                  ) : (
                    <a
                      href={exportUrl!}
                      download={`loot_overlay_${Date.now()}.webm`}
                      className="flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors text-sm"
                    >
                      <Download className="w-4 h-4" />{t.downloadVideo}
                    </a>
                  )}
                </div>

                {exportDone && (
                  <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                      <CheckCircle2 className="w-4 h-4" />导出完成！
                    </div>
                    <p className="text-xs text-slate-500 mt-1">可直接上传至B站、抖音等平台</p>
                    <button onClick={() => { setExportDone(false); setExportUrl(null); }} className="mt-2 text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
                      <RefreshCcw className="w-3 h-3" />重新导出
                    </button>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Item selection dialog */}
      <AnimatePresence>
        {assigningEventId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
            onClick={() => { setAssigningEventId(null); setItemSearchQuery(''); }}
          >
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h3 className="font-semibold text-slate-200">{t.selectItem}</h3>
                <button onClick={() => { setAssigningEventId(null); setItemSearchQuery(''); }} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
              </div>
              <div className="p-3 border-b border-slate-800">
                <input
                  autoFocus
                  type="text"
                  placeholder="搜索物品..."
                  value={itemSearchQuery}
                  onChange={e => setItemSearchQuery(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-violet-500"
                />
              </div>
              <ScrollArea className="h-72">
                <div className="p-2 grid grid-cols-2 gap-1.5">
                  {filteredItems.map(item => {
                    const rarity = RARITIES[item.rarity] || RARITIES.mythic;
                    return (
                      <button
                        key={item.id}
                        onClick={() => { handleAssignItem(assigningEventId, item); setAssigningEventId(null); setItemSearchQuery(''); }}
                        className="flex items-center gap-2 p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-left transition-colors border border-transparent hover:border-violet-500/30"
                      >
                        <div className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: rarity.color }} />
                        {item.image && <img src={item.image} alt="" className="w-6 h-6 object-contain shrink-0" />}
                        <span className="text-xs text-slate-300 truncate">{item.name[lang]}</span>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
