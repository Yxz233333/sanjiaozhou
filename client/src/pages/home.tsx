import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { 
  Settings, 
  Play, 
  SquareSquare, 
  Trash2, 
  Monitor,
  RefreshCcw,
  Image as ImageIcon,
  Crosshair,
  Shield,
  Pill,
  FileText,
  Bomb,
  Package,
  Globe,
  GripVertical,
  Clock,
  MoreVertical,
  Maximize2,
  Plus,
  Video
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useItemLibrary } from "@/lib/useItemLibrary";
import { AddItemDialog } from "@/components/AddItemDialog";
import MOCK_ITEMS_DATA from "../data.json";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { 
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent
} from "@/components/ui/context-menu";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- TRANSLATIONS ---
const i18n = {
  zh: {
    title: "三角洲行动 - 出货UI生成器",
    categories: "物品分类",
    "1x1": "1x1",
    "1x2": "1x2",
    "1x4": "1x4",
    "2x1": "2x1",
    "2x2": "2x2",
    "2x3": "2x3",
    "3x2": "3x2",
    "3x3": "3x3",
    "3x4": "3x4",
    "4x2": "4x2",
    "4x3": "4x3",
    "4x4": "4x4",
    "cards": "门禁卡",
    red_card: "红卡",
    gold_card: "金卡",
    purple_card: "紫卡",
    blue_card: "蓝卡",
    selectedItems: "已选出货",
    emptySelected: "暂未选择物品，请从左侧点击添加",
    canvasSettings: "画布设置",
    bgColor: "抠像背景",
    greenScreen: "绿幕 (Green Screen)",
    blackScreen: "黑幕 (Black Screen)",
    animStyle: "动画风格",
    classic: "经典右上角堆叠",
    compact: "紧凑战术",
    animSpeed: "动画速度",
    previewAnim: "预览动画",
    playing: "播放中...",
    clearAll: "清空",
  },
  en: {
    title: "Delta Force - Loot UI Generator",
    categories: "Categories",
    "1x1": "1x1",
    "1x2": "1x2",
    "1x4": "1x4",
    "2x1": "2x1",
    "2x2": "2x2",
    "2x3": "2x3",
    "3x2": "3x2",
    "3x3": "3x3",
    "3x4": "3x4",
    "4x2": "4x2",
    "4x3": "4x3",
    "4x4": "4x4",
    "cards": "Cards",
    red_card: "Red Card",
    gold_card: "Gold Card",
    purple_card: "Purple Card",
    blue_card: "Blue Card",
    selectedItems: "Selected Loot",
    emptySelected: "No items selected, click items on the left to add",
    canvasSettings: "Canvas Settings",
    bgColor: "Chroma Key",
    greenScreen: "Green Screen",
    blackScreen: "Black Screen",
    animStyle: "Animation Style",
    classic: "Classic Top-Right",
    compact: "Compact Tactical",
    animSpeed: "Animation Speed",
    previewAnim: "Preview Animation",
    playing: "Playing...",
    clearAll: "Clear All",
  }
};

const RARITIES: Record<string, { en: string; zh: string; color: string; prismatic?: boolean }> = {
  common:    { en: "Mythic",     zh: "神话", color: "#ef4444" },
  uncommon:  { en: "Mythic",     zh: "神话", color: "#ef4444" },
  rare:      { en: "Rare",       zh: "稀有", color: "#3b82f6" },
  epic:      { en: "Epic",       zh: "史诗", color: "#8b5cf6" },
  legendary: { en: "Legendary",  zh: "传说", color: "#f59e0b" },
  mythic:    { en: "Mythic",     zh: "神话", color: "#ef4444" },
  prismatic: { en: "Prismatic",  zh: "棱彩", color: "#a855f7", prismatic: true },
  junk:      { en: "Junk",       zh: "劣质", color: "#9ca3af" },
  red_card:    { en: "Red Card",    zh: "红卡", color: "#ef4444" },
  gold_card:   { en: "Gold Card",   zh: "金卡", color: "#f59e0b" },
  purple_card: { en: "Purple Card", zh: "紫卡", color: "#8b5cf6" },
  blue_card:   { en: "Blue Card",   zh: "蓝卡", color: "#3b82f6" },
};

const CATEGORIES = [
  { id: "1x1", icon: SquareSquare },
  { id: "1x2", icon: SquareSquare },
  { id: "1x4", icon: SquareSquare },
  { id: "2x1", icon: SquareSquare },
  { id: "2x2", icon: SquareSquare },
  { id: "2x3", icon: SquareSquare },
  { id: "3x2", icon: SquareSquare },
  { id: "3x3", icon: SquareSquare },
  { id: "3x4", icon: SquareSquare },
  { id: "4x2", icon: SquareSquare },
  { id: "4x3", icon: SquareSquare },
  { id: "4x4", icon: SquareSquare },
  { id: "cards", icon: FileText, subcategories: ["red_card", "gold_card", "purple_card", "blue_card"] },
];

const MOCK_ITEMS: { id: string, category: string, subcategory?: string, rarity: string, name: {zh: string, en: string}, image?: string }[] = MOCK_ITEMS_DATA;

