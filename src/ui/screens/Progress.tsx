// 06 导出进行中

import { Nav } from "../components";
import type { Progress as P, StepId } from "../exporter";
import { Icon } from "../icons";

const MB = 1024 * 1024;

export function Progress({ progress, iccName, onCancel }: { progress: P; iccName: string; onCancel: () => void }) {
  const title = (id: StepId) =>
    ({ engine: "下载色彩引擎（仅首次）", profile: "下载 ICC 配置文件", pages: "导出页面", convert: `转换为 CMYK · ${iccName}`, file: "生成 PDF 文件" })[id];
  const sub = (s: P["steps"][number]) => {
    if (s.id === "engine") return s.state === "done" ? "约 11 MB · 已完成" : s.state === "active" ? `${(s.done / MB).toFixed(1)} / ${(s.total / MB).toFixed(1)} MB` : "约 11 MB";
    if (s.id === "profile") return s.state === "pending" ? `${iccName} · ${(s.total / MB).toFixed(1)} MB` : `${(s.done / MB).toFixed(1)} / ${(s.total / MB).toFixed(1)} MB`;
    if (s.id === "pages") return `${s.done} / ${s.total}`;
    if (s.id === "convert") return s.state === "done" ? `${s.total} / ${s.total} 页` : s.state === "active" ? `第 ${Math.max(1, s.done)} / ${s.total} 页` : "";
    return "";
  };
  return (
    <div class="screen">
      <Nav title="正在导出" />
      <div class="steps scroll">
        {progress.steps.map((s) => (
          <div class={`step ${s.state}`} key={s.id}>
            <span class="mark">{s.state === "done" && <Icon name="check" size={12} />}</span>
            <div class="info">
              <span class="title">{title(s.id)}</span>
              {sub(s) && <span class="sub">{sub(s)}</span>}
              {s.state === "active" &&
                (s.id === "file" ? (
                  <div class="bar indeterminate">
                    <div />
                  </div>
                ) : (
                  <div class="bar">
                    <div style={{ width: `${s.total ? Math.min(100, (s.done / s.total) * 100) : 0}%` }} />
                  </div>
                ))}
            </div>
          </div>
        ))}
        <div class="spacer" />
        <div class="banner banner-neutral">
          <Icon name="info" />
          <span>文件只在你的电脑上处理，不会上传。导出期间可以继续使用 Figma。</span>
        </div>
      </div>
      <div class="divider" />
      <div class="footer">
        <span class="muted">{progress.eta ? `预计还需 ${progress.eta} 秒` : ""}</span>
        <div class="spacer" />
        <button type="button" class="btn btn-secondary" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}
