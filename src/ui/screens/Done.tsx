// 07 导出完成 · 报告

import { Nav } from "../components";
import { formatBytes, type ExportResult } from "../exporter";
import { Icon } from "../icons";

export const FEEDBACK_URL =
  "https://github.com/ZhanYiHui06/Folio/issues/new?title=" +
  encodeURIComponent("印刷厂退件反馈") +
  "&body=" +
  encodeURIComponent("印刷厂退回的原因：\n\n导出设置（色彩 / ICC / 出血）：\n\n印刷厂给的要求（如有）：\n");

export function Done({ result, onDownload, onBack, onFeedback }: { result: ExportResult; onDownload: () => void; onBack: () => void; onFeedback: () => void }) {
  return (
    <div class="screen">
      <Nav title="导出完成" onBack={onBack} />
      <div class="body scroll">
        <div class="result">
          <span class="ok" aria-label="导出成功">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <circle class="ok-ring" cx="16" cy="16" r="15" pathLength={1} />
              <path class="ok-tick" d="M10 16.5L14.2 20.5L22 12" pathLength={1} />
            </svg>
          </span>
          <div style="min-width:0">
            <div class="name">{result.fileName}</div>
            <div class="muted">
              {result.pageCount} 页 · {formatBytes(result.bytes)} · 已开始下载
            </div>
          </div>
        </div>
        <div class="table">
          <div>
            <span class="k">尺寸</span>
            <span class="v">{result.sizeText}</span>
          </div>
          <div>
            <span class="k">色彩</span>
            <span class="v">{result.colorText}</span>
          </div>
          <div>
            <span class="k">纯黑文字</span>
            <span class="v">{result.kText}</span>
          </div>
          <div>
            <span class="k">出血</span>
            <span class="v">{result.bleedText}</span>
          </div>
        </div>
        {result.remaining.length > 0 && (
          <div class="banner banner-warning" style="flex-direction:column;gap:4px">
            <div class="t11m" style="display:flex;align-items:center;gap:6px">
              <Icon name="warning" size={14} />
              仍有 {result.remainingCount} 项提示未处理
            </div>
            {result.remaining.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
        )}
        <div class="spacer" />
        <button type="button" class="feedback" onClick={onFeedback}>
          <Icon name="message" size={14} />
          印刷厂退回了文件？告诉我们原因
        </button>
      </div>
      <div class="divider" />
      <div class="footer">
        <div class="spacer" />
        <button type="button" class="btn btn-secondary" onClick={onDownload}>
          再次下载
        </button>
        <button type="button" class="btn btn-primary" onClick={onBack}>
          完成
        </button>
      </div>
    </div>
  );
}
