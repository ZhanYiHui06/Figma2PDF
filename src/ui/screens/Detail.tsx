// 05 单页检查详情：尺寸与缩放、图片分辨率、贴边、细线、小字。

import { formatMm, matchPaper, nearestPaper, orientPaper, PAPERS, paperById, planFit } from "../../lib/paper";
import type { Issue, PageInfo, Settings } from "../../shared/messages";
import { Nav, Radio, Select } from "../components";
import { Icon } from "../icons";
import { MIN_FONT_PT, MIN_STROKE_PT, pagePlan, sizeConcern, type PageFix } from "../issues";

interface Props {
  page: PageInfo;
  thumb?: string;
  issues: Issue[];
  fix: PageFix;
  settings: Settings;
  onFix: (fix: PageFix) => void;
  onLocate: (nodeId: string) => void;
  onBack: () => void;
}

const fmt1 = (n: number) => (Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1));

export function Detail({ page, thumb, issues, fix, settings, onFix, onLocate, onBack }: Props) {
  const plan = pagePlan(page, fix, settings);
  const target = paperById(fix.paperId) ?? PAPERS[1];
  const fit = planFit(page.width, page.height, target);
  const o = orientPaper(target, page.width > page.height);
  const enlarge = fit.scale >= 1;
  const concern = sizeConcern(page);
  const showSize = !!concern || fix.mode === "fit";
  const outW = plan.trimW;
  const outH = plan.trimH;
  const outMatch = matchPaper(outW, outH);
  const near = nearestPaper(outW, outH);
  const tagCount = issues.length;
  const srcNear = nearestPaper(page.width, page.height);

  return (
    <div class="screen">
      <Nav
        title={page.name}
        onBack={onBack}
        right={tagCount > 0 ? <span class="tag tag-warning tag-lg">{tagCount} 项提示</span> : <span class="tag tag-neutral tag-lg">检查通过</span>}
      />
      <div class="body scroll">
        <div style="display:flex;gap:14px">
          <span class="thumb" style={{ width: "60px", height: `${Math.min(110, Math.round((60 * page.height) / page.width))}px`, backgroundImage: thumb ? `url(${thumb})` : undefined }} />
          <div style="display:flex;flex-direction:column;gap:1px">
            <span class="tertiary">Frame 尺寸</span>
            <span class="t12m">
              {fmt1(page.width)} × {fmt1(page.height)} px
            </span>
            <span class="tertiary" style="margin-top:4px">导出后的实际尺寸</span>
            <span style="display:flex;align-items:center;gap:6px">
              <span class="t12m" style={outMatch ? "" : "color:var(--warning)"}>
                {formatMm(outW, outH)}
              </span>
              <span class="tag tag-neutral">{outMatch ? outMatch.label : `≈ ${near.label}`}</span>
            </span>
          </div>
        </div>

        {showSize && (
          <div class="card-box">
            <div class="card-title">
              <Icon name="scale" size={14} />
              {concern ? "尺寸可能不是你想要的" : "按目标纸张缩放"}
            </div>
            {concern && (
              <div class="desc">
                Figma 里 1px = 1pt ≈ 0.353mm。这个 Frame 宽 {fmt1(page.width)}px，导出后是 {fmt1((page.width * 25.4) / 72)}mm 宽，大约是{" "}
                {srcNear.label}
                {srcNear.id !== target.id ? `，而不是 ${target.label}` : ""}。
              </div>
            )}
            <div class="opt" onClick={() => onFix({ ...fix, mode: "keep" })}>
              <Radio on={fix.mode === "keep"} />
              <div>
                <div class="t11m">保持原尺寸导出</div>
                <div class="tertiary">{formatMm(page.width, page.height)}</div>
              </div>
            </div>
            <div class="opt" onClick={() => onFix({ ...fix, mode: "fit" })}>
              <Radio on={fix.mode === "fit"} />
              <div style="flex:1">
                <div class="t11m">
                  {fit.aspectOk ? `按 ${target.label} 等比${enlarge ? "放大" : "缩小"}导出` : `居中放到 ${target.label}，四周留白`}
                </div>
                <div class="tertiary">
                  × {fit.scale.toFixed(2)} · {fit.aspectOk ? "宽高比一致，内容不变形" : "宽高比不一致，不能铺满，只能居中留白"}
                </div>
              </div>
            </div>
            <div class="field-row" style="padding-left:22px">
              <span class="field-label">目标纸张</span>
              <Select
                style="width:170px;height:24px"
                value={target.id}
                options={PAPERS.map((x) => {
                  const oo = orientPaper(x, page.width > page.height);
                  return { value: x.id, label: `${x.label} · ${fmt1(oo.w)} × ${fmt1(oo.h)} mm` };
                })}
                onChange={(v) => onFix({ mode: "fit", paperId: v })}
              />
            </div>
            {fix.mode === "fit" && (
              <div class="note" style="padding-left:22px">
                缩放后会重新检查图片分辨率、最细线条和最小字号。成品 {fmt1(o.w)} × {fmt1(o.h)} mm。
              </div>
            )}
          </div>
        )}

        {issues
          .filter((i) => i.kind !== "size")
          .map((i, k) => (
            <IssueCard issue={i} key={k} plan={{ paper: plan.paper?.label ?? (outMatch?.label ?? "成品") }} onLocate={onLocate} />
          ))}

        {issues.length === 0 && !showSize && <div class="muted">这一页没有发现问题。</div>}
      </div>
      <div class="divider" />
      <div class="footer">
        <span class="hint">设置只影响导出，不会修改画布</span>
        <div class="spacer" />
        <button type="button" class="btn btn-primary" onClick={onBack}>
          完成
        </button>
      </div>
    </div>
  );
}

