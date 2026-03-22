import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { compressImageToDataUrl, type LibraryItem } from "@/lib/useItemLibrary";

const RARITIES_META = [
  { key: "mythic",    color: "#ef4444", zh: "神话",  en: "Mythic" },
  { key: "legendary", color: "#f59e0b", zh: "传说",  en: "Legendary" },
  { key: "epic",      color: "#8b5cf6", zh: "史诗",  en: "Epic" },
  { key: "rare",      color: "#3b82f6", zh: "稀有",  en: "Rare" },
  { key: "prismatic", color: "",        zh: "棱彩",  en: "Prismatic", gradient: "linear-gradient(90deg,#f43f5e,#f97316,#eab308,#22c55e,#3b82f6,#a855f7)" },
];

const CARD_SUBS = [
  { key: "red_card",    rarity: "mythic",    color: "#ef4444", zh: "红卡", en: "Red Card" },
  { key: "gold_card",   rarity: "legendary", color: "#f59e0b", zh: "金卡", en: "Gold Card" },
  { key: "purple_card", rarity: "epic",      color: "#8b5cf6", zh: "紫卡", en: "Purple Card" },
  { key: "blue_card",   rarity: "rare",      color: "#3b82f6", zh: "蓝卡", en: "Blue Card" },
];

const CATEGORIES_META = [
  { id: "1x1" }, { id: "1x2" }, { id: "1x4" },
  { id: "2x1" }, { id: "2x2" }, { id: "2x3" },
  { id: "3x2" }, { id: "3x3" }, { id: "3x4" },
  { id: "4x2" }, { id: "4x3" }, { id: "4x4" },
  { id: "cards" },
];

interface Props {
  lang: "zh" | "en";
  defaultCategory?: string;
  onAdd: (item: Omit<LibraryItem, "id" | "isCustom">) => void;
  onClose: () => void;
}

export function AddItemDialog({ lang, defaultCategory, onAdd, onClose }: Props) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(defaultCategory || "1x1");
  const [rarity, setRarity] = useState("legendary");
  const [cardSub, setCardSub] = useState("gold_card");
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const isCards = category === "cards";

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) { setError(lang === "zh" ? "请选择图片文件" : "Select an image file"); return; }
    setImageLoading(true); setError("");
    try {
      const data = await compressImageToDataUrl(file, 192);
      setImageData(data);
    } catch { setError(lang === "zh" ? "图片处理失败" : "Image processing failed"); }
    setImageLoading(false);
  };

  const handleSubmit = () => {
    if (!name.trim()) { setError(lang === "zh" ? "请输入名称" : "Name is required"); return; }
    const finalRarity = isCards ? CARD_SUBS.find(s => s.key === cardSub)!.rarity : rarity;
    const sub = isCards ? cardSub : undefined;
    onAdd({ name: { zh: name.trim(), en: name.trim() }, category, subcategory: sub, rarity: finalRarity, image: imageData || undefined });
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.93, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 340, damping: 28 }}
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-slate-100 text-base">{lang === "zh" ? "添加自定义物品" : "Add Custom Item"}</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 flex items-center justify-center text-lg leading-none transition-colors">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide block mb-1.5">
              {lang === "zh" ? "名称" : "Name"}
            </label>
            <input
              autoFocus
              value={name}
              onChange={e => { setName(e.target.value); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              placeholder={lang === "zh" ? "输入物品名称..." : "Item name..."}
              className="w-full bg-slate-800 border border-slate-700 focus:border-violet-500 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 outline-none transition-colors"
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide block mb-1.5">
              {lang === "zh" ? "分类" : "Category"}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES_META.map(c => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs font-medium border transition-all",
                    category === c.id
                      ? "bg-violet-600 border-violet-500 text-white"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                  )}
                >{c.id}</button>
              ))}
            </div>
          </div>

          {/* Rarity / Card Sub */}
          {isCards ? (
            <div>
              <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide block mb-1.5">
                {lang === "zh" ? "卡片类型" : "Card Type"}
              </label>
              <div className="flex gap-2">
                {CARD_SUBS.map(s => (
                  <button
                    key={s.key}
                    onClick={() => setCardSub(s.key)}
                    className={cn("flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all", cardSub === s.key ? "text-white border-transparent" : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700")}
                    style={cardSub === s.key ? { backgroundColor: s.color, borderColor: s.color } : {}}
                  >{s[lang]}</button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide block mb-1.5">
                {lang === "zh" ? "稀有度" : "Rarity"}
              </label>
              <div className="flex gap-2 flex-wrap">
                {RARITIES_META.map(r => (
                  <button
                    key={r.key}
                    onClick={() => setRarity(r.key)}
                    className={cn("px-3 py-1.5 rounded-lg text-xs font-bold border transition-all", rarity === r.key ? "text-white border-transparent" : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700")}
                    style={rarity === r.key ? (r.gradient ? { background: r.gradient } : { backgroundColor: r.color }) : {}}
                  >
                    {r.gradient && rarity !== r.key ? (
                      <span style={{ background: r.gradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{r[lang]}</span>
                    ) : r[lang]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Image Upload */}
          <div>
            <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide block mb-1.5">
              {lang === "zh" ? "图片（可选）" : "Image (optional)"}
            </label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
            <div
              className={cn(
                "relative border-2 border-dashed rounded-xl transition-all cursor-pointer flex items-center gap-3 p-3",
                imageData ? "border-violet-500/50 bg-violet-500/5" : "border-slate-700 hover:border-slate-500 bg-slate-800/50"
              )}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              {imageData ? (
                <>
                  <img src={imageData} alt="" className="w-12 h-12 object-contain rounded-lg shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-300 font-medium">{lang === "zh" ? "已选择图片" : "Image selected"}</p>
                    <p className="text-[10px] text-slate-500">{lang === "zh" ? "点击更换" : "Click to change"}</p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setImageData(null); }}
                    className="p-1 rounded-lg bg-slate-700 hover:bg-red-500/30 text-slate-400 hover:text-red-400 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : imageLoading ? (
                <div className="flex-1 flex items-center justify-center gap-2 py-2 text-xs text-slate-500">
                  <div className="w-4 h-4 border-2 border-slate-600 border-t-violet-500 rounded-full animate-spin" />
                  {lang === "zh" ? "处理中..." : "Processing..."}
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center shrink-0">
                    <ImageIcon className="w-5 h-5 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">{lang === "zh" ? "点击选择或拖拽图片" : "Click or drag image"}</p>
                    <p className="text-[10px] text-slate-600">{lang === "zh" ? "PNG / JPG / WebP，自动压缩" : "PNG / JPG / WebP, auto-compressed"}</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Error */}
          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors">
              {lang === "zh" ? "取消" : "Cancel"}
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition-colors"
            >
              {lang === "zh" ? "添加" : "Add"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
