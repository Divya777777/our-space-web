import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Icon, IconName } from './Icon';

export function Button({ children, variant = 'primary', icon, size, block, busy, className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet-danger'; icon?: IconName; size?: 'sm'; block?: boolean; busy?: boolean }) {
  return <button type="button" className={`btn ${variant} ${size || ''} ${block ? 'block' : ''} ${className}`} disabled={rest.disabled || busy} {...rest}>
    {busy ? <span className="spinner" /> : icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} stroke={2} /> : null}{children}
  </button>;
}
export function IconButton({ icon, label, size, variant, className = '', iconSize, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; size?: 'sm' | 'lg'; variant?: 'plain' | 'on' | 'accent' | 'end' | 'mint'; iconSize?: number }) {
  return <button type="button" aria-label={label} title={label} className={`icon-btn ${size || ''} ${variant || ''} ${className}`} {...rest}>
    <Icon name={icon} size={iconSize || (size === 'sm' ? 17 : size === 'lg' ? 24 : 20)} />
  </button>;
}

const HUES = ['#C8B6FF', '#B6DDCF', '#E6C994', '#F2AAAA', '#A9C8F5', '#F5C2E7'];
export const hueFor = (s: string) => HUES[[...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length];
export function Avatar({ name, size = 40, ring }: { name: string; size?: number; ring?: string }) {
  const initials = (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?';
  return <span className="avatar" title={name} style={{ width: size, height: size, fontSize: size * 0.38, background: hueFor(name || '?'), ...(ring ? { boxShadow: `0 0 0 3px ${ring}` } : {}) }}>{initials}</span>;
}
export function Notice({ children, tone, icon }: React.PropsWithChildren<{ tone?: 'error' | 'info'; icon?: IconName }>) {
  return <div className={`notice ${tone || ''}`} role={tone === 'error' ? 'alert' : undefined}>{icon && <Icon name={icon} size={18} />}<div className="grow">{children}</div></div>;
}
export function Skeleton({ h = 20, w = '100%', r }: { h?: number; w?: number | string; r?: number }) { return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} />; }
export function Segments<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: React.ReactNode; dot?: boolean }[]; onChange: (v: T) => void; label: string }) {
  return <div className="seg" role="tablist" aria-label={label}>
    {options.map(o => <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}{o.dot && <span className="dot" />}</button>)}
  </div>;
}

/** A floating glass sheet. Escape and the backdrop close it; focus moves inside. */
export function Sheet({ title, sub, onClose, children, footer, wide, back }: React.PropsWithChildren<{ title: React.ReactNode; sub?: React.ReactNode; onClose: () => void; footer?: React.ReactNode; wide?: boolean; back?: () => void }>) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>('input, textarea, button:not([data-close])');
    (first || box.current)?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); prev?.focus?.(); };
    // Focus once when opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={box} className={`sheet ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} tabIndex={-1}>
      <div className="sheet-head">
        {back && <IconButton icon="back" label="Back" size="sm" variant="plain" onClick={back} />}
        <div className="grow"><h2 className="h2">{title}</h2>{sub && <p className="small muted">{sub}</p>}</div>
        <IconButton data-close icon="x" label="Close" size="sm" variant="plain" onClick={onClose} />
      </div>
      <div className="sheet-body">{children}</div>
      {footer && <div className="sheet-foot">{footer}</div>}
    </div>
  </div>;
}

type ToastOpts = { tone?: 'error' | 'info'; icon?: IconName; action?: { label: string; run: () => void }; ms?: number };
type ToastItem = ToastOpts & { id: number; text: string };
const ToastCtx = createContext<(text: string, opts?: ToastOpts) => void>(() => {});
export function ToastProvider({ children }: React.PropsWithChildren) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((text: string, opts: ToastOpts = {}) => {
    const id = Date.now() + Math.random();
    setItems(list => [...list.slice(-2), { id, text, ...opts }]);
    setTimeout(() => setItems(list => list.filter(t => t.id !== id)), opts.ms || (opts.tone === 'error' ? 5000 : 3200));
  }, []);
  return <ToastCtx.Provider value={show}>{children}
    <div className="toasts" aria-live="polite">{items.map(t => <div key={t.id} className={`toast ${t.tone || ''}`}>
      {t.icon && <Icon name={t.icon} size={18} />}<span>{t.text}</span>
      {t.action && <button onClick={() => { t.action!.run(); setItems(l => l.filter(x => x.id !== t.id)); }}>{t.action.label}</button>}
    </div>)}</div>
  </ToastCtx.Provider>;
}
export const useToast = () => useContext(ToastCtx);

type ConfirmOpts = { title: string; body?: string; confirmLabel: string; danger?: boolean };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export function ConfirmProvider({ children }: React.PropsWithChildren) {
  const [open, setOpen] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>(resolve => setOpen({ ...o, resolve })), []);
  const done = (v: boolean) => { open?.resolve(v); setOpen(null); };
  return <ConfirmCtx.Provider value={ask}>{children}
    {open && <Sheet title={open.title} onClose={() => done(false)} footer={<div className="row" style={{ justifyContent: 'flex-end' }}>
      <Button variant="secondary" onClick={() => done(false)}>Cancel</Button>
      <Button variant={open.danger ? 'danger' : 'primary'} onClick={() => done(true)}>{open.confirmLabel}</Button>
    </div>}>{open.body && <p className="muted">{open.body}</p>}</Sheet>}
  </ConfirmCtx.Provider>;
}
export const useConfirm = () => useContext(ConfirmCtx);

export const firstName = (name: string) => (name || '').split(' ')[0];
export function ago(t: number) { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; }
export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok; }
}
