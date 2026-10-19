// 04 ICC 配置文件管理

import { useRef, useState } from "preact/hooks";
import type { IccEntry } from "../../shared/messages";
import { Banner, Nav, Radio } from "../components";
import { formatBytes } from "../exporter";
import { Icon } from "../icons";
import { BUILTIN_ICC, ICC_PRESETS, importIcc, STORAGE_LIMIT, usedBytes } from "../icc-store";

interface Props {
  iccs: IccEntry[];
  selected: string;
  storageError: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
  onOpenUrl: (url: string) => void;
}

const date = (t: number) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

export function Icc({ iccs, selected, storageError, onSelect, onDelete, onBack, onOpenUrl }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const used = usedBytes(iccs);
  const bundled = ICC_PRESETS.filter((e) => e.kind === "bundled");
  const remote = ICC_PRESETS.filter((e) => e.kind === "remote");

  const item = (e: IccEntry, sub: string, right?: preact.ComponentChildren) => {
    const on = e.id === selected;
    return (
      <div class={`icc-item${on ? " on" : ""}`} key={e.id} onClick={() => onSelect(e.id)}>
        <Radio on={on} />
        <div style="flex:1;min-width:0">
          <div class="name">{e.name}</div>
          <div class="muted">{sub}</div>
        </div>
        {right}
      </div>
    );
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    let known = iccs;
    for (const f of Array.from(files)) {
      const r = await importIcc(f, known);
      if (!r.ok) {
        setError(r.reason);
        break;
      }
      known = [...known, r.entry];
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const shownError = error ?? storageError;

  return (
    <div class="screen">
      <Nav title="ICC 配置文件" onBack={onBack} />
      <div class="body scroll">
        <div class="muted">CMYK 导出时用哪个配置文件，决定颜色怎样转换。最好使用印刷厂指定的那个。</div>
        <div class="icc-group-title">随插件提供</div>
        <div class="icc-list">
          {item(BUILTIN_ICC, "近似 SWOP · 不确定时使用")}
          {bundled.map((e) => item(e, e.note))}
        </div>
        <div class="icc-group-title">首次使用时下载</div>
        <div class="icc-list">{remote.map((e) => item(e, `${e.note} · ${formatBytes(e.size)}`))}</div>
        <div class="icc-group-title">你导入的</div>
        {iccs.length > 0 && (
          <div class="icc-list">
            {iccs.map((e) =>
              item(
                e,
                `${formatBytes(e.size)} · ${date(e.importedAt)}`,
                <button
                  type="button"
                  class="del"
                  aria-label="删除"
                  title="删除"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onDelete(e.id);
                  }}
                >
                  <Icon name="trash" size={14} />
                </button>,
              ),
            )}
          </div>
        )}
        <input ref={fileRef} type="file" accept=".icc,.icm" multiple hidden onChange={(e) => onFiles((e.target as HTMLInputElement).files)} />
        <button type="button" class="btn btn-secondary btn-block" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={14} />
          {busy ? "正在导入…" : "导入 ICC 文件（.icc / .icm）"}
        </button>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div class="field-row">
            <span class="muted">本地空间</span>
            <div class="spacer" />
            <span class="muted">
              {(used / 1024 / 1024).toFixed(1)} / {STORAGE_LIMIT / 1024 / 1024} MB
            </span>
          </div>
          <div class="meter">
            <div style={{ width: `${Math.min(100, (used / STORAGE_LIMIT) * 100)}%` }} />
          </div>
          <div class="note">配置文件只保存在这台设备的这个 Figma 客户端里。换电脑或改用网页版时需要重新导入。</div>
        </div>
        {shownError && <Banner kind="warning">{shownError}</Banner>}
        <div class="guide">
          <b>去哪里找 ICC 文件？</b>
          <span>印刷厂指定了上面没有的配置文件时，再自己导入：</span>
          <span>1. 直接问印刷厂要（最推荐）</span>
          <span>
            2. Windows：<code>C:\Windows\System32\spool\drivers\color</code>
          </span>
          <span>
            3. macOS：<code>/Library/ColorSync/Profiles</code>
          </span>
          <span>
            4. 从{" "}
            <button type="button" class="link" onClick={() => onOpenUrl("https://www.adobe.com/support/downloads/iccprofiles/iccprofiles_win.html")}>
              Adobe
            </button>{" "}
            或{" "}
            <button type="button" class="link" onClick={() => onOpenUrl("https://www.eci.org/en/downloads")}>
              ECI
            </button>{" "}
            官网下载
          </span>
        </div>
        <div class="note">
          随插件提供的配置文件来自 colord 项目（CC0 公共领域），GRACoL / SWOP 的表征数据来自 CGATS TR006 / TR005。需下载的配置文件直接从 ICC 官方注册库（color.org）获取，版权归 JPMA、ECI、IDEAlliance 所有，插件不做任何修改。
        </div>
      </div>
    </div>
  );
}
