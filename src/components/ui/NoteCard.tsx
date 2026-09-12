import React from 'react';
import { Camera, Mic } from 'lucide-react';

/** Ported from .claude/skills/site-ops-design/components/notes/NoteCard.jsx. */
export interface NoteCardProps {
  type?: 'photo' | 'audio';
  thumbnail?: string;
  title: React.ReactNode;
  timestamp: string;
  author: string;
  synced?: boolean;
}

export const NoteCard: React.FC<NoteCardProps> = ({
  type = 'photo',
  thumbnail,
  title,
  timestamp,
  author,
  synced = true
}) => (
  <div className="flex gap-3 p-3 bg-surface border border-border rounded-[8px]">
    <div className="w-14 h-14 rounded-[4px] bg-card-alt shrink-0 flex items-center justify-center text-ink-faint overflow-hidden">
      {thumbnail ? (
        <img src={thumbnail} className="w-full h-full object-cover" alt="" />
      ) : type === 'audio' ? (
        <Mic className="w-5 h-5" />
      ) : (
        <Camera className="w-5 h-5" />
      )}
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-semibold text-ink truncate">{title}</div>
      <div className="text-xs text-ink-soft font-mono mt-0.5">
        {timestamp} · {author}
      </div>
    </div>
    <div className={'text-[11px] font-semibold self-start shrink-0 ' + (synced ? 'text-positive' : 'text-warning')}>
      {synced ? 'ĐÃ ĐỒNG BỘ' : 'CHỜ ĐỒNG BỘ'}
    </div>
  </div>
);
