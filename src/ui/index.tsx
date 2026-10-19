import { render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { formatMm, matchPaper } from "../lib/paper";
import { DEFAULT_SETTINGS, type IccEntry, type PageInfo, type SelectionPayload, type Settings } from "../shared/messages";
import { listen, send } from "./bridge";
import { Modal } from "./components";
import { Cancelled, downloadBlob, startExport, type ExportResult, type Progress as ProgressState } from "./exporter";
import { BUILTIN_ICC } from "./icc-store";
import { defaultFix, pageIssues, pagePlan, type PageFix } from "./issues";
import { Detail } from "./screens/Detail";
import { Done, FEEDBACK_URL } from "./screens/Done";
import { Icc } from "./screens/Icc";
import { Main, type Section } from "./screens/Main";
import { Progress } from "./screens/Progress";
import "./styles.css";

type Screen = { name: "main" } | { name: "detail"; id: string } | { name: "icc" } | { name: "progress" } | { name: "done" };

function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [iccs, setIccs] = useState<IccEntry[]>([]);
  const [sel, setSel] = useState<SelectionPayload | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [fixes, setFixes] = useState<Map<string, PageFix>>(new Map());
  const [singles, setSingles] = useState<Set<string>>(new Set());
  const [screen, setScreen] = useState<Screen>({ name: "main" });
  const [expanded, setExpanded] = useState<Set<Section>>(new Set());
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmMixed, setConfirmMixed] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const busy = screen.name === "progress";

  useEffect(() => {
    const off = listen((m) => {
      switch (m.type) {
        case "init":
          setSettings(m.settings);
          setIccs(m.iccs);
          break;
        case "selection":
          // 新选区：恢复默认顺序，正在看的页面不在了就回到主界面
          setSel(m.payload);
          setOrder(m.payload.pages.map((p) => p.id));
          setScreen((s) => (s.name === "detail" && !m.payload.pages.some((p) => p.id === s.id) ? { name: "main" } : s));
          break;
        case "thumb": {
          const url = URL.createObjectURL(new Blob([m.png as Uint8Array<ArrayBuffer>], { type: "image/png" }));
          setThumbs((t) => {
            if (t[m.id]) URL.revokeObjectURL(t[m.id]);
            return { ...t, [m.id]: url };
          });
          break;
        }
        case "iccs":
          setIccs(m.iccs);
          setStorageError(null);
          break;
        case "storage-error":
          setStorageError(m.message);
          break;
      }
    });
    send({ type: "ready" });
    return off;
  }, []);

  const byId = useMemo(() => new Map((sel?.pages ?? []).map((p) => [p.id, p])), [sel]);
  const pages = useMemo(() => order.map((id) => byId.get(id)).filter((p): p is PageInfo => !!p), [order, byId]);
  const fixOf = (p: PageInfo) => fixes.get(p.id) ?? defaultFix(p);
  const issues = useMemo(() => new Map(pages.map((p) => [p.id, pageIssues(p, fixOf(p), settings)])), [pages, fixes, settings]);
  const defaultOrder = (sel?.pages ?? []).map((p) => p.id).join("|");
  const orderChanged = order.join("|") !== defaultOrder;
  const icc = settings.iccId === BUILTIN_ICC.id ? BUILTIN_ICC : (iccs.find((e) => e.id === settings.iccId) ?? BUILTIN_ICC);

  const updateSettings = (patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      send({ type: "save-settings", settings: next });
      return next;
    });
  };

  const baseName = () => {
    const container = sel?.expansions.find((e) => e.kind === "container" && !singles.has(e.id));
    const section = sel?.expansions.find((e) => e.kind === "section");
    return container?.name ?? section?.name ?? pages[0]?.name ?? "Folio";
  };

  const runExport = () => {
    setConfirmMixed(false);
    setError(null);
    setScreen({ name: "progress" });
    const handle = startExport(
      {
        pages,
        fixes: new Map(pages.map((p) => [p.id, fixOf(p)])),
        issues: pages.map((p, index) => ({ index, issues: issues.get(p.id) ?? [] })),
        settings,
        icc,
        baseName: baseName(),
      },
      setProgress,
    );
    cancelRef.current = handle.cancel;
    handle.promise
      .then((r) => {
        setResult(r);
        downloadBlob(r.blob, r.fileName);
        setScreen({ name: "done" });
      })
      .catch((e) => {
        if (!(e instanceof Cancelled) && !(e instanceof Error && e.message === "cancelled") && !(e instanceof DOMException && e.name === "AbortError")) {
          setError(e instanceof Error ? e.message : String(e));
        }
        setScreen({ name: "main" });
      })
      .finally(() => {
        cancelRef.current = null;
        setProgress(null);
      });
  };

  const onExport = () => {
    const sizes = new Set(pages.map((p) => {
      const plan = pagePlan(p, fixOf(p), settings);
      return formatMm(plan.trimW, plan.trimH);
    }));
    if (sizes.size > 1) setConfirmMixed(true);
    else runExport();
  };

  let body;
  if (screen.name === "detail" && byId.get(screen.id)) {
    const page = byId.get(screen.id)!;
    body = (
      <Detail
        page={page}
        thumb={thumbs[page.id]}
        issues={issues.get(page.id) ?? pageIssues(page, fixOf(page), settings)}
        fix={fixOf(page)}
        settings={settings}
        onFix={(f) => setFixes((m) => new Map(m).set(page.id, f))}
        onLocate={(nodeId) => send({ type: "locate", nodeId })}
        onBack={() => setScreen({ name: "main" })}
      />
    );
  } else if (screen.name === "icc") {
    body = (
      <Icc
        iccs={iccs}
        selected={icc.id}
        storageError={storageError}
        onSelect={(id) => updateSettings({ iccId: id })}
        onDelete={(id) => {
          send({ type: "icc-delete", id });
          if (settings.iccId === id) updateSettings({ iccId: BUILTIN_ICC.id });
        }}
        onBack={() => setScreen({ name: "main" })}
        onOpenUrl={(url) => send({ type: "open-url", url })}
      />
    );
  } else if (screen.name === "progress" && progress) {
    body = <Progress progress={progress} iccName={icc.name} onCancel={() => cancelRef.current?.()} />;
  } else if (screen.name === "done" && result) {
    body = (
      <Done
        result={result}
        onDownload={() => downloadBlob(result.blob, result.fileName)}
        onBack={() => setScreen({ name: "main" })}
        onFeedback={() => send({ type: "open-url", url: FEEDBACK_URL })}
      />
    );
  } else {
    body = (
      <Main
        sel={sel}
        pages={pages}
        thumbs={thumbs}
        issues={issues}
        settings={settings}
        iccs={iccs}
        iccName={icc.name}
        expanded={expanded}
        singles={singles}
        orderChanged={orderChanged}
        onSettings={updateSettings}
        onToggleSection={(s) =>
          setExpanded((e) => {
            const n = new Set(e);
            if (n.has(s)) n.delete(s);
            else {
              n.add(s);
              // 设置就地展开，窗口太矮时拉高一些（用户之后可以自己拖动调整）
              if (window.innerHeight < 760) send({ type: "resize", width: window.innerWidth, height: 820 });
            }
            return n;
          })
        }
        onReorder={setOrder}
        onRemove={(id) => setOrder((o) => o.filter((x) => x !== id))}
        onReset={() => setOrder((sel?.pages ?? []).map((p) => p.id))}
        onOpen={(id) => setScreen({ name: "detail", id })}
        onSingle={(id, single) => {
          const n = new Set(singles);
          if (single) n.add(id);
          else n.delete(id);
          setSingles(n);
          send({ type: "set-singles", ids: [...n] });
        }}
        onManageIcc={() => setScreen({ name: "icc" })}
        onExport={onExport}
      />
    );
  }

  return (
    <>
      {body}
      {confirmMixed && !busy && (
        <Modal
          title="各页尺寸不一致"
          actions={
            <>
              <button type="button" class="btn btn-secondary" onClick={() => setConfirmMixed(false)}>
                返回检查
              </button>
              <button type="button" class="btn btn-primary" onClick={runExport}>
                仍然导出
              </button>
            </>
          }
        >
          这次导出包含 {new Set(pages.map((p) => { const pl = pagePlan(p, fixOf(p), settings); return (matchPaper(pl.trimW, pl.trimH)?.label ?? "") + formatMm(pl.trimW, pl.trimH); })).size} 种页面尺寸。印刷厂通常要求同一份文件尺寸统一，确认这是你想要的吗？
        </Modal>
      )}
      {error && (
        <Modal
          title="导出没有完成"
          actions={
            <button type="button" class="btn btn-primary" onClick={() => setError(null)}>
              知道了
            </button>
          }
        >
          <div style="white-space:pre-wrap;user-select:text;max-height:200px;overflow:auto">{error}</div>
        </Modal>
      )}
      <ResizeGrip />
    </>
  );
}

function ResizeGrip() {
  const start = (e: PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => send({ type: "resize", width: ev.clientX + 6, height: ev.clientY + 6 });
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };
  return (
    <div class="resize-grip" onPointerDown={start} title="拖动调整窗口大小">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M13 5L5 13M13 9L9 13" stroke="var(--text-tertiary)" stroke-width="1" />
      </svg>
    </div>
  );
}

render(<App />, document.getElementById("app")!);
