import loadWASM from "@okathira/ghostpdl-wasm";
import fs from "node:fs";
const [,, inp, out, ...extra] = process.argv;
const M = await loadWASM({ print: s=>process.stdout.write(s+"\n"), printErr: s=>process.stderr.write(s+"\n") });
M.FS.writeFile("/in.pdf", fs.readFileSync(inp));
for (const f of extra.filter(a=>a.startsWith("@"))) { const p=f.slice(1); M.FS.writeFile("/"+p.split("/").pop(), fs.readFileSync(p)); }
const args = extra.filter(a=>!a.startsWith("@"));
const t=Date.now();
const rc = M.callMain(["-dNOPAUSE","-dBATCH","-dSAFER","-sDEVICE=pdfwrite", ...args, "-sOutputFile=/out.pdf","/in.pdf"]);
console.log("rc",rc,"ms",Date.now()-t);
if (args.includes("-v")) process.exit();
fs.writeFileSync(out, M.FS.readFile("/out.pdf"));