type ItemType = typeof MOCK_ITEMS[0];
type SelectedItem = ItemType & { 
  uid: string, 
  fixedTime?: number,
  customScale?: number,
  customDuration?: number,
  isTextOnly?: boolean,
  textContent?: string
};

// --- SORTABLE ITEM COMPONENT ---
function SortableItem({ 
  item, 
  lang, 
  onRemove, 
  onTimeChange,
  onScaleChange,
  onDurationChange
}: { 
  item: SelectedItem, 
  lang: "zh" | "en", 
  onRemove: (uid: string) => void,
  onTimeChange: (uid: string, field: 'min' | 'sec' | 'ms', time: string) => void,
  onScaleChange: (uid: string, scale: number) => void,
  onDurationChange: (uid: string, duration: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.uid });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  // We use standard color for text-only, or the rarity color if it exists
  const rarityConfig = item.isTextOnly ? RARITIES.mythic : (RARITIES[item.rarity] ?? RARITIES.mythic);

  const currentTime = item.fixedTime || 0;
  const currentMin = item.fixedTime !== undefined ? Math.floor(currentTime / 60000) : "";
  const currentSec = item.fixedTime !== undefined ? Math.floor((currentTime % 60000) / 1000) : "";
  const currentMs = item.fixedTime !== undefined ? currentTime % 1000 : "";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          className={cn(
            "bg-slate-900 border rounded p-2 flex items-center gap-3 group relative overflow-hidden",
            isDragging ? "border-emerald-500 shadow-lg shadow-emerald-500/20" : "border-slate-800"
          )}
        >
          <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: rarityConfig.color }} />
          
          {/* Drag Handle */}
          <div 
            {...attributes} 
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 text-slate-600 hover:text-slate-300 ml-1"
          >
            <GripVertical className="w-4 h-4" />
          </div>

          <div className="w-8 h-8 bg-slate-950 flex items-center justify-center rounded border border-slate-800 overflow-hidden shrink-0">
            {item.isTextOnly ? (
              <FileText className="w-4 h-4 text-slate-400" />
            ) : item.image ? (
              <img src={item.image} alt="" className="w-6 h-6 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
            ) : null}
            {!item.isTextOnly && <ImageIcon className={cn("w-4 h-4 text-slate-500", item.image ? "hidden" : "block")} />}
          </div>
          
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-slate-200 truncate">
              {item.isTextOnly ? item.textContent : item.name[lang]}
            </h4>
            <p className="text-[10px] text-slate-500 font-display uppercase tracking-wider flex items-center gap-2">
              {item.isTextOnly ? "TEXT ALERT" : rarityConfig[lang]}
              {item.customScale && item.customScale !== 1 && (
                 <span className="text-emerald-500 bg-emerald-500/10 px-1 rounded">x{item.customScale}</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded border border-slate-800 group-hover:border-slate-700 transition-colors">
              <Clock className="w-3 h-3 text-slate-500" />
              <div className="flex items-center gap-0.5 text-xs text-slate-400">
                <input 
                  type="number"
                  placeholder="00"
                  value={currentMin}
                  onChange={(e) => onTimeChange(item.uid, 'min', e.target.value)}
                  className="w-6 bg-transparent text-slate-300 outline-none placeholder:text-slate-700 text-right hide-arrows"
                  min="0"
                />
                <span>:</span>
                <input 
                  type="number"
                  placeholder="00"
                  value={currentSec}
                  onChange={(e) => onTimeChange(item.uid, 'sec', e.target.value)}
                  className="w-6 bg-transparent text-slate-300 outline-none placeholder:text-slate-700 text-center hide-arrows"
                  min="0"
                  max="59"
                />
                <span>.</span>
                <input 
                  type="number"
                  placeholder="000"
                  value={currentMs}
                  onChange={(e) => onTimeChange(item.uid, 'ms', e.target.value)}
                  className="w-8 bg-transparent text-slate-300 outline-none placeholder:text-slate-700 text-left hide-arrows"
                  min="0"
                  max="999"
                />
              </div>
            </div>
            
            <button 
              onClick={() => onRemove(item.uid)} 
              className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48 bg-slate-900 border-slate-800 text-slate-200">
        <ContextMenuSub>
          <ContextMenuSubTrigger className="focus:bg-emerald-500/20 focus:text-emerald-400 text-sm">
            单独放大倍率
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-32 bg-slate-900 border-slate-800 text-slate-200">
            {[1, 1.5, 2, 2.5, 3].map((scale) => (
              <ContextMenuItem 
                key={scale}
                onClick={() => onScaleChange(item.uid, scale)}
                className="focus:bg-emerald-500/20 focus:text-emerald-400 cursor-pointer text-sm"
              >
                {scale}x {item.customScale === scale && " (当前)"}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        
        <ContextMenuSub>
          <ContextMenuSubTrigger className="focus:bg-emerald-500/20 focus:text-emerald-400 text-sm">
            单独停留时间
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-36 bg-slate-900 border-slate-800 text-slate-200">
            <ContextMenuItem 
              onClick={() => onDurationChange(item.uid, undefined)}
              className="focus:bg-emerald-500/20 focus:text-emerald-400 cursor-pointer text-sm"
            >
              默认设置 {item.customDuration === undefined && " (当前)"}
            </ContextMenuItem>
            <ContextMenuSeparator className="bg-slate-800" />
            {[3000, 5000, 8000, 10000, 15000, 20000].map((duration) => (
              <ContextMenuItem 
                key={duration}
                onClick={() => onDurationChange(item.uid, duration)}
                className="focus:bg-emerald-500/20 focus:text-emerald-400 cursor-pointer text-sm"
              >
                {duration / 1000}秒 {item.customDuration === duration && " (当前)"}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export default function Home() {
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const t = i18n[lang];

  // Settings
  const [bgColor, setBgColor] = useState("#00FF00"); 
  const [layoutStyle, setLayoutStyle] = useState("classic");
  const [animDelay, setAnimDelay] = useState([2000]); // 物品之间滚动间隔时间 (ms)
  const [pauseBeforeExpand, setPauseBeforeExpand] = useState([500]); // 到中线后停留多久放大 (ms)
  const [expandDuration, setExpandDuration] = useState([300]); // 放大缩小的动画持续时间 (ms)
  const [pauseAfterExpand, setPauseAfterExpand] = useState([1000]); // 恢复后停留多久继续滚动 (ms)
  const [cardScale, setCardScale] = useState([1]); // 物品大小缩放
  const [expandScale, setExpandScale] = useState([1.5]); // 放大时的倍率
  const [maxStackedItems, setMaxStackedItems] = useState([3]); // 最大同屏堆叠数量
  const [itemLifetime, setItemLifespan] = useState([8000]); // 物品总存活时间
  
  // Workspace State
  const [activeCategory, setActiveCategory] = useState("1x1");
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const [selectedList, setSelectedList] = useState<SelectedItem[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [animatingItems, setAnimatingItems] = useState<SelectedItem[]>([]);

  // ── Item library (default + custom, deletable) ──
  const { allItems, hasDeletedDefaults, addCustomItem, deleteItem, restoreDefaults } = useItemLibrary(MOCK_ITEMS);
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Derived
  const filteredItems = allItems.filter(item => {
    if (item.category !== activeCategory) return false;
    if (activeCategory === "cards" && activeSubcategory && item.subcategory !== activeSubcategory) return false;
    return true;
  });

  const activeCategoryData = CATEGORIES.find(c => c.id === activeCategory);

  const handleAddItem = (item: ItemType) => {
    setSelectedList(prev => [...prev, { ...item, uid: Math.random().toString(36).substr(2, 9) }]);
  };

  const handleRemoveItem = (uid: string) => {
    setSelectedList(prev => prev.filter(item => item.uid !== uid));
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setSelectedList((items) => {
        const oldIndex = items.findIndex((item) => item.uid === active.id);
        const newIndex = items.findIndex((item) => item.uid === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleTimeChange = (uid: string, field: 'min' | 'sec' | 'ms', value: string) => {
    let numValue = parseInt(value, 10);
    if (isNaN(numValue)) numValue = 0;
    
    setSelectedList(prev => prev.map(item => {
      if (item.uid !== uid) return item;
      
      const currentTime = item.fixedTime || 0;
      const currentMin = Math.floor(currentTime / 60000);
      const currentSec = Math.floor((currentTime % 60000) / 1000);
      const currentMs = currentTime % 1000;
      
      let newTime = 0;
      if (field === 'min') newTime = (numValue * 60000) + (currentSec * 1000) + currentMs;
      if (field === 'sec') newTime = (currentMin * 60000) + (numValue * 1000) + currentMs;
      if (field === 'ms') newTime = (currentMin * 60000) + (currentSec * 1000) + numValue;
      
      // If all fields are 0 and they cleared the input, maybe we want to remove the fixedTime
      // But keeping it as 0 is also fine if they explicitly set it. We'll set to undefined if it's 0 to keep it clean.
      return { ...item, fixedTime: newTime === 0 && value === "" ? undefined : newTime };
    }));
  };

  const handleScaleChange = (uid: string, scale: number) => {
    setSelectedList(prev => prev.map(item => 
      item.uid === uid ? { ...item, customScale: scale } : item
    ));
  };

  const handleDurationChange = (uid: string, duration: number | undefined) => {
    setSelectedList(prev => prev.map(item => 
      item.uid === uid ? { ...item, customDuration: duration } : item
    ));
  };

  const handleAddTextAlert = () => {
    const text = prompt("请输入文字内容 (例如: 关注主播不迷路)");
    if (!text) return;
    
    const newTextItem: SelectedItem = {
      id: `text_${Date.now()}`,
      uid: Math.random().toString(36).substr(2, 9),
      category: "text",
      rarity: "mythic", // Use mythic red for text
      name: { zh: text, en: text },
      isTextOnly: true,
      textContent: text
    };
    
    setSelectedList(prev => [...prev, newTextItem]);
  };

  const handlePlay = () => {
    if (selectedList.length === 0 || isPlaying) return;
    
    setIsPlaying(true);
    setAnimatingItems([]);
    
    // Split items into fixed-time and auto-queue
    const fixedTimeItems = selectedList.filter(item => item.fixedTime !== undefined && !isNaN(item.fixedTime));
    const autoQueueItems = selectedList.filter(item => item.fixedTime === undefined || isNaN(item.fixedTime));
    
    // 1. Schedule Fixed Time items
    fixedTimeItems.forEach(item => {
      setTimeout(() => {
        setAnimatingItems(prev => {
          const newItem = { ...item, uid: Math.random().toString() };
          const updated = [...prev, newItem];
          if (updated.length > maxStackedItems[0]) {
             return updated.slice(1);
          }
          return updated;
        });
      }, item.fixedTime);
    });

    // 2. Schedule Auto Queue items (Sequential)
    if (autoQueueItems.length > 0) {
      let currentSpawnIndex = 0;
      
      const spawnInterval = setInterval(() => {
        if (currentSpawnIndex >= autoQueueItems.length) {
          clearInterval(spawnInterval);
          return;
        }

        const itemToSpawn = autoQueueItems[currentSpawnIndex];
        const newItem = { ...itemToSpawn, uid: Math.random().toString() };
        
        setAnimatingItems(prev => {
          const updated = [...prev, newItem];
          if (updated.length > maxStackedItems[0]) {
             return updated.slice(1);
          }
          return updated;
        });
        
        currentSpawnIndex++;
      }, animDelay[0]);
    }
  };

  const handleItemComplete = (uid: string) => {
    setAnimatingItems(prev => {
      const newItems = prev.filter(i => i.uid !== uid);
      if (newItems.length === 0) {
        setIsPlaying(false);
      }
      return newItems;
    });
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#0a0a0a] text-slate-200 overflow-hidden font-sans">
      
      {/* HEADER */}
      <header className="h-14 border-b border-slate-800 bg-[#111] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
            <SquareSquare className="w-5 h-5" />
          </div>
          <h1 className="font-display font-bold text-lg uppercase tracking-wider text-slate-100">
            {t.title}
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          <Link href="/video">
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-500 text-white border-0 gap-2"
            >
              <Video className="w-4 h-4" />
              {lang === 'zh' ? '视频导出' : 'Video Export'}
            </Button>
          </Link>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            className="bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <Globe className="w-4 h-4 mr-2" />
            {lang === 'zh' ? 'English' : '中文'}
          </Button>
        </div>
      </header>

      {/* MAIN WORKSPACE */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* LEFT PANE: Large Library Workspace */}
        <div className="flex-1 flex flex-col border-r border-slate-800 bg-[#0d0d0d] relative">
          
          {/* Categories Nav */}
          <div className="p-4 border-b border-slate-800/60 bg-[#111]/50 backdrop-blur shrink-0 flex flex-col gap-3">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
              {CATEGORIES.map(cat => {
                const Icon = cat.icon;
                const isActive = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setActiveCategory(cat.id);
                      setActiveSubcategory(cat.subcategories ? cat.subcategories[0] : null);
                    }}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-md transition-all whitespace-nowrap border font-medium text-sm font-display tracking-wider",
                      isActive 
                        ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" 
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {t[cat.id as keyof typeof t] || cat.id}
                  </button>
                )
              })}
            </div>
            
            {/* Subcategories (if any) */}
            {activeCategoryData?.subcategories && (
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                {activeCategoryData.subcategories.map(subcat => {
                  const isActive = activeSubcategory === subcat;
                  return (
                    <button
                      key={subcat}
                      onClick={() => setActiveSubcategory(subcat)}
                      className={cn(
                        "px-3 py-1.5 rounded transition-all whitespace-nowrap border text-xs font-display tracking-wider",
                        isActive 
                          ? "bg-emerald-500 text-white border-emerald-500" 
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                      )}
                    >
                      {t[subcat as keyof typeof t] || subcat}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Custom item controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddDialog(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-600/15 border border-violet-500/30 text-violet-400 hover:bg-violet-600/25 hover:border-violet-500/50 transition-all text-xs font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                {lang === "zh" ? "添加物品" : "Add Item"}
              </button>
              {hasDeletedDefaults && (
                <button
                  onClick={restoreDefaults}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all text-xs font-medium"
                >
                  <RefreshCcw className="w-3 h-3" />
                  {lang === "zh" ? "恢复默认" : "Restore Defaults"}
                </button>
              )}
            </div>
          </div>

          {/* Items Grid */}
          <ScrollArea className="flex-1 p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              <AnimatePresence mode="popLayout">
                {filteredItems.map((item) => {
                  const rarityConfig = RARITIES[item.rarity] ?? RARITIES.mythic;
                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.2 }}
                      key={item.id}
                      className="group relative cursor-pointer flex flex-col bg-slate-900 border border-slate-800 rounded-md overflow-hidden hover:border-slate-600 transition-all hover:shadow-lg"
                    >
                      {/* Rarity top border */}
                      <div className="h-1 w-full absolute top-0 left-0 z-10" style={{ backgroundColor: rarityConfig.color }} />

                      {/* Delete button (top-right, shows on hover) */}
                      <button
                        onClick={e => { e.stopPropagation(); deleteItem(item.id); }}
                        className="absolute top-1.5 right-1.5 z-30 w-6 h-6 rounded-md bg-slate-900/80 border border-slate-700/50 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-400 text-slate-500 transition-all"
                        title={lang === "zh" ? "删除" : "Delete"}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      
                      {/* Image Preview (Mocked with Icon or Real Image) — click = add item */}
                      <div onClick={() => handleAddItem(item)} className="aspect-square bg-slate-950 flex items-center justify-center relative overflow-hidden group-hover:bg-slate-900 transition-colors active:scale-95">
                         <div className="absolute inset-0 opacity-10" style={{ backgroundColor: rarityConfig.color }} />
                         
                         {item.image ? (
                           <img src={item.image} alt={item.name[lang]} className="w-16 h-16 object-contain z-10 drop-shadow-md" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
                         ) : null}
                         
                         <div className={cn("z-10", item.image ? "hidden" : "block")}>
                           {CATEGORIES.find(c => c.id === item.category)?.icon && (() => {
                              const Icon = CATEGORIES.find(c => c.id === item.category)!.icon;
                              return <Icon className="w-10 h-10 text-white/50 group-hover:text-white/80 transition-colors" />;
                           })()}
                         </div>
                         
                         {/* Hover overlay hint */}
                         <div className="absolute inset-0 bg-emerald-500/10 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-[1px] z-20">
                            <span className="bg-emerald-500 text-white text-[10px] uppercase font-bold px-2 py-1 rounded">Add</span>
                         </div>
                      </div>

                      {/* Item Details */}
                      <div onClick={() => handleAddItem(item)} className="p-3 border-t border-slate-800 bg-[#111]">
                        <p className="text-xs text-slate-500 font-display uppercase tracking-widest mb-1 truncate">
                          {rarityConfig[lang]}
                        </p>
                        <h3 className="text-sm font-semibold text-slate-200 truncate" title={item.name[lang]}>
                          {item.name[lang]}
                        </h3>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </ScrollArea>
        </div>

        {/* RIGHT PANE: Canvas, Settings & Selected List */}
        <div className="w-[450px] flex flex-col bg-[#111] shrink-0 border-l border-slate-800 z-20">
          
          {/* PREVIEW CANVAS */}
          <div className="h-[300px] bg-black relative shrink-0 overflow-hidden" style={{ backgroundColor: bgColor }}>
             {/* Toolbar */}
             <div className="absolute top-2 left-2 z-20 bg-slate-900/80 backdrop-blur border border-slate-800 rounded flex p-1 shadow-xl">
               <div className="px-2 py-1 text-[10px] font-medium text-slate-400 flex items-center gap-1.5 border-r border-slate-700">
                 <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                 Preview Area
               </div>
               <button 
                 className="px-2 py-1 text-[10px] font-medium text-emerald-400 hover:bg-slate-800 transition-colors flex items-center gap-1"
                 title="使用OBS等录屏软件直接录制此区域，或点击此按钮全屏预览后录制"
                 onClick={() => {
                    const el = document.getElementById('preview-canvas');
                    if (el) el.requestFullscreen();
                 }}
               >
                 全屏录制 (Export)
               </button>
             </div>

             {/* Loot Overlay Container - Top Right Stacking */}
             <div 
               id="preview-canvas"
               className="absolute inset-0 overflow-hidden"
               style={{ backgroundColor: bgColor }}
             >
               <div className="absolute top-8 right-8 flex flex-col gap-3 w-[280px]">
                 <AnimatePresence mode="sync">
                   {animatingItems.map((item, idx) => (
                     <StackedLootCard 
                       key={item.uid} 
                       item={item} 
                       lang={lang} 
                       config={{
                         pauseBeforeExpand: pauseBeforeExpand[0],
                         expandDuration: expandDuration[0],
                         pauseAfterExpand: pauseAfterExpand[0],
                         cardScale: cardScale[0],
                         expandScale: expandScale[0],
                         lifetime: itemLifetime[0]
                       }}
                       onComplete={handleItemComplete}
                     />
                   ))}
                 </AnimatePresence>
               </div>
             </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            {/* SETTINGS BAR */}
            <div className="p-4 border-b border-slate-800 space-y-4 shrink-0 bg-[#0d0d0d]">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label className="text-[10px] text-slate-400 mb-2 block">{t.bgColor}</Label>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setBgColor("#00FF00")}
                      className={cn("h-7 flex-1 rounded border transition-all text-xs font-medium text-black", bgColor === "#00FF00" ? 'border-white' : 'border-transparent')}
                      style={{ backgroundColor: "#00FF00" }}
                    >
                      Green
                    </button>
                    <button 
                      onClick={() => setBgColor("#000000")}
                      className={cn("h-7 flex-1 rounded border transition-all text-xs font-medium text-white", bgColor === "#000000" ? 'border-emerald-500' : 'border-slate-700')}
                      style={{ backgroundColor: "#000000" }}
                    >
                      Black
                    </button>
                  </div>
                </div>
              </div>

              {/* Animation Control Sliders */}
              <div className="flex items-center justify-between pt-3 pb-1">
                <Label className="text-[10px] text-slate-500 uppercase tracking-wider">动画参数</Label>
                <button
                  onClick={() => {
                    setAnimDelay([2000]);
                    setPauseBeforeExpand([500]);
                    setExpandDuration([300]);
                    setPauseAfterExpand([1000]);
                    setCardScale([1]);
                    setExpandScale([1.5]);
                    setMaxStackedItems([3]);
                    setItemLifespan([8000]);
                  }}
                  className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-violet-400 transition-colors px-2 py-1 rounded hover:bg-violet-400/10"
                >
                  <RefreshCcw className="w-2.5 h-2.5" />恢复默认
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-[10px] text-slate-400">出货间隔时间</Label>
                    <span className="text-[10px] text-emerald-400">{animDelay[0]}ms</span>
                  </div>
                  <Slider value={animDelay} onValueChange={setAnimDelay} max={5000} min={500} step={100} className="py-1" />
                </div>
                
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-[10px] text-slate-400">停留多久放大</Label>
                    <span className="text-[10px] text-emerald-400">{pauseBeforeExpand[0]}ms</span>
                  </div>
                  <Slider value={pauseBeforeExpand} onValueChange={setPauseBeforeExpand} max={3000} min={100} step={100} className="py-1" />
                </div>
                
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-[10px] text-slate-400">放大动画时长</Label>
                    <span className="text-[10px] text-emerald-400">{expandDuration[0]}ms</span>
                  </div>
                  <Slider value={expandDuration} onValueChange={setExpandDuration} max={2000} min={100} step={100} className="py-1" />
                </div>
                
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-[10px] text-slate-400">恢复后停留多久滚动</Label>
                    <span className="text-[10px] text-emerald-400">{pauseAfterExpand[0]}ms</span>
                  </div>
                  <Slider value={pauseAfterExpand} onValueChange={setPauseAfterExpand} max={3000} min={100} step={100} className="py-1" />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-[10px] text-slate-400">卡片整体大小</Label>
                    <span className="text-[10px] text-emerald-400">{cardScale[0]}x</span>
                  </div>
                  <Slider value={cardScale} onValueChange={setCardScale} max={2} min={0.5} step={0.1} className="py-1" />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-[10px] text-slate-400">搜索放大倍率</Label>
                    <span className="text-[10px] text-emerald-400">{expandScale[0]}x</span>
                  </div>
                  <Slider value={expandScale} onValueChange={setExpandScale} max={3} min={1.1} step={0.1} className="py-1" />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-[10px] text-slate-400">同屏最大数量</Label>
                    <span className="text-[10px] text-emerald-400">{maxStackedItems[0]}个</span>
                  </div>
                  <Slider value={maxStackedItems} onValueChange={setMaxStackedItems} max={10} min={1} step={1} className="py-1" />
                </div>
                
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-[10px] text-slate-400">消失时间</Label>
                    <span className="text-[10px] text-emerald-400">{itemLifetime[0]}ms</span>
                  </div>
                  <Slider value={itemLifetime} onValueChange={setItemLifespan} max={15000} min={1000} step={500} className="py-1" />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white"
                  onClick={handlePlay}
                  disabled={isPlaying || selectedList.length === 0}
                >
                  {isPlaying ? <RefreshCcw className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2 fill-current" />}
                  {isPlaying ? t.playing : t.previewAnim}
                </Button>
              </div>
            </div>

            {/* SELECTED ITEMS LIST */}
            <div className="flex-1 flex flex-col min-h-0 bg-[#111]">
              <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-[#151515]">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-slate-500" /> 
                  {t.selectedItems} ({selectedList.length})
                </h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleAddTextAlert}
                    className="h-7 w-7 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10 rounded-full"
                    title="添加文字弹窗"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                  {selectedList.length > 0 && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setSelectedList([])}
                      className="h-7 text-xs text-slate-400 hover:text-red-400"
                    >
                      {t.clearAll}
                    </Button>
                  )}
                </div>
              </div>
              
              <ScrollArea className="flex-1 p-3">
                {selectedList.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-sm text-slate-600 border border-dashed border-slate-800 rounded-md">
                    {t.emptySelected}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <DndContext 
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext 
                        items={selectedList.map(i => i.uid)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {selectedList.map((item) => (
                            <SortableItem 
                              key={item.uid}
                              item={item}
                              lang={lang}
                              onRemove={handleRemoveItem}
                              onTimeChange={handleTimeChange}
                              onScaleChange={handleScaleChange}
                              onDurationChange={handleDurationChange}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </div>
      </div>

      {/* Add Item Dialog */}
      <AnimatePresence>
        {showAddDialog && (
          <AddItemDialog
            lang={lang}
            defaultCategory={activeCategory}
            onAdd={addCustomItem}
            onClose={() => setShowAddDialog(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Separate component for the animated loot card
// SVG crack paths for junk rarity overlay — viewBox "0 0 300 80", impact at (180,40)
const JUNK_SVG_CRACKS = [
  "M180,40 L120,14 L75,4",
  "M120,14 L102,30",
  "M180,40 L232,10 L292,2",
  "M232,10 L246,26",
  "M180,40 L255,42 L300,40",
  "M180,40 L234,70 L293,78",
  "M180,40 L175,76",
  "M180,40 L106,68 L52,79",
  "M180,40 L88,40 L22,38",
  "M88,40 L80,57",
  "M180,40 L158,16",
];

function StackedLootCard({ 
  item, 
  lang,
  config,
  onComplete
}: { 
  item: SelectedItem, 
  lang: "zh" | "en",
  config: {
    pauseBeforeExpand: number,
    expandDuration: number,
    pauseAfterExpand: number,
    cardScale: number,
    expandScale: number,
    lifetime: number
  },
  onComplete: (uid: string) => void
}) {
  const rarityConfig = item.isTextOnly ? RARITIES.mythic : (RARITIES[item.rarity] ?? RARITIES.mythic);
  
  // Create a placeholder based on category
  const placeholderType = item.category === "cards" ? "card_placeholder.png" : `placeholder_${item.category}.png`;
  const placeholderImage = `/images/items/${placeholderType}`;

  const controls = useAnimation();
  
  const T_total_lifespan = (item.customDuration ? item.customDuration : config.lifetime) / 1000;
  
  // 动画时间分配
  const T_start_to_center = 0.5; // 从右侧滑入的时间
  const T_pause_before = config.pauseBeforeExpand / 1000;
  const T_expand = config.expandDuration / 1000;
  const T_pause_after = config.pauseAfterExpand / 1000;
  // 剩余存活时间
  const T_wait_before_exit = Math.max(0.1, T_total_lifespan - T_start_to_center - T_pause_before - T_expand - T_pause_after - 0.5); 
  const T_exit_top = 0.5; // 向上滑出的时间

  const baseScale = config.cardScale * (item.customScale || 1);
  const expandedScale = baseScale * config.expandScale;

  useEffect(() => {
    let isMounted = true;
    
    const sequence = async () => {
      // 1. 从右侧滑入原位
      await controls.start({
        x: 0,
        opacity: 1,
        transition: { duration: T_start_to_center, ease: "easeOut" }
      });
      
      if (!isMounted) return;
      
      // 2. 停顿
      await new Promise(resolve => setTimeout(resolve, config.pauseBeforeExpand));
      if (!isMounted) return;
      
      // 3. 放大 (此时让它向左突出一点以显示重点)
      await controls.start({
        scale: expandedScale,
        x: -20 * (item.customScale || 1), // 放大时稍微往左靠
        transition: { duration: T_expand / 2, ease: "easeOut" }
      });
      if (!isMounted) return;
      
      // 4. 缩小回原位
      await controls.start({
        scale: baseScale,
        x: 0,
        transition: { duration: T_expand / 2, ease: "easeIn" }
      });
      if (!isMounted) return;
      
      // 5. 恢复后停顿
      await new Promise(resolve => setTimeout(resolve, config.pauseAfterExpand));
      if (!isMounted) return;
      
      // 6. 等待剩余寿命
      await new Promise(resolve => setTimeout(resolve, T_wait_before_exit * 1000));
      if (!isMounted) return;
      
      // 7. 向上方滑出屏幕
      await controls.start({
        y: -100, // 向上偏移
        opacity: 0,
        scale: baseScale * 0.8,
        transition: { duration: T_exit_top, ease: "easeIn" }
      });
      
      if (isMounted) {
        onComplete(item.uid);
      }
    };

    sequence();
    
    return () => { isMounted = false; };
  }, []);

  return (
    <motion.div
      layout // 允许列表由于增删元素而自动进行平滑的上下位移排版
      initial={{ x: 100, scale: baseScale, opacity: 0 }}
      animate={controls}
      // 当它被父组件强制移除（如超过上限被顶掉）时执行退场动画：向上方消失
      exit={{ opacity: 0, y: -50, scale: baseScale * 0.8, transition: { duration: 0.3 } }}
      className="relative origin-right w-full"
      style={{ scale: baseScale }}
    >
      <div className="relative overflow-hidden group shadow-2xl bg-slate-900/90 backdrop-blur-sm border border-white/10" style={{ width: '100%' }}>
        {/* Angled cut background typical in tactical UI */}
        <div 
          className="absolute inset-0 bg-gradient-to-r from-black/95 to-black/80"
          style={{
            clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%)"
          }}
        />
        
        {/* Colored accent line */}
        <div 
          className="absolute left-0 top-0 bottom-0 w-1.5 z-20"
          style={{ backgroundColor: rarityConfig.color, boxShadow: `0 0 10px ${rarityConfig.color}` }}
        />

        {/* Junk rarity — animated glass crack overlay */}
        {item.rarity === 'junk' && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-30"
            viewBox="0 0 300 80"
            preserveAspectRatio="none"
            style={{ filter: 'drop-shadow(0px 0px 1.5px rgba(0,0,0,0.9))' }}
          >
            {JUNK_SVG_CRACKS.map((d, i) => (
              <motion.path
                key={i}
                d={d}
                stroke="rgba(210,225,240,0.85)"
                strokeWidth="1.4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{
                  pathLength: {
                    delay: T_start_to_center + T_pause_before + i * 0.04,
                    duration: T_expand * 0.8,
                    ease: "easeOut",
                  },
                  opacity: {
                    delay: T_start_to_center + T_pause_before + i * 0.04,
                    duration: 0.05,
                  },
                }}
              />
            ))}
            {/* Impact burst */}
            <motion.circle
              cx="180" cy="40" r="5"
              fill="rgba(220,235,250,0.4)"
              stroke="rgba(210,225,240,0.7)"
              strokeWidth="1"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: [0, 0.8, 0.4] }}
              transition={{
                delay: T_start_to_center + T_pause_before,
                duration: T_expand * 0.5,
                ease: "easeOut",
              }}
            />
          </svg>
        )}

        <div className="relative p-2 pl-4 flex items-center gap-4">
          {item.isTextOnly ? (
            <div className="w-14 h-14 bg-gradient-to-br from-white/10 to-transparent border border-white/20 flex items-center justify-center shadow-inner relative overflow-hidden shrink-0">
              <div className="absolute inset-0 opacity-20" style={{ backgroundColor: rarityConfig.color }} />
              <FileText className="w-6 h-6 text-white/80 z-10" />
            </div>
          ) : (
            <div className="w-14 h-14 bg-gradient-to-br from-white/10 to-transparent border border-white/20 flex items-center justify-center shadow-inner relative overflow-hidden shrink-0">
              <div className="absolute inset-0 opacity-20" style={{ backgroundColor: rarityConfig.color }} />
              
              <motion.div 
                animate={{ 
                  opacity: [1, 1, 0, 0], // Hide at exact middle of expand phase
                  scale: [1, 1, 0.5, 0.5]
                }}
                transition={{ 
                  times: [0, (T_start_to_center + T_pause_before) / T_total_lifespan, (T_start_to_center + T_pause_before + T_expand/2) / T_total_lifespan, 1], 
                  duration: T_total_lifespan
                }}
                className="absolute inset-0 flex items-center justify-center bg-slate-950 z-20"
              >
                <img src={placeholderImage} alt="unsearched" className="w-10 h-10 object-contain opacity-50" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                <span className="text-[8px] text-white/40 absolute bottom-0.5 font-display tracking-widest font-bold">SEARCH</span>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ 
                  opacity: [0, 0, 1, 1], 
                  scale: [0.5, 0.5, 1, 1]
                }}
                transition={{ 
                  times: [0, (T_start_to_center + T_pause_before) / T_total_lifespan, (T_start_to_center + T_pause_before + T_expand/2) / T_total_lifespan, 1], 
                  duration: T_total_lifespan
                }}
                className="absolute inset-0 flex items-center justify-center z-10"
              >
                {item.image ? (
                  <img src={item.image} alt="" className="w-12 h-12 object-contain drop-shadow-lg" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
                ) : null}
                <ImageIcon className={cn("w-6 h-6 text-white/80", item.image ? "hidden" : "block")} />
              </motion.div>
            </div>
          )}

          {/* Info */}
          <div className="flex-1 flex flex-col justify-center pr-4 overflow-hidden relative h-[56px]">
             {/* Info overlay (Searching state) - skip for text only */}
             {!item.isTextOnly && (
               <motion.div
                  animate={{ 
                    opacity: [1, 1, 0, 0], 
                  }}
                  transition={{ 
                    times: [0, (T_start_to_center + T_pause_before) / T_total_lifespan, (T_start_to_center + T_pause_before + T_expand/2) / T_total_lifespan, 1], 
                    duration: T_total_lifespan
                  }}
                  className="absolute inset-0 flex flex-col justify-center bg-transparent z-20"
               >
                  <div className="w-20 h-2 bg-white/10 rounded mb-2 animate-pulse" />
                  <div className="w-28 h-3 bg-white/10 rounded animate-pulse" />
               </motion.div>
             )}

             {/* Real Info */}
             <motion.div 
               initial={{ opacity: 0, x: -10 }}
               animate={{ 
                 opacity: item.isTextOnly ? 1 : [0, 0, 1, 1], 
                 x: item.isTextOnly ? 0 : [-10, -10, 0, 0]
               }}
               transition={{ 
                 times: [0, (T_start_to_center + T_pause_before) / T_total_lifespan, (T_start_to_center + T_pause_before + T_expand/2) / T_total_lifespan, 1], 
                 duration: T_total_lifespan
               }}
               className="flex flex-col justify-center absolute inset-0 z-10"
             >
                {!item.isTextOnly && (
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] uppercase font-bold tracking-widest drop-shadow-md" style={{ color: rarityConfig.color }}>{rarityConfig[lang]}</span>
                  </div>
                )}
                <h3 className="font-display font-bold text-base text-white leading-none tracking-wide drop-shadow-md truncate">
                  {item.isTextOnly ? item.textContent : item.name[lang]}
                </h3>
             </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
