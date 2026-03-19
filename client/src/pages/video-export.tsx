import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Upload, Play, Square, Download, Scan, Video,
  Clock, Trash2, CheckCircle2, AlertCircle, Loader2, Plus,
  ChevronRight, SkipForward, Pause, Film, Settings, Globe,
  SquareSquare, Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import MOCK_ITEMS_DATA from "../data.json";

const MOCK_ITEMS: { id: string; category: string; subcategory?: string; rarity: string; name: { zh: string; en: string }; image?: string }[] = MOCK_ITEMS_DATA;

const RARITIES = {
  mythic:    { color: "#ef4444", zh: "神话", en: "Mythic" },
  legendary: { color: "#f59e0b", zh: "传说", en: "Legendary" },
  epic:      { color: "#8b5cf6", zh: "史诗", en: "Epic" },
  rare:      { color: "#3b82f6", zh: "稀有", en: "Rare" },
  red_card:  { color: "#ef4444", zh: "红卡", en: "Red Card" },
  gold_card: { color: "#f59e0b", zh: "金卡", en: "Gold Card" },
  purple_card: { color: "#8b5cf6", zh: "紫卡", en: "Purple Card" },
  blue_card: { color: "#3b82f6", zh: "蓝卡", en: "Blue Card" },
};

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

interface DetectedEvent {
  id: string;
  timestamp: number;
  detectedRarity: string;
  colorScore: number;
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

type AnimPhase = 'enter' | 'pause1' | 'expand' | 'shrink' | 'hold' | 'exit' | 'done';

const CARD_W = 280;
const CARD_H = 72;
const CARD_X_OFFSET = 16;
const CARD_Y_START = 80;
const CARD_GAP = 8;
const MAX_STACK = 4;

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
  const [detectedEvents, setDetectedEvents] = useState<DetectedEvent[]>([]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const [activeCards, setActiveCards] = useState<ActiveCard[]>([]);
  const activeCardsRef = useRef<ActiveCard[]>([]);
  const scheduledRef = useRef<Set<string>>(new Set());
  const confirmedEventsRef = useRef<DetectedEvent[]>([]);

  const [overlayScale, setOverlayScale] = useState([1]);
  const [cardLifetime, setCardLifetime] = useState([8]);
  const [exportDone, setExportDone] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  const loadedImagesRef = useRef<Record<string, HTMLImageElement>>({});

  const t = {
    zh: {
      title: "视频导出工具", import: "导入视频", scan: "自动扫描",
      review: "确认时间轴", export: "合成导出",
      dropVideo: "拖放或点击导入游戏录像",
      scanDesc: "逐帧扫描，自动识别出货瞬间（通过出货UI的特征颜色检测）",
      startScan: "开始自动扫描", scanning: "扫描中...",
      found: "个出货时刻", confirmAll: "全部确认",
      assignItem: "指定物品",
      preview: "预览合成", startExport: "开始录制导出", recording: "正在合成...",
      downloadVideo: "下载视频", back: "返回主界面",
      noEvents: "未检测到出货时刻，请手动添加",
      addManual: "手动添加时刻",
      delete: "删除", confirm: "确认",
      overlayScale: "弹窗大小", cardLifetimeLabel: "停留时长(秒)",
      detectionSens: "检测灵敏度",
      selectItem: "选择物品",
      unassigned: "未指定物品"
    },
    en: {
      title: "Video Export", import: "Import Video", scan: "Auto Scan",
      review: "Review Timeline", export: "Export",
      dropVideo: "Drop or click to import game recording",
      scanDesc: "Frame-by-frame scan to detect loot moments via UI color detection",
      startScan: "Start Auto Scan", scanning: "Scanning...",
      found: " events found", confirmAll: "Confirm All",
      assignItem: "Assign Item",
      preview: "Preview", startExport: "Start Recording", recording: "Rendering...",
      downloadVideo: "Download Video", back: "Back",
      noEvents: "No events detected, add manually",
      addManual: "Add Manual Event",
      delete: "Delete", confirm: "Confirm",
      overlayScale: "Overlay Scale", cardLifetimeLabel: "Duration (s)",
      detectionSens: "Detection Sensitivity",
      selectItem: "Select Item",
      unassigned: "No Item Assigned"
    }
  }[lang];

  useEffect(() => {
    MOCK_ITEMS.forEach(item => {
      if (item.image && !loadedImagesRef.current[item.id]) {
        const img = new Image();
        img.src = item.image;
        img.onload = () => { loadedImagesRef.current[item.id] = img; };
      }
    });
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
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 1000);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  const scanVideo = async () => {
    const video = videoRef.current;
    const canvas = scanCanvasRef.current;
    if (!video || !canvas || !videoUrl) return;

    setIsScanning(true);
    setScanProgress(0);
    setDetectedEvents([]);

    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const W = 320;
    const H = 180;
    canvas.width = W;
    canvas.height = H;

    const rarityColors = Object.entries(RARITIES).map(([key, val]) => ({
      key,
      ...hexToRgb(val.color)
    }));

    const step = 0.5;
    const total = video.duration;
    const events: DetectedEvent[] = [];
    let lastEventTime = -3;
    const THRESHOLD = 45;
    const MIN_PIXELS = 12;

    await new Promise<void>((resolve) => {
      video.currentTime = 0;
      let t = 0;

      const processFrame = () => {
        if (t > total) { resolve(); return; }

        ctx.drawImage(video, 0, 0, W, H);
        const data = ctx.getImageData(0, 0, W, H).data;

        for (const rc of rarityColors) {
          let matchCount = 0;
          for (let i = 0; i < data.length; i += 4) {
            const dist = colorDistance(data[i], data[i + 1], data[i + 2], rc.r, rc.g, rc.b);
            if (dist < THRESHOLD) matchCount++;
          }
          const density = matchCount / (W * H);
          if (matchCount >= MIN_PIXELS && density < 0.3 && t - lastEventTime > 2) {
            events.push({
              id: `evt_${Date.now()}_${t.toFixed(1)}`,
              timestamp: t,
              detectedRarity: rc.key,
              colorScore: density,
              assignedItem: null,
              confirmed: false
            });
            lastEventTime = t;
            break;
          }
        }

        setScanProgress(Math.round((t / total) * 100));
        t += step;

        video.currentTime = Math.min(t, total - 0.01);
      };

      video.onseeked = processFrame;
      video.currentTime = 0;
    });

    video.currentTime = 0;
    setDetectedEvents(events.sort((a, b) => a.timestamp - b.timestamp));
    setIsScanning(false);
    setStep('review');
  };

  const drawLootCardOnCanvas = (
    ctx: CanvasRenderingContext2D,
    item: typeof MOCK_ITEMS[0],
    slotIndex: number,
    animProgress: number,
    scale: number,
    canvasH: number,
    canvasW: number
  ) => {
    const rarity = RARITIES[item.rarity as keyof typeof RARITIES] || RARITIES.mythic;
    const W = CARD_W * scale;
    const H = CARD_H * scale;
    const x = canvasW - W - CARD_X_OFFSET * scale;
    const y = CARD_Y_START * scale + slotIndex * (H + CARD_GAP * scale);

    const T_enter = 0.08;
    const T_pause1 = 0.18;
    const T_expand = 0.28;
    const T_shrink = 0.38;
    const T_hold = 0.85;
    const T_exit = 1.0;

    let cardX = x;
    let cardScale = scale;
    let opacity = 1;

    if (animProgress < T_enter) {
      const p = animProgress / T_enter;
      cardX = x + (1 - p) * W;
      opacity = p;
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
      const p = (animProgress - T_hold) / (T_exit - T_hold);
      cardX = x;
      opacity = 1 - p;
      const exitY = y - p * H * 1.5;
      ctx.save();
      ctx.globalAlpha = opacity;
      drawCardRect(ctx, cardX, exitY, W, H, rarity.color, item, scale, canvasW);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.globalAlpha = opacity;
    drawCardRect(ctx, cardX, y, W, H, rarity.color, item, cardScale, canvasW);
    ctx.restore();
  };

  const drawCardRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    W: number,
    H: number,
    color: string,
    item: typeof MOCK_ITEMS[0],
    scale: number,
    canvasW: number
  ) => {
    const barW = 5 * scale;

    ctx.save();
    ctx.translate(x + W / 2, y + H / 2);
    ctx.scale(scale / scale, scale / scale);
    ctx.translate(-(x + W / 2), -(y + H / 2));

    ctx.fillStyle = 'rgba(10, 12, 18, 0.93)';
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x, y, W, H);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillRect(x, y, barW, H);
    ctx.shadowBlur = 0;

    const img = item.image ? loadedImagesRef.current[item.id] : null;
    const iconSize = H * 0.7;
    const iconX = x + barW + 8 * scale;
    const iconY = y + (H - iconSize) / 2;

    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(iconX, iconY, iconSize, iconSize);

    if (img) {
      try {
        ctx.drawImage(img, iconX + 2, iconY + 2, iconSize - 4, iconSize - 4);
      } catch {}
    }

    const textX = iconX + iconSize + 8 * scale;
    const textY = y + H * 0.38;
    const rarity = RARITIES[item.rarity as keyof typeof RARITIES] || RARITIES.mythic;

    ctx.fillStyle = rarity.color;
    ctx.font = `bold ${10 * scale}px "Arial", sans-serif`;
    ctx.fillText((rarity as any)[lang]?.toUpperCase() || '', textX, textY);

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = `bold ${13 * scale}px "Arial", sans-serif`;
    const name = item.name[lang] || item.name.zh;
    const maxW = W - (textX - x) - 8 * scale;
    let displayName = name;
    while (ctx.measureText(displayName).width > maxW && displayName.length > 1) {
      displayName = displayName.slice(0, -1);
    }
    if (displayName !== name) displayName += '…';
    ctx.fillText(displayName, textX, y + H * 0.68);

    ctx.restore();
  };

  const renderFrame = useCallback((videoEl: HTMLVideoElement, canvas: HTMLCanvasElement, cards: ActiveCard[], videoTimeMs: number) => {
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;
    const scale = overlayScale[0];

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(videoEl, 0, 0, W, H);

    const active = cards.filter(c => videoTimeMs >= c.startTime && videoTimeMs < c.startTime + c.duration);
    const toShow = active.slice(-MAX_STACK);

    toShow.forEach((card, idx) => {
      const elapsed = videoTimeMs - card.startTime;
      const progress = Math.min(1, elapsed / card.duration);
      drawLootCardOnCanvas(ctx, card.item, idx, progress, card.customScale * scale, H, W);
    });
  }, [overlayScale, lang]);

  useEffect(() => {
    activeCardsRef.current = activeCards;
  }, [activeCards]);

  const startPreview = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = videoSize.w;
    canvas.height = videoSize.h;
    video.currentTime = 0;
    scheduledRef.current = new Set();

    const confirmed = confirmedEventsRef.current;

    const loop = () => {
      const t = video.currentTime * 1000;
      setCurrentTime(video.currentTime);

      confirmed.forEach(evt => {
        if (!evt.assignedItem || scheduledRef.current.has(evt.id)) return;
        if (t >= evt.timestamp * 1000 - 100) {
          scheduledRef.current.add(evt.id);
          const newCard: ActiveCard = {
            uid: evt.id,
            item: evt.assignedItem,
            startTime: evt.timestamp * 1000,
            duration: cardLifetime[0] * 1000,
            customScale: 1
          };
          setActiveCards(prev => [...prev, newCard]);
          activeCardsRef.current = [...activeCardsRef.current, newCard];
        }
      });

      renderFrame(video, canvas, activeCardsRef.current, t);

      if (!video.paused && !video.ended) {
        animFrameRef.current = requestAnimationFrame(loop);
      } else {
        setIsPlaying(false);
      }
    };

    video.play().then(() => {
      setIsPlaying(true);
      setActiveCards([]);
      activeCardsRef.current = [];
      animFrameRef.current = requestAnimationFrame(loop);
    });
  };

