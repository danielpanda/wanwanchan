import type { ReactNode } from "react";

export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <>
      {title && <div className="group-title">{title}</div>}
      <div className="card">{children}</div>
    </>
  );
}

export function Row({ label, desc, children }: { label: string; desc?: ReactNode; children?: ReactNode }) {
  return (
    <div className="row">
      <div className="min-w-0">
        <div className="label">{label}</div>
        {desc && <div className="desc">{desc}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
  );
}

export function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <button className="toggle" role="switch" aria-checked={value} disabled={disabled} onClick={() => onChange(!value)} />;
}

export function Slider(props: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
  format?: (v: number) => string; disabled?: boolean;
}) {
  const { value, min, max, step = 1, onChange, format, disabled } = props;
  return (
    <div className="flex items-center gap-2">
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))} />
      <span className="w-14 text-right tabular-nums" style={{ color: "var(--sub)" }}>{format ? format(value) : value}</span>
    </div>
  );
}

export function Select<T extends string>(props: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string;
}) {
  return (
    <select className={`field ${props.className ?? ""}`} value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
      {props.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="max-w-[560px] mx-auto pb-6">
      <h2 className="title">{title}</h2>
      {children}
    </div>
  );
}
