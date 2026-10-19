import { PDFDocument } from "pdf-lib";
import fs from "node:fs";
const [,, out, n, bleedMm, ...ins] = process.argv;
const bleed = Number(bleedMm) * 72 / 25.4;
const doc = await PDFDocument.create();
for (let i = 0; i < Number(n); i++) {
  const src = await PDFDocument.load(fs.readFileSync(ins[i % ins.length]));
  const [emb] = await doc.embedPdf(src, [0]);
  const W = emb.width, H = emb.height;
  // Simulate: exported page already contains bleed area; trim box is inset.
  const page = doc.addPage([W, H]);
  page.drawPage(emb, { x: 0, y: 0 });
  if (bleed > 0) { page.setTrimBox(bleed, bleed, W - 2*bleed, H - 2*bleed); page.setBleedBox(0, 0, W, H); }
}
fs.writeFileSync(out, await doc.save());
