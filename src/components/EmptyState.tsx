// First-run and empty screens: never a blank page. A row of faded "ghost" posters shows what will be here,
// with one clear next step on top.
import React from 'react';
import { OrbitArt } from './CoverArt';

export function GhostPosters({ names, square }: { names: string[]; square?: boolean }) {
  return <div className="ghosts" aria-hidden="true">
    {names.map((n, i) => <div key={n} className={`ghost-poster ${square ? 'square' : ''}`} style={{ animationDelay: `${i * 0.8}s` }}><OrbitArt name={n} /><span className="ghost-title">{n}</span></div>)}
  </div>;
}

export function EmptyState({ title, body, actions, ghosts, square }: { title: React.ReactNode; body: React.ReactNode; actions?: React.ReactNode; ghosts: string[]; square?: boolean }) {
  return <div className="empty-state glass window">
    <GhostPosters names={ghosts} square={square} />
    <div className="empty-copy">
      <h2 className="featured-title" style={{ fontSize: 'clamp(28px, 3.4vw, 40px)' }}>{title}</h2>
      <p className="muted" style={{ maxWidth: 46 + 'ch' }}>{body}</p>
      {actions && <div className="row gap-8 wrap">{actions}</div>}
    </div>
  </div>;
}
