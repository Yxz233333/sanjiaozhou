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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// --- TRANSLATIONS ---
const i18n = {
  zh: {
    title: "三角洲行动 - 出货UI生成器",
    categories: "物品分类",
    weapon: "武器",
    armor: "护甲",
    consumable: "消耗品",
    intel: "情报",
    ordnance: "投掷物",
    misc: "杂项",
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
    weapon: "Weapons",
    armor: "Armor",
    consumable: "Consumables",
    intel: "Intel",
    ordnance: "Ordnance",
    misc: "Misc",
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
  { id: "weapon", icon: Crosshair },
  { id: "armor", icon: Shield },
  { id: "consumable", icon: Pill },
  { id: "intel", icon: FileText },
  { id: "ordnance", icon: Bomb },
  { id: "misc", icon: Package },
];

const MOCK_ITEMS = [
  // Weapons
  { id: "w1", category: "weapon", rarity: "epic", name: { zh: "M4A1 突击步枪", en: "M4A1 Assault Rifle" } },
  { id: "w2", category: "weapon", rarity: "rare", name: { zh: "AK-47 突击步枪", en: "AK-47 Assault Rifle" } },
  { id: "w3", category: "weapon", rarity: "rare", name: { zh: "MP5 冲锋枪", en: "MP5 SMG" } },
  { id: "w4", category: "weapon", rarity: "legendary", name: { zh: "AWM 狙击步枪", en: "AWM Sniper Rifle" } },
  { id: "w5", category: "weapon", rarity: "uncommon", name: { zh: "P90 冲锋枪", en: "P90 SMG" } },
  { id: "w6", category: "weapon", rarity: "common", name: { zh: "M1911 手枪", en: "M1911 Pistol" } },
  { id: "w7", category: "weapon", rarity: "mythic", name: { zh: "Vector 冲锋枪", en: "Vector SMG" } },
  
  // Armor
  { id: "a1", category: "armor", rarity: "epic", name: { zh: "四级战术背心", en: "Lvl 4 Tactical Vest" } },
  { id: "a2", category: "armor", rarity: "rare", name: { zh: "三级头盔", en: "Lvl 3 Helmet" } },
  { id: "a3", category: "armor", rarity: "uncommon", name: { zh: "防弹面罩", en: "Ballistic Mask" } },
  { id: "a4", category: "armor", rarity: "legendary", name: { zh: "重型防弹衣", en: "Heavy Armor" } },
  { id: "a5", category: "armor", rarity: "common", name: { zh: "轻型防弹衣", en: "Light Armor" } },
  
  // Consumables
  { id: "c1", category: "consumable", rarity: "common", name: { zh: "急救包", en: "Medkit" } },
  { id: "c2", category: "consumable", rarity: "common", name: { zh: "止痛药", en: "Painkillers" } },
  { id: "c3", category: "consumable", rarity: "common", name: { zh: "能量饮料", en: "Energy Drink" } },
  { id: "c4", category: "consumable", rarity: "rare", name: { zh: "战术医疗箱", en: "Tactical Medkit" } },
  { id: "c5", category: "consumable", rarity: "epic", name: { zh: "便携手术包", en: "Surgical Kit" } },
  
  // Intel
  { id: "i1", category: "intel", rarity: "mythic", name: { zh: "加密U盘", en: "Encrypted Flash Drive" } },
  { id: "i2", category: "intel", rarity: "legendary", name: { zh: "机密文件", en: "Classified Documents" } },
  { id: "i3", category: "intel", rarity: "uncommon", name: { zh: "硬盘", en: "Hard Drive" } },
  { id: "i4", category: "intel", rarity: "epic", name: { zh: "军密录音", en: "Military Recording" } },
  
  // Ordnance
  { id: "o1", category: "ordnance", rarity: "common", name: { zh: "破片手雷", en: "Frag Grenade" } },
  { id: "o2", category: "ordnance", rarity: "common", name: { zh: "闪光弹", en: "Flashbang" } },
  { id: "o3", category: "ordnance", rarity: "common", name: { zh: "烟雾弹", en: "Smoke Grenade" } },
  { id: "o4", category: "ordnance", rarity: "rare", name: { zh: "铝热剂", en: "Thermite" } },
  
  // Misc
  { id: "m1", category: "misc", rarity: "common", name: { zh: "螺丝刀", en: "Screwdriver" } },
  { id: "m2", category: "misc", rarity: "uncommon", name: { zh: "胶带", en: "Duct Tape" } },
  { id: "m3", category: "misc", rarity: "rare", name: { zh: "电子元件", en: "Electronic Parts" } },
  { id: "m4", category: "misc", rarity: "legendary", name: { zh: "金条", en: "Gold Bar" } },
];

type ItemType = typeof MOCK_ITEMS[0];
type SelectedItem = ItemType & { uid: string };

export default function Home() {
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const t = i18n[lang];

  // Settings
  const [bgColor, setBgColor] = useState("#00FF00"); 
  const [layoutStyle, setLayoutStyle] = useState("classic");
  const [animationSpeed, setAnimationSpeed] = useState([5]); 
  
  // Workspace State
  const [activeCategory, setActiveCategory] = useState("weapon");
  const [selectedList, setSelectedList] = useState<SelectedItem[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [animatingItems, setAnimatingItems] = useState<SelectedItem[]>([]);

  // Derived
  const filteredItems = MOCK_ITEMS.filter(item => item.category === activeCategory);

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
      setTimeout(() => {
        setAnimatingItems(prev => [...prev, item]);
      }, index * (1500 / animationSpeed[0]));
    });

    const totalTime = selectedList.length * (1500 / animationSpeed[0]) + 3000;
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
          <div className="p-4 border-b border-slate-800/60 bg-[#111]/50 backdrop-blur shrink-0">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
              {CATEGORIES.map(cat => {
                const Icon = cat.icon;
                const isActive = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-md transition-all whitespace-nowrap border font-medium text-sm font-display tracking-wider",
                      isActive 
                        ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" 
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {t[cat.id as keyof typeof t]}
                  </button>
                )
              })}
            </div>
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
                      
                      {/* Image Preview (Mocked with Icon) */}
                      <div className="aspect-square bg-slate-950 flex items-center justify-center relative overflow-hidden group-hover:bg-slate-900 transition-colors">
                         <div className="absolute inset-0 opacity-10" style={{ backgroundColor: rarityConfig.color }} />
                         {CATEGORIES.find(c => c.id === item.category)?.icon && (() => {
                            const Icon = CATEGORIES.find(c => c.id === item.category)!.icon;
                            return <Icon className="w-10 h-10 text-white/50 group-hover:text-white/80 transition-colors z-10" />;
                         })()}
                         
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
             <div className="absolute top-10 right-10 flex flex-col gap-2 w-[280px]">
               <AnimatePresence>
                 {animatingItems.map((item, idx) => (
                   <LootCard 
                     key={item.uid} 
                     item={item} 
                     layoutStyle={layoutStyle} 
                     lang={lang} 
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
                  <Label className="text-xs text-slate-400 mb-2 block">{t.bgColor}</Label>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setBgColor("#00FF00")}
                      className={cn("h-8 flex-1 rounded border transition-all text-xs font-medium text-black", bgColor === "#00FF00" ? 'border-white' : 'border-transparent')}
                      style={{ backgroundColor: "#00FF00" }}
                    >
                      Green
                    </button>
                    <button 
                      onClick={() => setBgColor("#000000")}
                      className={cn("h-8 flex-1 rounded border transition-all text-xs font-medium text-white", bgColor === "#000000" ? 'border-emerald-500' : 'border-slate-700')}
                      style={{ backgroundColor: "#000000" }}
                    >
                      Black
                    </button>
                  </div>
                </div>
                
                <div className="flex-1">
                  <Label className="text-xs text-slate-400 mb-2 block">{t.animStyle}</Label>
                  <Select value={layoutStyle} onValueChange={setLayoutStyle}>
                    <SelectTrigger className="h-8 bg-slate-900 border-slate-800 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="classic">{t.classic}</SelectItem>
                      <SelectItem value="compact">{t.compact}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
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
                            
                            <div className="w-8 h-8 bg-slate-950 flex items-center justify-center rounded border border-slate-800 ml-1">
                              <ImageIcon className="w-4 h-4 text-slate-500" />
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
function LootCard({ item, layoutStyle, lang }: { item: SelectedItem, layoutStyle: string, lang: "zh" | "en" }) {
  const rarityConfig = RARITIES[item.rarity as keyof typeof RARITIES];
  const catIcon = CATEGORIES.find(c => c.id === item.category)?.icon || ImageIcon;
  
  if (layoutStyle === "compact") {
    return (
      <motion.div
        initial={{ opacity: 0, x: 50, scale: 0.95 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 20, transition: { duration: 0.2 } }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="flex items-center gap-2 bg-black/80 backdrop-blur-md border-l-[3px] border-y border-r border-y-white/10 border-r-white/10 p-1.5 shadow-xl"
        style={{ borderLeftColor: rarityConfig.color, boxShadow: `-2px 0 10px -4px ${rarityConfig.color}` }}
      >
        <div className="w-8 h-8 bg-white/5 flex items-center justify-center border border-white/10">
          <ImageIcon className="w-4 h-4 text-white/40" />
        </div>
        <div className="flex-1 min-w-0 pr-2">
          <h3 className="font-display font-bold text-white text-sm leading-tight truncate">{item.name[lang]}</h3>
          <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: rarityConfig.color }}>
            {rarityConfig[lang]}
          </span>
        </div>
      </motion.div>
    );
  }

  // Classic Layout
  return (
    <motion.div
      initial={{ opacity: 0, x: 100, height: 0, margin: 0 }}
      animate={{ opacity: 1, x: 0, height: "auto", margin: "0.25rem 0" }}
      exit={{ opacity: 0, y: -20, scale: 0.95, transition: { duration: 0.2 } }}
      transition={{ 
        type: "spring", 
        stiffness: 300, 
        damping: 24,
        opacity: { duration: 0.2 }
      }}
      className="relative overflow-hidden group scale-90 origin-right"
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
        className="absolute left-0 top-0 bottom-0 w-1 origin-top"
        style={{ backgroundColor: rarityConfig.color, boxShadow: `0 0 8px ${rarityConfig.color}` }}
      />

      <div className="relative p-2 pl-4 flex items-center gap-3">
        {/* Item Icon placeholder */}
        <div className="w-10 h-10 bg-gradient-to-br from-white/10 to-transparent border border-white/20 flex items-center justify-center shadow-inner relative">
          <div className="absolute inset-0 opacity-20" style={{ backgroundColor: rarityConfig.color }} />
          <ImageIcon className="w-5 h-5 text-white/80 z-10" />
        </div>

        {/* Info */}
        <div className="flex-1 flex flex-col justify-center pr-4">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[9px] text-white/50 uppercase tracking-widest">{rarityConfig[lang]}</span>
          </div>
          <h3 className="font-display font-bold text-base text-white leading-none tracking-wide drop-shadow-md">
            {item.name[lang]}
          </h3>
        </div>
      </div>
    </motion.div>
  );
}
