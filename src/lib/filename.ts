// 导出文件名：替换非法字符，重名追加序号。

export function sanitizeFileName(name: string, fallback = "Folio"): string {
  const s = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .slice(0, 80)
    .trim();
  return s || fallback;
}

export function uniqueNames(names: string[], ext: string): string[] {
  const used = new Map<string, number>();
  return names.map((raw) => {
    const base = sanitizeFileName(raw);
    const key = base.toLowerCase();
    const n = (used.get(key) ?? 0) + 1;
    used.set(key, n);
    return n === 1 ? `${base}${ext}` : `${base} (${n})${ext}`;
  });
}
