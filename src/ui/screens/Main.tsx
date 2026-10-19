// 01 列表视图 / 02 网格视图 / 03 设置展开 / 08 空状态 / 09 深色模式（同一套组件，颜色走变量）

import { useRef } from "preact/hooks";
import { formatPaperSize } from "../../lib/paper";
import type { IccEntry, Issue, PageInfo, SelectionPayload, Settings } from "../../shared/messages";
import { Banner, Checkbox, Segmented, Select, Toggle } from "../components";
import { moveId, useDragSort } from "../dnd";
import { Icon } from "../icons";
import { headlineIssue } from "../issues";

export type Section = "color" | "bleed" | "output";

export interface MainProps {
  sel: SelectionPayload | null;
  pages: PageInfo[];
  thumbs: Record<string, string>;
  issues: Map<string, Issue[]>;
  settings: Settings;
  iccs: IccEntry[];
  iccName: string;
  expanded: Set<Section>;
  singles: Set<string>;
  orderChanged: boolean;
  onSettings: (patch: Partial<Settings>) => void;
  onToggleSection: (s: Section) => void;
  onReorder: (ids: string[]) => void;
  onRemove: (id: string) => void;
  onReset: () => void;
  onOpen: (id: string) => void;
  onSingle: (containerId: string, single: boolean) => void;
  onManageIcc: () => void;
  onExport: () => void;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function thumbStyle(url: string | undefined) {
  return url ? { backgroundImage: `url(${url})` } : undefined;
}

function fitBox(w: number, h: number, maxW: number, maxH: number) {
  const s = Math.min(maxW / w, maxH / h);
  return { width: Math.round(w * s), height: Math.round(h * s) };
}

export function Main(p: MainProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const ids = p.pages.map((x) => x.id);
  const { drag, start } = useDragSort({
    ids,
    layout: p.settings.view,
    container: () => listRef.current,
    onMove: (id, at) => p.onReorder(moveId(ids, id, at)),
    onClick: (id) => p.onOpen(id),
  });

  const totalIssues = [...p.pages].reduce((n, pg) => n + (p.issues.get(pg.id)?.length ?? 0), 0);
  const empty = !p.pages.length;

  if (empty) return <Empty sel={p.sel} />;

  const banners = renderBanners(p);
  const dragged = drag ? p.pages.find((x) => x.id === drag.id) : undefined;

  return (
    <div class="screen">
      {banners.length > 0 && <div class="notice">{banners}</div>}
      <div class="toolbar">
        <span class="title">页面</span>
        <span class="tag tag-neutral">{p.pages.length}</span>
        <div class="spacer" />
        <button type="button" class="reset" disabled={!p.orderChanged} onClick={p.onReset} title="按画布位置重新排序，并恢复移除的页面">
          <Icon name="undo" size={12} />
          恢复默认顺序
        </button>
        <div class="view-toggle">
          <button type="button" class={p.settings.view === "list" ? "on" : ""} onClick={() => p.onSettings({ view: "list" })} aria-label="列表视图">
            <Icon name="list" size={14} />
          </button>
          <button type="button" class={p.settings.view === "grid" ? "on" : ""} onClick={() => p.onSettings({ view: "grid" })} aria-label="网格视图">
            <Icon name="grid" size={14} />
          </button>
        </div>
      </div>

      <div class="pages scroll" ref={listRef}>
        {p.settings.view === "list" ? (
          p.pages.map((pg, i) => {
            const head = headlineIssue(p.issues.get(pg.id) ?? []);
            return (
              <div
                key={pg.id}
                data-id={pg.id}
                class={`row${drag?.id === pg.id ? " dragging" : ""}`}
                onClick={() => p.onOpen(pg.id)}
              >
                <span
                  class="handle"
                  onPointerDown={(e) => start(pg.id, e, (e.currentTarget as HTMLElement).parentElement)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Icon name="grip" />
                </span>
                <span class="index">{pad2(i + 1)}</span>
                <span class="thumb" style={thumbStyle(p.thumbs[pg.id])} />
                <div class="text">
                  <span class="name">{pg.name}</span>
                  <span class="meta">{formatPaperSize(pg.width, pg.height)}</span>
                </div>
                {head && (
                  <span class="tag tag-warning tag-lg row-tag">
                    <Icon name="warning" size={12} />
                    {head.short}
                  </span>
                )}
                <button
                  type="button"
                  class="remove"
                  aria-label="从本次导出中移除"
                  title="从本次导出中移除（不改画布）"
                  onClick={(e) => {
                    e.stopPropagation();
                    p.onRemove(pg.id);
                  }}
                >
                  <Icon name="close" />
                </button>
              </div>
            );
          })
        ) : (
          <div class="grid">
            {p.pages.map((pg, i) => {
              const has = (p.issues.get(pg.id)?.length ?? 0) > 0;
              const box = fitBox(pg.width, pg.height, 92, 130);
              return (
                <div
                  key={pg.id}
                  data-id={pg.id}
                  class={`card${drag?.id === pg.id ? " placeholder" : ""}`}
                  onPointerDown={(e) => start(pg.id, e, e.currentTarget as HTMLElement)}
                >
                  <div class="thumb-wrap">
                    <span class="thumb" style={{ ...box, ...thumbStyle(p.thumbs[pg.id]) }} />
                    {has && (
                      <span class="dot">
                        <Icon name="warning" size={11} />
                      </span>
                    )}
                  </div>
                  <span class="label">
                    {pad2(i + 1)} {pg.name}
                  </span>
                  <button
                    type="button"
                    class="remove"
                    aria-label="从本次导出中移除"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      p.onRemove(pg.id);
                    }}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {drag && dragged && (
        <>
          {drag.line && <div class={p.settings.view === "list" ? "drop-line-h" : "drop-line-v"} style={{ position: "fixed", left: drag.line.x, top: drag.line.y, width: drag.line.w, height: drag.line.h }} />}
          {p.settings.view === "grid" ? (
            <div class="floating card" style={{ left: drag.x, top: drag.y, width: drag.w, height: drag.h }}>
              <div class="thumb-wrap">
                <span class="thumb" style={{ ...fitBox(dragged.width, dragged.height, 92, 130), ...thumbStyle(p.thumbs[dragged.id]) }} />
              </div>
              <span class="label">{dragged.name}</span>
            </div>
          ) : (
            <div class="floating row" style={{ left: drag.x, top: drag.y, width: drag.w, height: drag.h }}>
              <span class="handle">
                <Icon name="grip" />
              </span>
              <span class="thumb" style={thumbStyle(p.thumbs[dragged.id])} />
              <div class="text">
                <span class="name">{dragged.name}</span>
              </div>
            </div>
          )}
        </>
      )}

      <div class="divider" />
      <div class="settings scroll">
        <ColorSection {...p} />
        <BleedSection {...p} />
        <OutputSection {...p} />
      </div>
      <div class="divider" />
      <div class="footer">
        {totalIssues > 0 ? (
          <button type="button" class="issues" onClick={() => p.onOpen(p.pages.find((x) => p.issues.get(x.id)?.length)!.id)}>
            <Icon name="warning" size={14} />
            {totalIssues} 项提示
          </button>
        ) : (
          <span class="hint">检查通过</span>
        )}
        <div class="spacer" />
        <button type="button" class="btn btn-primary" style="width:120px" onClick={p.onExport}>
          导出 PDF
        </button>
      </div>
    </div>
  );
}

function renderBanners(p: MainProps) {
  const out = [];
  const containers = p.sel?.expansions.filter((e) => e.kind === "container") ?? [];
  for (const e of containers.slice(0, 2)) {
    const single = p.singles.has(e.id);
    out.push(
      <Banner kind="info" hug key={e.id}>
        <span>{single ? `「${e.name}」按单页导出` : `已将「${e.name}」展开为 ${e.count} 页`}</span>
        <button type="button" class="link" style="align-self:flex-start" onClick={() => p.onSingle(e.id, !single)}>
          {single ? "改为展开成多页" : "改为作为单页导出"}
        </button>
      </Banner>,
    );
  }
  if (!containers.length) {
    for (const e of (p.sel?.expansions ?? []).filter((x) => x.kind === "section").slice(0, 1)) {
      out.push(
        <Banner kind="info" hug key={e.id}>
          <span>已展开 Section「{e.name}」中的 {e.count} 个 Frame</span>
        </Banner>,
      );
    }
  }
  if (p.sel && p.sel.ignored.count > 0) {
    out.push(
      <Banner kind="neutral" hug key="ignored">
        <span>
          已忽略 {p.sel.ignored.count} 个非 Frame 对象{p.sel.ignored.label ? `（${p.sel.ignored.label}）` : ""}
        </span>
      </Banner>,
    );
  }
  return out;
}

function SettingHeader({ label, summary, open, onClick, right }: { label: string; summary?: string; open: boolean; onClick: () => void; right?: preact.ComponentChildren }) {
  return (
    <div class="setting" onClick={onClick} role="button" aria-expanded={open}>
      <span class="label">{label}</span>
      <span class="summary">{open ? "" : summary}</span>
      {right}
      <Icon name={open ? "chevronDown" : "chevronRight"} class="chev" />
    </div>
  );
}

function ColorSection(p: MainProps) {
  const s = p.settings;
  const open = p.expanded.has("color");
  const summary = s.colorMode === "rgb" ? "RGB" : `CMYK · ${p.iccName}${s.blackToK ? " · 文字单 K" : ""}`;
  return (
    <>
      <SettingHeader label="色彩" summary={summary} open={open} onClick={() => p.onToggleSection("color")} />
      {open && (
        <div class="section-body">
          <Segmented
            value={s.colorMode}
            options={[
              { value: "rgb", label: "RGB" },
              { value: "cmyk", label: "CMYK" },
            ]}
            onChange={(v) => p.onSettings({ colorMode: v })}
          />
          {s.colorMode === "cmyk" ? (
            <>
              <div class="field-row">
                <span class="field-label">ICC 配置文件</span>
                <div class="spacer" />
                <button type="button" class="link-accent" onClick={p.onManageIcc}>
                  管理
                </button>
              </div>
              <Select
                value={s.iccId}
                options={[{ value: "builtin", label: "通用 CMYK（近似 SWOP） · 内置" }, ...p.iccs.map((e) => ({ value: e.id, label: e.name }))]}
                onChange={(v) => p.onSettings({ iccId: v })}
              />
              <div class="toggle-row" onClick={() => p.onSettings({ blackToK: !s.blackToK })}>
                <Toggle on={s.blackToK} onChange={(v) => p.onSettings({ blackToK: v })} label="纯黑文字转单 K" />
                <div>
                  <div class="t12m">纯黑文字转单 K</div>
                  <div class="desc">只处理接近黑色的文字，避免小字套印偏差产生彩边。背景等大面积黑色保持四色黑。</div>
                </div>
              </div>
            </>
          ) : (
            <div class="note">RGB 适合屏幕阅读和数码打印，导出不需要联网。印刷厂要求 CMYK 时请切换。</div>
          )}
        </div>
      )}
    </>
  );
}

function BleedSection(p: MainProps) {
  const s = p.settings;
  const open = p.expanded.has("bleed");
  const summary = s.bleedOn ? `${s.bleedMm} mm${s.cropMarks ? " · 裁切标记" : ""}` : "关闭";
  const edgePages = s.bleedOn ? p.pages.filter((pg) => p.issues.get(pg.id)?.some((i) => i.kind === "edge")) : [];
  return (
    <>
      <div class="divider" style={open || p.expanded.has("color") ? "" : "display:none"} />
      <SettingHeader
        label="出血"
        summary={summary}
        open={open}
        onClick={() => p.onToggleSection("bleed")}
        right={open ? <Toggle on={s.bleedOn} onChange={(v) => p.onSettings({ bleedOn: v })} label="出血" /> : undefined}
      />
      {open && (
        <div class="section-body">
          {s.bleedOn && (
            <>
              <div class="field-row">
                <span class="field-label">出血宽度</span>
                <div class="spacer" />
                <div class="input">
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    value={s.bleedMm}
                    onChange={(e) => {
                      const v = Number((e.target as HTMLInputElement).value);
                      if (Number.isFinite(v)) p.onSettings({ bleedMm: Math.min(10, Math.max(0, v)) });
                    }}
                  />
                  <span>mm</span>
                </div>
              </div>
              <Checkbox on={s.cropMarks} onChange={(v) => p.onSettings({ cropMarks: v })}>
                添加裁切标记
              </Checkbox>
              {edgePages.length > 0 && (
                <div class="banner banner-warning" style="align-items:center">
                  <Icon name="warning" />
                  <div class="banner-body" style="flex:1">
                    {edgePages.length} 页有贴边元素没有延伸到出血区，裁切后可能露白
                  </div>
                  <button type="button" class="t11m" onClick={() => p.onOpen(edgePages[0].id)}>
                    查看
                  </button>
                </div>
              )}
            </>
          )}
          <div class="note">Frame 尺寸即成品尺寸。背景色会自动延伸到出血区。印刷厂要求出血时再开启。</div>
        </div>
      )}
    </>
  );
}

function OutputSection(p: MainProps) {
  const s = p.settings;
  const open = p.expanded.has("output");
  const summary = s.output === "merged" ? "合并为单个 PDF" : "每页一个 PDF（zip）";
  return (
    <>
      <div class="divider" style={open || p.expanded.has("bleed") ? "" : "display:none"} />
      <SettingHeader label="输出" summary={summary} open={open} onClick={() => p.onToggleSection("output")} />
      {open && (
        <div class="section-body">
          <Segmented
            value={s.output}
            options={[
              { value: "merged", label: "合并为单个 PDF" },
              { value: "zip", label: "每页一个 PDF（zip）" },
            ]}
            onChange={(v) => p.onSettings({ output: v })}
          />
          <div class="note">{s.output === "zip" ? "zip 里的文件以 Frame 名称命名，重名时自动加序号。" : "按上方页面顺序合并成一个多页 PDF。"}</div>
        </div>
      )}
    </>
  );
}

function Empty({ sel }: { sel: SelectionPayload | null }) {
  return (
    <div class="screen">
      <div class="empty">
        <svg width="84" height="72" viewBox="0 0 84 72" fill="none" aria-hidden="true">
          <rect x="14" y="8" width="46" height="58" rx="3" transform="rotate(-8 14 8)" fill="var(--bg-secondary)" stroke="var(--border-strong)" />
          <rect x="26" y="6" width="46" height="58" rx="3" transform="rotate(6 26 6)" fill="var(--bg-secondary)" stroke="var(--border-strong)" />
          <rect x="20" y="4" width="46" height="60" rx="3" fill="var(--bg-primary)" stroke="var(--border-strong)" />
          <rect x="30" y="14" width="26" height="3" rx="1.5" fill="var(--accent)" />
        </svg>
        <h2>选择要导出的 Frame</h2>
        <div class="muted">在画布上选中一个或多个 Frame。选中 Section 或包含多页的容器 Frame 时，会自动展开成多页。</div>
        {sel && sel.ignored.count > 0 && (
          <div class="banner banner-neutral" style="margin-top:8px;align-items:center">
            <Icon name="info" />
            <span>
              已忽略 {sel.ignored.count} 个非 Frame 对象{sel.ignored.label ? `（${sel.ignored.label}）` : ""}
            </span>
          </div>
        )}
      </div>
      <div class="divider" />
      <div class="footer">
        <span class="hint">PDF 尺寸提示：Figma 中 1px = 1pt ≈ 0.353mm</span>
        <div class="spacer" />
        <button type="button" class="btn btn-primary" style="width:120px" disabled>
          导出 PDF
        </button>
      </div>
    </div>
  );
}
