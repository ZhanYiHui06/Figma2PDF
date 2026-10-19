// 测试用的最小 ICC 文件。

export function fakeIcc(space: string, cls: string, desc: { v4?: string; v2?: string }): Uint8Array {
  const tag: number[] = [];
  const str = (s: string) => [...s].map((c) => c.charCodeAt(0));
  if (desc.v2 !== undefined) {
    const s = str(desc.v2).concat(0);
    tag.push(...str("desc"), 0, 0, 0, 0, 0, 0, 0, s.length, ...s);
  } else {
    const u = [...(desc.v4 ?? "")].flatMap((c) => [c.charCodeAt(0) >> 8, c.charCodeAt(0) & 0xff]);
    tag.push(...str("mluc"), 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 12, ...str("en"), ...str("US"), 0, 0, 0, u.length, 0, 0, 0, 28, ...u);
  }
  const b = new Uint8Array(128 + 4 + 12 + tag.length);
  const put = (o: number, s: string) => s.split("").forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  put(12, cls.padEnd(4)); put(16, space.padEnd(4)); put(36, "acsp");
  b[8] = desc.v4 !== undefined ? 4 : 2;
  const dv = new DataView(b.buffer);
  dv.setUint32(0, b.length); dv.setUint32(128, 1);
  put(132, "desc"); dv.setUint32(136, 144); dv.setUint32(140, tag.length);
  b.set(tag, 144);
  return b;
}
