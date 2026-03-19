import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  Globe
} from "lucide-react";
import { Button } from "@/components/ui/button";
import MOCK_ITEMS_DATA from "../data.json";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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

const RARITIES = {
  common: { en: "Common", zh: "普通", color: "#d1d5db" },
  uncommon: { en: "Uncommon", zh: "罕见", color: "#10b981" },
  rare: { en: "Rare", zh: "稀有", color: "#3b82f6" },
  epic: { en: "Epic", zh: "史诗", color: "#8b5cf6" },
  legendary: { en: "Legendary", zh: "传说", color: "#f59e0b" },
  mythic: { en: "Mythic", zh: "神话", color: "#ef4444" },
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
type SelectedItem = ItemType & { uid: string };

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
  
  // Workspace State
  const [activeCategory, setActiveCategory] = useState("1x1");
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const [selectedList, setSelectedList] = useState<SelectedItem[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [animatingItems, setAnimatingItems] = useState<SelectedItem[]>([]);

  // Derived
  const filteredItems = MOCK_ITEMS.filter(item => {
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

  const handlePlay = () => {
    if (selectedList.length === 0 || isPlaying) return;
    
    setIsPlaying(true);
    setAnimatingItems([]);
    
    selectedList.forEach((item, index) => {
      // 这里的触发时间是物品依次出现的时间间隔
      setTimeout(() => {
        setAnimatingItems(prev => [...prev, item]);
      }, index * animDelay[0]);
    });

    // 整个动画总时间估算：最后一个物品出现的时间 + 物品在屏幕上滚动的总时间
    const totalTime = selectedList.length * animDelay[0] + 8000;
    setTimeout(() => {
      setIsPlaying(false);
    }, totalTime);
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
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          className="bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <Globe className="w-4 h-4 mr-2" />
          {lang === 'zh' ? 'English' : '中文'}
        </Button>
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
          </div>

          {/* Items Grid */}
          <ScrollArea className="flex-1 p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              <AnimatePresence mode="popLayout">
                {filteredItems.map((item) => {
                  const rarityConfig = RARITIES[item.rarity as keyof typeof RARITIES];
                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.2 }}
                      key={item.id}
                      onClick={() => handleAddItem(item)}
                      className="group relative cursor-pointer flex flex-col bg-slate-900 border border-slate-800 rounded-md overflow-hidden hover:border-slate-600 transition-all hover:shadow-lg active:scale-95"
                    >
                      {/* Rarity top border */}
                      <div className="h-1 w-full absolute top-0 left-0 z-10" style={{ backgroundColor: rarityConfig.color }} />
                      
                      {/* Image Preview (Mocked with Icon or Real Image) */}
                      <div className="aspect-square bg-slate-950 flex items-center justify-center relative overflow-hidden group-hover:bg-slate-900 transition-colors">
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
                      <div className="p-3 border-t border-slate-800 bg-[#111]">
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
          <div className="h-[253px] bg-black relative shrink-0 overflow-hidden" style={{ backgroundColor: bgColor }}>
             {/* Toolbar */}
             <div className="absolute top-2 left-2 z-20 bg-slate-900/80 backdrop-blur border border-slate-800 rounded flex p-1 shadow-xl">
               <div className="px-2 py-1 text-[10px] font-medium text-slate-400 flex items-center gap-1.5">
                 <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                 Preview Area
               </div>
             </div>

             {/* Loot Overlay Container */}
             <div className="absolute top-10 right-10 flex flex-col gap-2 w-[280px] pointer-events-none">
               <AnimatePresence>
                 {animatingItems.map((item, idx) => (
                   <LootCard 
                     key={item.uid} 
                     item={item} 
                     lang={lang} 
                     config={{
                       pauseBeforeExpand: pauseBeforeExpand[0],
                       expandDuration: expandDuration[0],
                       pauseAfterExpand: pauseAfterExpand[0],
                       cardScale: cardScale[0],
                       expandScale: expandScale[0]
                     }}
                   />
                 ))}
               </AnimatePresence>
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
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-2">
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
              
              <ScrollArea className="flex-1 p-3">
                {selectedList.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-sm text-slate-600 border border-dashed border-slate-800 rounded-md">
                    {t.emptySelected}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <AnimatePresence>
                      {selectedList.map((item, index) => {
                        const rarityConfig = RARITIES[item.rarity as keyof typeof RARITIES];
                        return (
                          <motion.div
                            key={item.uid}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                            className="bg-slate-900 border border-slate-800 rounded p-2 flex items-center gap-3 group relative overflow-hidden"
                          >
                            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: rarityConfig.color }} />
                            
                            <div className="w-8 h-8 bg-slate-950 flex items-center justify-center rounded border border-slate-800 ml-1 overflow-hidden">
                              {item.image ? (
                                <img src={item.image} alt="" className="w-6 h-6 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
                              ) : null}
                              <ImageIcon className={cn("w-4 h-4 text-slate-500", item.image ? "hidden" : "block")} />
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-medium text-slate-200 truncate">{item.name[lang]}</h4>
                              <p className="text-[10px] text-slate-500 font-display uppercase tracking-wider">
                                {rarityConfig[lang]}
                              </p>
                            </div>
                            
                            <button 
                              onClick={() => handleRemoveItem(item.uid)} 
                              className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </motion.div>
                        )
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Separate component for the animated loot card
function LootCard({ 
  item, 
  lang,
  config
}: { 
  item: SelectedItem, 
  lang: "zh" | "en",
  config: {
    pauseBeforeExpand: number,
    expandDuration: number,
    pauseAfterExpand: number,
    cardScale: number,
    expandScale: number
  }
}) {
  const rarityConfig = RARITIES[item.rarity as keyof typeof RARITIES];
  const catIcon = CATEGORIES.find(c => c.id === item.category)?.icon || ImageIcon;
  
  // Create a placeholder based on category
  const placeholderType = item.category === "cards" ? "card_placeholder.png" : `placeholder_${item.category}.png`;
  const placeholderImage = `/images/items/${placeholderType}`; // You'll need to add these images

  return (
    <motion.div
      initial={{ opacity: 0, x: 100, scale: config.cardScale * 0.9 }}
      animate={[
        // Phase 1: Slide in and wait
        { opacity: 1, x: 0, scale: config.cardScale, transition: { type: "spring", stiffness: 300, damping: 24 } },
        // Phase 2: Expand to center (simulated by scale up)
        { scale: config.cardScale * config.expandScale, transition: { delay: config.pauseBeforeExpand / 1000, duration: config.expandDuration / 1000 } },
        // Phase 3: Shrink back and continue
        { scale: config.cardScale, transition: { delay: (config.pauseBeforeExpand + config.expandDuration + config.pauseAfterExpand) / 1000, duration: config.expandDuration / 1000 } }
      ]}
      exit={{ opacity: 0, y: -20, scale: config.cardScale * 0.9, transition: { duration: 0.2 } }}
      className="relative overflow-hidden group origin-right mx-auto"
      style={{ width: '280px', transformOrigin: 'center' }}
    >
      {/* Angled cut background typical in tactical UI */}
      <div 
        className="absolute inset-0 bg-gradient-to-r from-black/90 to-black/60 backdrop-blur-sm border border-white/10"
        style={{
          clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)"
        }}
      />
      
      {/* Colored accent line */}
      <motion.div 
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        className="absolute left-0 top-0 bottom-0 w-1 origin-top z-20"
        style={{ backgroundColor: rarityConfig.color, boxShadow: `0 0 8px ${rarityConfig.color}` }}
      />

      <div className="relative p-2 pl-4 flex items-center gap-3">
        {/* Item Icon placeholder or Image */}
        <div className="w-12 h-12 bg-gradient-to-br from-white/10 to-transparent border border-white/20 flex items-center justify-center shadow-inner relative overflow-hidden shrink-0">
          <div className="absolute inset-0 opacity-20" style={{ backgroundColor: rarityConfig.color }} />
          
          <motion.div 
            animate={{ 
              opacity: [1, 1, 0, 0], // Show placeholder -> Hide placeholder
              scale: [1, 1, 0.8, 0.8]
            }}
            transition={{ 
              times: [0, 0.9, 1, 1], 
              duration: (config.pauseBeforeExpand + config.expandDuration) / 1000 
            }}
            className="absolute inset-0 flex items-center justify-center bg-slate-900"
          >
            {/* 搜查前的状态图 */}
            <img src={placeholderImage} alt="unsearched" className="w-10 h-10 object-contain opacity-50" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <span className="text-[7px] text-white/40 absolute bottom-0.5 font-display tracking-widest">SEARCH</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ 
              opacity: [0, 0, 1, 1], // Hide real item -> Show real item
              scale: [0.8, 0.8, 1, 1]
            }}
            transition={{ 
              times: [0, 0.9, 1, 1], 
              duration: (config.pauseBeforeExpand + config.expandDuration) / 1000 
            }}
            className="absolute inset-0 flex items-center justify-center"
          >
            {item.image ? (
              <img src={item.image} alt="" className="w-10 h-10 object-contain z-10 drop-shadow-md" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
            ) : null}
            <ImageIcon className={cn("w-6 h-6 text-white/80 z-10", item.image ? "hidden" : "block")} />
          </motion.div>
        </div>

        {/* Info */}
        <div className="flex-1 flex flex-col justify-center pr-4 overflow-hidden">
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: (config.pauseBeforeExpand + config.expandDuration) / 1000 }}
            className="flex items-center gap-2 mb-0.5"
          >
            <span className="text-[10px] uppercase font-bold tracking-widest drop-shadow-md" style={{ color: rarityConfig.color }}>{rarityConfig[lang]}</span>
          </motion.div>
          <motion.h3 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: (config.pauseBeforeExpand + config.expandDuration) / 1000 }}
            className="font-display font-bold text-lg text-white leading-none tracking-wide drop-shadow-md truncate"
          >
            {item.name[lang]}
          </motion.h3>
        </div>
      </div>
    </motion.div>
  );
}
