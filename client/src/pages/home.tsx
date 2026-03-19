import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Settings, 
  Play, 
  SquareSquare, 
  Download, 
  Plus, 
  Trash2, 
  GripVertical,
  Monitor,
  RefreshCcw,
  Image as ImageIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

// Tactical theme colors for rarities
const RARITIES = {
  common: { name: "Common", color: "#d1d5db", glow: "rgba(209, 213, 219, 0.3)" },
  uncommon: { name: "Uncommon", color: "#10b981", glow: "rgba(16, 185, 129, 0.3)" },
  rare: { name: "Rare", color: "#3b82f6", glow: "rgba(59, 130, 246, 0.3)" },
  epic: { name: "Epic", color: "#8b5cf6", glow: "rgba(139, 92, 246, 0.3)" },
  legendary: { name: "Legendary", color: "#f59e0b", glow: "rgba(245, 158, 11, 0.3)" },
  mythic: { name: "Mythic", color: "#ef4444", glow: "rgba(239, 68, 68, 0.3)" },
};

type LootItem = {
  id: string;
  name: string;
  type: string;
  value: string;
  rarity: keyof typeof RARITIES;
};

export default function Home() {
  const [bgColor, setBgColor] = useState("#00FF00"); // Default green screen
  const [isPlaying, setIsPlaying] = useState(false);
  const [animationSpeed, setAnimationSpeed] = useState([5]); // seconds per item
  const [layoutStyle, setLayoutStyle] = useState("classic");
  
  const [items, setItems] = useState<LootItem[]>([
    { id: "1", name: "M4A1 Assault Rifle", type: "Weapon", value: "$4,500", rarity: "epic" },
    { id: "2", name: "Tactical Vest Lvl 4", type: "Armor", value: "$12,000", rarity: "legendary" },
    { id: "3", name: "Medkit", type: "Consumable", value: "$500", rarity: "common" },
    { id: "4", name: "Encrypted Flash Drive", type: "Intel", value: "$35,000", rarity: "mythic" },
    { id: "5", name: "Frag Grenade", type: "Ordnance", value: "$200", rarity: "uncommon" },
  ]);

  const [activeItems, setActiveItems] = useState<LootItem[]>([]);

  const handlePlay = () => {
    setIsPlaying(true);
    setActiveItems([]);
    
    // Stagger items appearing
    items.forEach((item, index) => {
      setTimeout(() => {
        setActiveItems(prev => [...prev, item]);
      }, index * (1500 / animationSpeed[0]));
    });

    // Reset after all items are done
    setTimeout(() => {
      setTimeout(() => setIsPlaying(false), 2000);
    }, items.length * (1500 / animationSpeed[0]) + 3000);
  };

  const addItem = () => {
    const newItem: LootItem = {
      id: Math.random().toString(36).substr(2, 9),
      name: "New Item",
      type: "Misc",
      value: "$100",
      rarity: "common"
    };
    setItems([...items, newItem]);
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const updateItem = (id: string, field: keyof LootItem, value: string) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  return (
    <div className="flex h-screen w-full bg-[#0a0a0a] text-slate-200 overflow-hidden font-sans">
      
      {/* LEFT PANEL: Settings */}
      <aside className="w-[400px] h-full flex flex-col border-r border-slate-800 bg-[#111111] z-10 shrink-0">
        <div className="p-5 border-b border-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
            <SquareSquare className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl uppercase tracking-wider text-slate-100">Delta Force</h1>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-display">Loot UI Generator</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-8">
          
          {/* Export Settings */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Monitor className="w-4 h-4" /> Canvas Settings
            </h2>
            
            <div className="space-y-3">
              <Label className="text-xs text-slate-400">Chroma Key Background</Label>
              <div className="grid grid-cols-3 gap-2">
                <button 
                  onClick={() => setBgColor("#00FF00")}
                  className={`h-10 rounded border-2 transition-all ${bgColor === "#00FF00" ? 'border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'border-transparent hover:border-slate-700'}`}
                  style={{ backgroundColor: "#00FF00" }}
                  title="Green Screen"
                />
                <button 
                  onClick={() => setBgColor("#000000")}
                  className={`h-10 rounded border-2 transition-all ${bgColor === "#000000" ? 'border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'border-transparent hover:border-slate-700'}`}
                  style={{ backgroundColor: "#000000" }}
                  title="Black Screen"
                />
                <button 
                  onClick={() => setBgColor("#0000FF")}
                  className={`h-10 rounded border-2 transition-all ${bgColor === "#0000FF" ? 'border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'border-transparent hover:border-slate-700'}`}
                  style={{ backgroundColor: "#0000FF" }}
                  title="Blue Screen"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <Label className="text-xs text-slate-400">Animation Style</Label>
              <Select value={layoutStyle} onValueChange={setLayoutStyle}>
                <SelectTrigger className="bg-slate-900 border-slate-800">
                  <SelectValue placeholder="Select style" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="classic">Classic Top-Right Stack</SelectItem>
                  <SelectItem value="compact">Compact Tactical</SelectItem>
                  <SelectItem value="wide">Wide Banner</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center">
                <Label className="text-xs text-slate-400">Animation Speed</Label>
                <span className="text-xs text-slate-500">{animationSpeed[0]}x</span>
              </div>
              <Slider 
                value={animationSpeed} 
                onValueChange={setAnimationSpeed} 
                max={10} 
                min={1} 
                step={1} 
                className="py-2"
              />
            </div>
          </section>

          <Separator className="bg-slate-800" />

          {/* Loot Items */}
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Settings className="w-4 h-4" /> Loot Payload
              </h2>
              <Button size="sm" variant="outline" onClick={addItem} className="h-7 text-xs border-slate-700 hover:bg-slate-800">
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={item.id} className="bg-slate-900 border border-slate-800 rounded p-3 relative group">
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button onClick={() => removeItem(item.id)} className="p-1 text-slate-500 hover:text-red-400 bg-slate-950 rounded">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  
                  <div className="flex gap-2 items-center mb-3">
                    <GripVertical className="w-4 h-4 text-slate-600 cursor-grab" />
                    <div className="flex-1 text-xs text-slate-400 font-display">Item {index + 1}</div>
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: RARITIES[item.rarity].color }} />
                  </div>
                  
                  <div className="space-y-2">
                    <Input 
                      value={item.name} 
                      onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                      className="h-8 text-sm bg-slate-950 border-slate-800 font-display font-medium"
                      placeholder="Item Name"
                    />
                    <div className="flex gap-2">
                      <Input 
                        value={item.value} 
                        onChange={(e) => updateItem(item.id, 'value', e.target.value)}
                        className="h-8 text-sm bg-slate-950 border-slate-800 w-24"
                        placeholder="Value"
                      />
                      <Select value={item.rarity} onValueChange={(val) => updateItem(item.id, 'rarity', val)}>
                        <SelectTrigger className="h-8 bg-slate-950 border-slate-800 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(RARITIES).map(([key, data]) => (
                            <SelectItem key={key} value={key}>
                              <span className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: data.color }} />
                                {data.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

        </div>

        <div className="p-5 border-t border-slate-800 bg-[#0d0d0d] flex gap-3">
          <Button 
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.2)]"
            onClick={handlePlay}
            disabled={isPlaying}
          >
            {isPlaying ? <RefreshCcw className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2 fill-current" />}
            {isPlaying ? 'Playing...' : 'Preview Animation'}
          </Button>
          <Button variant="outline" className="px-3 border-slate-700 hover:bg-slate-800" title="Export Instructions">
            <Download className="w-4 h-4 text-slate-400" />
          </Button>
        </div>
      </aside>

      {/* RIGHT PANEL: Preview Canvas */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        
        {/* Canvas Toolbar */}
        <div className="absolute top-4 left-4 z-20 bg-slate-900/80 backdrop-blur border border-slate-800 rounded flex p-1 shadow-xl">
          <div className="px-3 py-1.5 text-xs font-medium text-slate-400 border-r border-slate-700/50 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            1920x1080
          </div>
          <div className="px-3 py-1.5 text-xs font-medium text-slate-400">
            Export ready
          </div>
        </div>

        {/* The actual chroma key canvas */}
        <div 
          className="flex-1 relative transition-colors duration-300"
          style={{ backgroundColor: bgColor }}
        >
          {/* Safe Zone Guides (Only visible when not playing if desired, but let's keep them subtle) */}
          <div className="absolute inset-8 border border-white/10 pointer-events-none border-dashed" />
          <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white/5 pointer-events-none" />
          <div className="absolute top-0 left-1/2 w-[1px] h-full bg-white/5 pointer-events-none" />

          {/* Loot Overlay Container - Top Right Alignment typically for shooters */}
          <div className="absolute top-12 right-12 flex flex-col gap-3 w-[380px]">
            <AnimatePresence>
              {activeItems.map((item, index) => (
                <LootCard 
                  key={item.id + index} // Force re-render if played multiple times
                  item={item} 
                  layoutStyle={layoutStyle}
                  index={index}
                />
              ))}
            </AnimatePresence>
          </div>
          
        </div>
      </main>
    </div>
  );
}

