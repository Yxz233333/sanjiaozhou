import { useState, useEffect, useMemo } from "react";

export type LibraryItem = {
  id: string;
  category: string;
  subcategory?: string;
  rarity: string;
  name: { zh: string; en: string };
  image?: string;
  isCustom?: boolean;
};

const CUSTOM_KEY = "item_library_custom_v1";
const DELETED_KEY = "item_library_deleted_v1";

export function useItemLibrary(defaultItems: LibraryItem[]) {
  const [customItems, setCustomItems] = useState<LibraryItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]"); } catch { return []; }
  });

  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(DELETED_KEY) || "[]")); } catch { return new Set(); }
  });

  useEffect(() => {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(customItems));
  }, [customItems]);

  useEffect(() => {
    localStorage.setItem(DELETED_KEY, JSON.stringify([...deletedIds]));
  }, [deletedIds]);

  const allItems = useMemo(() => [
    ...defaultItems.filter(i => !deletedIds.has(i.id)),
    ...customItems,
  ], [defaultItems, customItems, deletedIds]);

  const addCustomItem = (item: Omit<LibraryItem, "id" | "isCustom">) => {
    const newItem: LibraryItem = {
      ...item,
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      isCustom: true,
    };
    setCustomItems(prev => [...prev, newItem]);
    return newItem;
  };

  const deleteItem = (id: string) => {
    if (defaultItems.some(i => i.id === id)) {
      setDeletedIds(prev => new Set([...prev, id]));
    } else {
      setCustomItems(prev => prev.filter(i => i.id !== id));
    }
  };

  const restoreDefaults = () => setDeletedIds(new Set());

  return {
    allItems,
    customItems,
    deletedIds,
    hasDeletedDefaults: deletedIds.size > 0,
    addCustomItem,
    deleteItem,
    restoreDefaults,
  };
}

export async function compressImageToDataUrl(file: File, maxPx = 192): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(maxPx / img.width, maxPx / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/webp", 0.82));
    };
    img.onerror = reject;
    img.src = url;
  });
}
