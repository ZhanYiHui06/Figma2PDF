import { describe, expect, it } from "vitest";
import { checkIcc } from "../src/lib/icc";
import { fakeIcc } from "./helpers";

describe("icc", () => {
  it("reads v2 desc and v4 mluc names", () => {
    const v2 = checkIcc(fakeIcc("CMYK", "prtr", { v2: "Japan Color 2001 Coated" }), "a.icc");
    expect(v2.ok && v2.info.name).toBe("Japan Color 2001 Coated");
    const v4 = checkIcc(fakeIcc("CMYK", "prtr", { v4: "Coated FOGRA39" }), "b.icc");
    expect(v4.ok && v4.info.name).toBe("Coated FOGRA39");
  });
  it("rejects RGB display profiles with a reason", () => {
    const r = checkIcc(fakeIcc("RGB", "mntr", { v2: "sRGB" }), "sRGB IEC61966-2.1.icc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("「sRGB IEC61966-2.1.icc」是 RGB 显示器配置文件，不能用于 CMYK 导出，未导入。");
  });
  it("rejects garbage", () => {
    expect(checkIcc(new Uint8Array(10), "x.icc").ok).toBe(false);
  });
});
