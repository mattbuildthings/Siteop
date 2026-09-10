import React, { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, CheckCircle2, Circle, Trash2, Calendar, Pencil } from 'lucide-react';
import { TodoItem } from '../lib/types';

interface TodoItemRowProps {
  item: TodoItem;
  onToggleDone: (item: TodoItem) => void;
  onDueDateChange: (item: TodoItem, dueDate: string) => void;
  onTextChange: (item: TodoItem, text: string) => void;
  onDelete: (item: TodoItem) => void;
  draggable?: boolean;
}

export const TodoItemRow: React.FC<TodoItemRowProps> = ({
  item,
  onToggleDone,
  onDueDateChange,
  onTextChange,
  onDelete,
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

        <button
          onClick={() => onDelete(item)}
          className="shrink-0 icon-btn icon-btn-sm text-ink-soft hover:text-danger transition cursor-pointer"
          aria-label="Xóa mục"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Bottom Row: Due date on the left, Job Number on the bottom right */}
      <div className="flex items-center justify-between pl-8 pr-1 pt-1 border-t border-border/40 text-xs">
        <div className="flex items-center gap-1.5 text-ink-soft">
          <Calendar className="w-3.5 h-3.5 text-ink-soft" />
          <input
            type="date"
            value={item.due_date || ''}
            onChange={(e) => onDueDateChange(item, e.target.value)}
            className="bg-transparent text-xs text-ink focus:outline-none w-[95px] cursor-pointer"
          />
        </div>

        {item.job_number && (
          <span
            className="font-mono text-xs font-bold text-accent bg-paper px-2 py-0.5 rounded-[6px] border border-border shrink-0 tracking-wider"
            title="Mã công việc"
          >
            {item.job_number}
          </span>
        )}
      </div>
    </div>
  );
};