// Separate component for the animated loot card
function LootCard({ item, layoutStyle, index }: { item: LootItem, layoutStyle: string, index: number }) {
  const rarityConfig = RARITIES[item.rarity];
  
  if (layoutStyle === "compact") {
    return (
      <motion.div
        initial={{ opacity: 0, x: 50, scale: 0.95 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 20, transition: { duration: 0.2 } }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="flex items-center gap-3 bg-black/80 backdrop-blur-md border-l-4 border-y border-r border-y-white/10 border-r-white/10 p-2 shadow-xl"
        style={{ borderLeftColor: rarityConfig.color, boxShadow: `-4px 0 15px -5px ${rarityConfig.color}` }}
      >
        <div className="w-10 h-10 bg-white/5 flex items-center justify-center border border-white/10">
          <ImageIcon className="w-5 h-5 text-white/40" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-bold text-white text-lg leading-tight truncate">{item.name}</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-bold" style={{ color: rarityConfig.color }}>
              {rarityConfig.name}
            </span>
          </div>
        </div>
        <div className="font-display font-bold text-emerald-400 text-lg pr-2">
          {item.value}
        </div>
      </motion.div>
    );
  }

  // Classic Layout
  return (
    <motion.div
      initial={{ opacity: 0, x: 100, height: 0, margin: 0 }}
      animate={{ opacity: 1, x: 0, height: "auto", margin: "0.75rem 0" }}
      exit={{ opacity: 0, y: -20, scale: 0.95, transition: { duration: 0.2 } }}
      transition={{ 
        type: "spring", 
        stiffness: 300, 
        damping: 24,
        opacity: { duration: 0.2 }
      }}
      className="relative overflow-hidden group"
    >
      {/* Angled cut background typical in tactical UI */}
      <div 
        className="absolute inset-0 bg-gradient-to-r from-black/90 to-black/60 backdrop-blur-sm border border-white/10"
        style={{
          clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)"
        }}
      />
      
      {/* Colored accent line */}
      <motion.div 
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        className="absolute left-0 top-0 bottom-0 w-1.5 origin-top"
        style={{ backgroundColor: rarityConfig.color, boxShadow: `0 0 10px ${rarityConfig.color}` }}
      />

      <div className="relative p-3 pl-5 flex items-center gap-4">
        {/* Item Icon placeholder */}
        <div className="w-14 h-14 bg-gradient-to-br from-white/10 to-transparent border border-white/20 flex items-center justify-center shadow-inner relative">
          <div className="absolute inset-0 opacity-20" style={{ backgroundColor: rarityConfig.color }} />
          <ImageIcon className="w-6 h-6 text-white/80 z-10" />
        </div>

        {/* Info */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-1">
            <span 
              className="text-[10px] uppercase tracking-widest font-bold px-1.5 py-0.5 bg-white/10 text-white/90"
              style={{ backgroundColor: `${rarityConfig.color}20`, color: rarityConfig.color }}
            >
              {item.type}
            </span>
            <span className="text-[10px] text-white/50 uppercase tracking-widest">{rarityConfig.name}</span>
          </div>
          <h3 className="font-display font-bold text-xl text-white leading-none tracking-wide drop-shadow-md">
            {item.name}
          </h3>
        </div>

        {/* Value */}
        <div className="flex flex-col items-end justify-center pr-2">
          <span className="text-[10px] text-white/40 uppercase tracking-widest mb-1">Est. Value</span>
          <span className="font-display font-bold text-xl text-emerald-400 leading-none shadow-black drop-shadow-md">
            {item.value}
          </span>
        </div>
      </div>

      {/* Decorative tech elements */}
      <div className="absolute top-1 right-1 w-2 h-2 border-t border-r border-white/30" />
      <div className="absolute bottom-1 right-3 w-4 h-1 border-b border-white/20" />
    </motion.div>
  );
}