/** 提示的标题和说明，单页详情和「全部提示」共用 */
export function issueText(issue: Issue, paper: string, page?: PageInfo): { title: string; body: string } {
  const at = issue.nodeName ? `（「${issue.nodeName}」）` : "";
  switch (issue.kind) {
    case "size":
      return {
        title: "尺寸可能不是你想要的",
        body: page
          ? `这一页导出后是 ${formatMm(page.width, page.height)}（${issue.short}）。Figma 里 1px = 1pt ≈ 0.353mm，可以在单页详情里按目标纸张缩放。`
          : `${issue.short}。可以在单页详情里按目标纸张缩放。`,
      };
    case "ppi": {
      let body = `图层「${issue.nodeName}」原图 ${issue.imageW} × ${issue.imageH} px，放到 ${paper} 后约 ${Math.round(issue.ppi ?? 0)} ppi，印刷建议 ≥ 300 ppi。`;
      if ((issue.count ?? 1) > 1) body += `这一页共有 ${issue.count} 张图片低于 300 ppi。`;
      return { title: issue.level === "severe" ? "图片分辨率太低，印出来会模糊" : "图片分辨率偏低", body };
    }
    case "edge":
      return {
        title: "贴边元素没有延伸到出血区",
        body: `有 ${issue.count} 个元素刚好贴着成品边缘（例如「${issue.nodeName}」）。裁切有误差，边上可能露出白边。把它们拉出画框外，超出部分会作为出血导出。`,
      };
    case "hairline":
      return { title: "线条太细，可能印不出来", body: `最细的线条约 ${issue.value?.toFixed(2)} pt${at}，印刷建议不小于 ${MIN_STROKE_PT} pt。` };
    case "font":
      return { title: "文字太小", body: `最小的文字约 ${issue.value?.toFixed(1)} pt${at}，小于 ${MIN_FONT_PT} pt 印出来可能看不清。` };
  }
}

export function LocateButton({ nodeId, onLocate }: { nodeId: string; onLocate: (id: string) => void }) {
  return (
    <button
      type="button"
      class="link-accent"
      style="display:inline-flex;align-items:center;gap:4px;align-self:flex-start"
      onClick={(e) => {
        e.stopPropagation();
        onLocate(nodeId);
      }}
    >
      <Icon name="target" size={12} />
      在画布中定位图层
    </button>
  );
}

function IssueCard({ issue, plan, onLocate }: { issue: Issue; plan: { paper: string }; onLocate: (id: string) => void }) {
  const { title, body } = issueText(issue, plan.paper);
  return (
    <div class="card-box">
      <div class="card-title">
        <Icon name="warning" size={14} class="" />
        {title}
      </div>
      <div class="desc">{body}</div>
      {issue.nodeId && <LocateButton nodeId={issue.nodeId} onLocate={onLocate} />}
    </div>
  );
}
