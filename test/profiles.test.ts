import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { probeIcc } from "../src/lib/gs";
import { checkIcc } from "../src/lib/icc";
import { sha256Sync } from "../src/lib/sha256";

const require = createRequire(import.meta.url);

// 随插件提供的配置文件必须和 NOTICE 里登记的原文件一致（许可要求不修改）
const BUNDLED: Record<string, string> = {
  "FOGRA39L_coated.icc": "19d6cd1de88bf48816a7d2bfea5b71e3fff65d09ba0bb4b26f58f76cb4840929",
  "FOGRA47L_uncoated.icc": "8315616e5b74fab2d70ce418c6b3e7d6aee29cea9ec96d790d1a1b9959164cba",
  "GRACoL_TR006_coated.icc": "4105c8d5e239846fd9a6b73216b4bd5a6eb3389ef55fc59ae2642154c975746b",
  "SWOP_TR005_coated_5.icc": "83cecb046506bb3ad976cd549ecc3b90598c0f15b7d3e8d2a4c987b3c723889a",
};

describe("bundled ICC profiles", () => {
  const wasm = readFileSync(require.resolve("@okathira/ghostpdl-wasm/gs.wasm"));
  for (const [file, hash] of Object.entries(BUNDLED)) {
    it(`${file} is unmodified, CMYK output and usable by Ghostscript`, async () => {
      const bytes = new Uint8Array(readFileSync(new URL(`../profiles/${file}`, import.meta.url)));
      expect(sha256Sync(bytes)).toBe(hash);
      expect(checkIcc(bytes, file).ok).toBe(true);
      expect(await probeIcc(wasm, bytes)).toBe(true);
    });
  }
});
