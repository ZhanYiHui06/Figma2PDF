// 全部提示：按页列出所有提示，点页面进单页详情，点「定位」跳到画布图层。

import { matchPaper } from "../../lib/paper";
import type { Issue, PageInfo, Settings } from "../../shared/messages";
import { Nav } from "../components";
import { Icon } from "../icons";
import { pagePlan, type PageFix } from "../issues";
import { issueText, LocateButton } from "./Detail";

interface Props {
  pages: PageInfo[];
  thumbs: Record<string, string>;
  issues: Map<string, Issue[]>;
  fixOf: (p: PageInfo) => PageFix;
  settings: Settings;
  onOpen: (id: string) => void;
  onLocate: (nodeId: string) => void;
  onBack: () => void;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function Issues({ pages, thumbs, issues, fixOf, settings, onOpen, onLocate, onBack }: Props) {
  const groups = pages.map((page, index) => ({ page, index, list: issues.get(page.id) ?? [] })).filter((g) => g.list.length);
  const total = groups.reduce((n, g) => n + g.list.length, 0);

  return (
    <div class="screen">
      <Nav title="全部提示" onBack={onBack} right={<span class="tag tag-warning tag-lg">{total} 项</span>} />
      <div class="body scroll issue-groups">
        {groups.length === 0 && <div class="muted">所有页面都检查通过了。</div>}
        {groups.map(({ page, index, list }) => {
          const plan = pagePlan(page, fixOf(page), settings);
          const paper = plan.paper?.label ?? matchPaper(plan.trimW, plan.trimH)?.label ?? "成品";
          return (
            <section class="issue-group" key={page.id}>
              <button type="button" class="issue-page" onClick={() => onOpen(page.id)} title="打开这一页的详情">
                <span class="index">{pad2(index + 1)}</span>
                <span class="thumb" style={thumbs[page.id] ? { backgroundImage: `url(${thumbs[page.id]})` } : undefined} />
                <span class="name">{page.name}</span>
                <span class="tag tag-warning">{list.length}</span>
                <Icon name="chevronRight" class="chev" />
              </button>
              {list.map((issue, k) => {
                const { title, body } = issueText(issue, paper, page);
                return (
                  <div class={`issue-item${issue.level === "severe" ? " severe" : ""}`} key={k}>
                    <Icon name="warning" size={14} />
                    <div class="issue-text">
                      <div class="t11m">{title}</div>
                      <div class="desc">{body}</div>
                      {issue.nodeId && <LocateButton nodeId={issue.nodeId} onLocate={onLocate} />}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      <div class="divider" />
      <div class="footer">
        <span class="hint">点页面名称可以调整尺寸与缩放</span>
        <div class="spacer" />
        <button type="button" class="btn btn-primary" onClick={onBack}>
          完成
        </button>
      </div>
    </div>
  );
}
