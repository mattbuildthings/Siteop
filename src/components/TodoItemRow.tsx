import React, { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, CheckCircle2, Circle, Trash2, Calendar, Pencil, ExternalLink, History } from 'lucide-react';
import { TodoItem, TodoPriority, UserProfile } from '../lib/types';
import { displayName } from '../lib/session';
import { Badge } from './ui/Badge';

interface TodoItemRowProps {
  item: TodoItem;
  profiles: Record<string, UserProfile>;
  /** Week currently being viewed; differs from item.week_start on a carried-forward item. */
  viewedWeekStart: string;
  onToggleDone: (item: TodoItem) => void;
  onDueDateChange: (item: TodoItem, dueDate: string) => void;
  onTextChange: (item: TodoItem, text: string) => void;
  onDelete: (item: TodoItem) => void;
  onAssigneeChange: (item: TodoItem, userId: string | null) => void;
  onPriorityChange: (item: TodoItem, priority: TodoPriority) => void;
  onOpenEntry?: (entryId: string) => void;
  draggable?: boolean;
}

const PRIORITY_ORDER: TodoPriority[] = ['low', 'normal', 'high'];
const PRIORITY_LABEL: Record<TodoPriority, string> = { low: 'Thấp', normal: 'Vừa', high: 'Cao' };
const PRIORITY_TONE: Record<TodoPriority, 'neutral' | 'info' | 'danger'> = {
  low: 'neutral',
  normal: 'info',
  high: 'danger'
};

export const TodoItemRow: React.FC<TodoItemRowProps> = ({
  item,
  profiles,
  viewedWeekStart,
  onToggleDone,
  onDueDateChange,
  onTextChange,
  onDelete,
  onAssigneeChange,
  onPriorityChange,
  onOpenEntry,
  draggable = true
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !draggable
  });

  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(item.text);

  // Keep the draft in sync if the item's text changes from elsewhere (e.g. re-populate)
  useEffect(() => {
    if (!isEditing) setDraftText(item.text);
  }, [item.text, isEditing]);

  const commitEdit = () => {
    setIsEditing(false);
    const trimmed = draftText.trim();
    if (trimmed && trimmed !== item.text) {
      onTextChange(item, trimmed);
    } else {
      setDraftText(item.text);
    }
  };

  const cancelEdit = () => {
    setDraftText(item.text);
    setIsEditing(false);
  };

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const priority: TodoPriority = item.priority ?? 'normal';
  const cyclePriority = () => {
    const next = PRIORITY_ORDER[(PRIORITY_ORDER.indexOf(priority) + 1) % PRIORITY_ORDER.length];
    onPriorityChange(item, next);
  };

  const carriedOver = !item.is_done && item.week_start !== viewedWeekStart;
  const teamList = Object.values(profiles);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col gap-1.5 p-2.5 rounded-[12px] border border-border text-xs transition ${
        item.is_done ? 'bg-surface opacity-60' : 'bg-card'
      }`}
    >
      {/* Top Row: Actions, Checkbox, Text & Delete */}
      <div className="flex items-center gap-2">
        {draggable ? (
          <button
            {...attributes}
            {...listeners}
            className="icon-btn icon-btn-sm text-ink-soft hover:text-ink cursor-grab active:cursor-grabbing shrink-0 touch-none"
            aria-label="Kéo để sắp xếp"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}

        <button
          onClick={() => onToggleDone(item)}
          className="shrink-0 text-ink-soft hover:text-accent transition cursor-pointer"
          aria-label={item.is_done ? 'Đánh dấu chưa xong' : 'Đánh dấu đã xong'}
        >
          {item.is_done ? (
            <CheckCircle2 className="w-4.5 h-4.5 text-accent" />
          ) : (
            <Circle className="w-4.5 h-4.5" />
          )}
        </button>

        {isEditing ? (
          <textarea
            autoFocus
            rows={2}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commitEdit();
              } else if (e.key === 'Escape') {
                cancelEdit();
              }
            }}
            className="flex-1 bg-paper border border-border-subtle rounded-[8px] px-2 py-1 text-xs text-ink focus:outline-none focus:border-accent resize-none"
          />
        ) : (
          <p
            onClick={() => setIsEditing(true)}
            className={`flex-1 leading-snug cursor-text ${
              item.is_done ? 'text-ink-faint line-through' : 'text-ink'
            }`}
          >
            {item.text}
          </p>
        )}

        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="shrink-0 icon-btn icon-btn-sm text-ink-soft hover:text-ink transition cursor-pointer"
            aria-label="Sửa nội dung"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}

        {item.entry_id && onOpenEntry && (
          <button
            onClick={() => onOpenEntry(item.entry_id!)}
            className="shrink-0 icon-btn icon-btn-sm text-ink-soft hover:text-accent transition cursor-pointer"
            aria-label="Xem nhật ký gốc"
            title="Xem nhật ký gốc"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={() => onDelete(item)}
          className="shrink-0 icon-btn icon-btn-sm text-ink-soft hover:text-danger transition cursor-pointer"
          aria-label="Xóa mục"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Bottom rows: carry-forward badge, due date, priority, assignee, job number */}
      {carriedOver && (
        <div className="pl-8">
          <Badge tone="warning" className="gap-1 !h-auto !px-2 !py-0.5 !normal-case !tracking-normal">
            <History className="w-3 h-3" /> Mang từ tuần trước
          </Badge>
        </div>
      )}

      <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5 pl-8 pr-1 pt-1 border-t border-border/40 text-xs">
        <div className="flex items-center gap-1.5 text-ink-soft">
          <Calendar className="w-3.5 h-3.5 text-ink-soft" />
          <input
            type="date"
            value={item.due_date || ''}
            onChange={(e) => onDueDateChange(item, e.target.value)}
            className="bg-transparent text-xs text-ink focus:outline-none w-[95px] cursor-pointer"
          />
        </div>

        <button onClick={cyclePriority} className="cursor-pointer" title="Đổi mức độ ưu tiên">
          <Badge tone={PRIORITY_TONE[priority]} className="!h-auto !px-2 !py-0.5 !normal-case !tracking-normal">
            {PRIORITY_LABEL[priority]}
          </Badge>
        </button>

        <select
          value={item.assignee_id || ''}
          onChange={(e) => onAssigneeChange(item, e.target.value || null)}
          className="bg-transparent text-xs text-ink-soft focus:outline-none cursor-pointer max-w-[110px]"
          title="Người phụ trách"
        >
          <option value="">Chưa giao</option>
          {teamList.map((p) => (
            <option key={p.user_id} value={p.user_id}>
              {displayName(p)}
            </option>
          ))}
        </select>

        {item.job_number && (
          <Badge
            tone="primary"
            className="!h-auto !px-2 !py-0.5 font-mono !normal-case tracking-wider shrink-0 ml-auto"
            title="Mã công việc"
          >
            {item.job_number}
          </Badge>
        )}
      </div>
    </div>
  );
};