  const stopPreview = () => {
    const video = videoRef.current;
    if (video) video.pause();
    cancelAnimationFrame(animFrameRef.current);
    setIsPlaying(false);
  };

  const startExport = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = videoSize.w;
    canvas.height = videoSize.h;
    video.currentTime = 0;
    scheduledRef.current = new Set();
    setActiveCards([]);
    activeCardsRef.current = [];
    chunksRef.current = [];
    setExportDone(false);
    setExportUrl(null);
    setRecordProgress(0);

    const stream = canvas.captureStream(30);

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : 'video/mp4';

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setExportUrl(url);
      setExportDone(true);
      setIsRecording(false);
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
          const newCard: ActiveCard = {
            uid: evt.id,
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

      if (!video.ended && !video.paused) {
        animFrameRef.current = requestAnimationFrame(loop);
      } else {
        recorder.stop();
      }
    };

    await video.play();
    animFrameRef.current = requestAnimationFrame(loop);
  };

  const stopExport = () => {
    const video = videoRef.current;
    if (video) video.pause();
    mediaRecorderRef.current?.stop();
    cancelAnimationFrame(animFrameRef.current);
  };

  const handleConfirmEvent = (id: string) => {
    setDetectedEvents(prev => {
      const updated = prev.map(e => e.id === id ? { ...e, confirmed: true } : e);
      confirmedEventsRef.current = updated.filter(e => e.confirmed && e.assignedItem);
      return updated;
    });
  };

  const handleAssignItem = (eventId: string, item: typeof MOCK_ITEMS[0]) => {
    setDetectedEvents(prev => {
      const updated = prev.map(e => e.id === eventId ? { ...e, assignedItem: item, confirmed: true } : e);
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

  const handleAddManualEvent = () => {
    const ts = parseFloat(prompt("输入时间点（秒，例如 12.5）") || "");
    if (isNaN(ts)) return;
    const newEvt: DetectedEvent = {
      id: `manual_${Date.now()}`,
      timestamp: ts,
      detectedRarity: 'mythic',
      colorScore: 0,
      assignedItem: null,
      confirmed: false
    };
    setDetectedEvents(prev => {
      const updated = [...prev, newEvt].sort((a, b) => a.timestamp - b.timestamp);
      return updated;
    });
  };

  const confirmedCount = detectedEvents.filter(e => e.confirmed && e.assignedItem).length;

  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [assigningEventId, setAssigningEventId] = useState<string | null>(null);

  const filteredItems = MOCK_ITEMS.filter(item =>
    item.name.zh.includes(itemSearchQuery) || item.name.en.toLowerCase().includes(itemSearchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-screen w-full bg-[#0a0a0a] text-slate-200 overflow-hidden">
      <header className="h-14 border-b border-slate-800 bg-[#111] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-200 gap-2">
              <ArrowLeft className="w-4 h-4" />
              {t.back}
            </Button>
          </Link>
          <div className="w-px h-6 bg-slate-800" />
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-emerald-400" />
            <h1 className="font-bold text-base tracking-wider">{t.title}</h1>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} className="text-slate-400">
          <Globe className="w-4 h-4 mr-1" />
          {lang === 'zh' ? 'EN' : '中'}
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: Video preview canvas */}
        <div className="flex-1 flex flex-col bg-black relative">
          {!videoUrl ? (
            <label
              className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-700 m-8 rounded-xl cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all"
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
            >
              <input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleFileInput(e.target.files[0])}
              />
              <Upload className="w-16 h-16 text-slate-600 mb-4" />
              <p className="text-slate-400 text-lg font-medium">{t.dropVideo}</p>
              <p className="text-slate-600 text-sm mt-2">MP4 · MOV · AVI · WebM</p>
            </label>
          ) : (
            <>
              {/* Canvas preview (visible) */}
              <canvas
                ref={canvasRef}
                className="w-full h-full object-contain"
                style={{ background: '#000' }}
              />

              {/* Hidden video element for playback */}
              <video
                ref={videoRef}
                src={videoUrl}
                className="hidden"
                onLoadedMetadata={handleVideoLoaded}
                preload="auto"
              />
              {/* Hidden scan canvas */}
              <canvas ref={scanCanvasRef} className="hidden" />

              {/* Playback controls overlay */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-full px-4 py-2 flex items-center gap-4 shadow-xl">
                <span className="text-xs text-slate-400 font-mono">{formatTime(currentTime)}</span>
                <div className="w-48 h-1.5 bg-slate-700 rounded-full overflow-hidden cursor-pointer"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = (e.clientX - rect.left) / rect.width;
                    if (videoRef.current) videoRef.current.currentTime = pct * videoDuration;
                    setCurrentTime(pct * videoDuration);
                  }}>
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(currentTime / videoDuration) * 100}%` }} />
                </div>
                <span className="text-xs text-slate-500 font-mono">{formatTime(videoDuration)}</span>
                {isRecording ? (
                  <button onClick={stopExport} className="flex items-center gap-2 px-3 py-1 bg-red-500 text-white rounded-full text-xs font-bold animate-pulse">
                    <Square className="w-3 h-3" /> STOP
                  </button>
                ) : isPlaying ? (
                  <button onClick={stopPreview} className="w-8 h-8 flex items-center justify-center bg-slate-700 rounded-full hover:bg-slate-600 transition-colors">
                    <Pause className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={startPreview} className="w-8 h-8 flex items-center justify-center bg-emerald-500 rounded-full hover:bg-emerald-400 transition-colors">
                    <Play className="w-4 h-4" />
                  </button>
                )}
              </div>

              {isRecording && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-900/90 backdrop-blur border border-red-700 rounded-full px-4 py-2 flex items-center gap-3 shadow-xl">
                  <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
                  <span className="text-sm text-red-300 font-bold">{t.recording}</span>
                  <span className="text-sm text-red-200 font-mono">{recordProgress}%</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* RIGHT: Control panel */}
        <div className="w-[400px] flex flex-col bg-[#111] border-l border-slate-800 shrink-0">
          {/* Step tabs */}
          <div className="flex border-b border-slate-800">
            {(['import', 'scan', 'review', 'export'] as const).map((s, i) => (
              <button
                key={s}
                onClick={() => videoUrl && setStep(s)}
                className={cn(
                  "flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2",
                  step === s ? "border-emerald-500 text-emerald-400 bg-emerald-500/5" : "border-transparent text-slate-500 hover:text-slate-300"
                )}
              >
                {i + 1}. {t[s as keyof typeof t] as string}
              </button>
            ))}
          </div>

          <ScrollArea className="flex-1 p-4">
            {/* IMPORT step */}
            {step === 'import' && (
              <div className="space-y-4">
                {videoFile ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Film className="w-8 h-8 text-emerald-400 shrink-0 mt-0.5" />
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

                {videoUrl && (
                  <label className="block">
                    <div className="flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg cursor-pointer text-sm text-slate-300 transition-colors">
                      <Upload className="w-4 h-4" />
                      重新导入视频
                    </div>
                    <input type="file" accept="video/*" className="hidden" onChange={e => e.target.files?.[0] && handleFileInput(e.target.files[0])} />
                  </label>
                )}

                {videoUrl && (
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                    onClick={() => setStep('scan')}
                  >
                    进入扫描步骤 <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
              </div>
            )}

            {/* SCAN step */}
            {step === 'scan' && (
              <div className="space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-sm text-slate-400 leading-relaxed">
                  <div className="flex items-start gap-2">
                    <Scan className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <p>{t.scanDesc}</p>
                  </div>
                </div>

                {isScanning ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
                      <span className="text-sm text-slate-300">{t.scanning}</span>
                      <span className="ml-auto text-sm font-mono text-emerald-400">{scanProgress}%</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${scanProgress}%` }} />
                    </div>
                    <p className="text-xs text-slate-600">视频较长时扫描需要较多时间，请耐心等待</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                      onClick={scanVideo}
                      disabled={!videoUrl}
                    >
                      <Scan className="w-4 h-4 mr-2" />
                      {t.startScan}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
                      onClick={() => setStep('review')}
                    >
                      跳过扫描，手动设置
                    </Button>
                  </div>
                )}

                {detectedEvents.length > 0 && !isScanning && (
                  <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      已检测到 {detectedEvents.length} {t.found}
                    </div>
                    <Button
                      className="w-full mt-3 bg-emerald-600 hover:bg-emerald-500 text-white"
                      onClick={() => setStep('review')}
                    >
                      查看并确认 <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* REVIEW step */}
            {step === 'review' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    已确认: <span className="text-emerald-400 font-bold">{confirmedCount}</span> / {detectedEvents.length} 个
                  </span>
                  <button
                    onClick={handleAddManualEvent}
                    className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 py-1 px-2 bg-emerald-400/10 rounded"
                  >
                    <Plus className="w-3 h-3" /> {t.addManual}
                  </button>
                </div>

                {detectedEvents.length === 0 ? (
                  <div className="text-center py-8 text-slate-600">
                    <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">{t.noEvents}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detectedEvents.map(evt => {
                      const rarity = RARITIES[evt.detectedRarity as keyof typeof RARITIES] || RARITIES.mythic;
                      return (
                        <div
                          key={evt.id}
                          className={cn(
                            "border rounded-lg p-3 transition-all",
                            evt.confirmed && evt.assignedItem
                              ? "bg-emerald-900/20 border-emerald-700/40"
                              : "bg-slate-900 border-slate-800"
                          )}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: rarity.color }} />
                            <span className="font-mono text-sm text-slate-300">{formatTime(evt.timestamp)}</span>
                            {evt.colorScore > 0 && (
                              <span className="text-[10px] text-slate-600 bg-slate-800 px-1.5 rounded">
                                自动检测
                              </span>
                            )}
                            <button
                              onClick={() => handleDeleteEvent(evt.id)}
                              className="ml-auto p-1 text-slate-600 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>

                          {evt.assignedItem ? (
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-slate-800 rounded overflow-hidden shrink-0">
                                {evt.assignedItem.image && (
                                  <img src={evt.assignedItem.image} alt="" className="w-full h-full object-contain" />
                                )}
                              </div>
                              <span className="text-sm text-slate-200 flex-1 truncate">{evt.assignedItem.name[lang]}</span>
                              <button
                                onClick={() => setAssigningEventId(evt.id)}
                                className="text-[10px] text-slate-500 hover:text-slate-300 px-1.5 py-0.5 bg-slate-800 rounded"
                              >
                                换
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setAssigningEventId(evt.id)}
                              className="w-full text-sm text-slate-500 border border-dashed border-slate-700 rounded py-1.5 hover:border-emerald-500/50 hover:text-emerald-400 transition-all flex items-center justify-center gap-1"
                            >
                              <Package className="w-3 h-3" /> {t.assignItem}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                  onClick={() => {
                    setDetectedEvents(prev => {
                      const updated = prev.map(e => e.assignedItem ? { ...e, confirmed: true } : e);
                      confirmedEventsRef.current = updated.filter(e => e.confirmed && e.assignedItem);
                      return updated;
                    });
                    setStep('export');
                  }}
                  disabled={confirmedCount === 0}
                >
                  进入导出 ({confirmedCount}个弹窗) <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}

            {/* EXPORT step */}
            {step === 'export' && (
              <div className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-slate-400 mb-2 block">{t.overlayScale}: {overlayScale[0].toFixed(1)}x</Label>
                    <Slider value={overlayScale} onValueChange={setOverlayScale} min={0.5} max={2} step={0.1} className="w-full" />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-400 mb-2 block">{t.cardLifetimeLabel}: {cardLifetime[0]}s</Label>
                    <Slider value={cardLifetime} onValueChange={setCardLifetime} min={3} max={20} step={1} className="w-full" />
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-500 space-y-1">
                  <div className="flex justify-between">
                    <span>已配置弹窗</span><span className="text-slate-300">{confirmedCount} 个</span>
                  </div>
                  <div className="flex justify-between">
                    <span>视频分辨率</span><span className="text-slate-300">{videoSize.w}×{videoSize.h}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>输出格式</span><span className="text-slate-300">WebM</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
                    onClick={isPlaying ? stopPreview : startPreview}
                    disabled={isRecording}
                  >
                    {isPlaying ? <><Pause className="w-4 h-4 mr-2" />停止预览</> : <><Play className="w-4 h-4 mr-2" />预览效果</>}
                  </Button>

                  {!exportDone ? (
                    <Button
                      className={cn("w-full text-white", isRecording ? "bg-red-600 hover:bg-red-500" : "bg-emerald-600 hover:bg-emerald-500")}
                      onClick={isRecording ? stopExport : startExport}
                      disabled={isPlaying}
                    >
                      {isRecording ? (
                        <><Square className="w-4 h-4 mr-2" />{t.recording} {recordProgress}%</>
                      ) : (
                        <><Film className="w-4 h-4 mr-2" />{t.startExport}</>
                      )}
                    </Button>
                  ) : (
                    <a
                      href={exportUrl!}
                      download={`loot_overlay_${Date.now()}.webm`}
                      className="flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      {t.downloadVideo}
                    </a>
                  )}
                </div>

                {exportDone && (
                  <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      导出完成！点击上方按钮下载视频
                    </div>
                    <p className="text-xs text-slate-500 mt-1">可直接上传至B站、抖音等平台</p>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Item assignment dialog */}
      <AnimatePresence>
        {assigningEventId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
            onClick={() => setAssigningEventId(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h3 className="font-semibold text-slate-200">{t.selectItem}</h3>
                <button onClick={() => setAssigningEventId(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
              </div>
              <div className="p-3 border-b border-slate-800">
                <input
                  autoFocus
                  type="text"
                  placeholder="搜索物品..."
                  value={itemSearchQuery}
                  onChange={e => setItemSearchQuery(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-emerald-500"
                />
              </div>
              <ScrollArea className="h-72">
                <div className="p-2 grid grid-cols-2 gap-1.5">
                  {filteredItems.map(item => {
                    const rarity = RARITIES[item.rarity as keyof typeof RARITIES] || RARITIES.mythic;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          handleAssignItem(assigningEventId, item);
                          setAssigningEventId(null);
                          setItemSearchQuery('');
                        }}
                        className="flex items-center gap-2 p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-left transition-colors border border-transparent hover:border-emerald-500/30"
                      >
                        <div
                          className="w-1 h-8 rounded-full shrink-0"
                          style={{ backgroundColor: rarity.color }}
                        />
                        {item.image && (
                          <img src={item.image} alt="" className="w-6 h-6 object-contain shrink-0" />
                        )}
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
