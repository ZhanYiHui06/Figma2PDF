// 原型 Components 区域里的基础控件。

import type { ComponentChildren } from "preact";
import { Icon } from "./icons";

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      class={`toggle${on ? " on" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
    />
  );
}

export function Checkbox({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ComponentChildren }) {
  return (
    <label class={`checkbox${on ? " on" : ""}`} onClick={() => onChange(!on)}>
      <span class="box">{on && <Icon name="check" size={12} />}</span>
      <span>{children}</span>
    </label>
  );
}

export function Radio({ on }: { on: boolean }) {
  return <span class={`radio${on ? " on" : ""}`} />;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div class="segmented" role="radiogroup" style={{ "--n": options.length, "--i": i }}>
      <span class="seg-thumb" aria-hidden="true" />
      {options.map((o) => (
        <button type="button" key={o.value} role="radio" aria-checked={o.value === value} class={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select({ value, options, onChange, style }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; style?: string }) {
  return (
    <div class="select" style={style}>
      <select value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" />
    </div>
  );
}

export function Nav({ title, onBack, right }: { title: string; onBack?: () => void; right?: ComponentChildren }) {
  return (
    <>
      <div class="nav">
        {onBack && (
          <button type="button" class="back" onClick={onBack} aria-label="返回">
            <Icon name="arrowLeft" />
          </button>
        )}
        <div class="nav-title">{title}</div>
        <div class="spacer" />
        {right}
      </div>
      <div class="divider" />
    </>
  );
}

export function Banner({ kind, children }: { kind: "info" | "warning" | "neutral"; children: ComponentChildren }) {
  return (
    <div class={`banner banner-${kind}`}>
      <Icon name={kind === "warning" ? "warning" : "info"} />
      <div class="banner-body">{children}</div>
    </div>
  );
}

export function Modal({ title, children, actions }: { title: string; children: ComponentChildren; actions: ComponentChildren }) {
  return (
    <div class="modal-mask">
      <div class="modal" role="dialog" aria-label={title}>
        <h3>{title}</h3>
        <div class="desc">{children}</div>
        <div class="actions">{actions}</div>
      </div>
    </div>
  );
}
