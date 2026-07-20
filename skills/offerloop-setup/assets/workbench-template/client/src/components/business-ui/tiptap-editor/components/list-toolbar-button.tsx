'use client';

import { Check, ChevronDown, List, ListOrdered, ListTodo } from 'lucide-react';

import { useTiptapEditor } from '@/components/business-ui/tiptap-editor/hooks/use-tiptap-editor';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const LIST_OPTIONS = [
  { type: 'bulletList', label: '无序列表', icon: List },
  { type: 'orderedList', label: '有序列表', icon: ListOrdered },
  { type: 'taskList', label: '任务列表', icon: ListTodo },
] as const;

export function ListToolbarButton() {
  const { editor } = useTiptapEditor();

  if (!editor) return null;

  const handleSelect = (type: string) => {
    switch (type) {
      case 'bulletList':
        editor.chain().focus().toggleBulletList().run();
        break;
      case 'orderedList':
        editor.chain().focus().toggleOrderedList().run();
        break;
      case 'taskList':
        editor.chain().focus().toggleTaskList().run();
        break;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 gap-0.5 px-2">
          <List className="size-4" />
          <ChevronDown className="size-3.5 text-muted-foreground" />
          <span className="sr-only">列表</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-50"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {LIST_OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = editor.isActive(option.type);

          return (
            <DropdownMenuItem
              key={option.type}
              onClick={() => handleSelect(option.type)}
              className={cn('justify-between', active && 'bg-accent')}
            >
              <span className="flex items-center gap-2">
                <Icon className="size-4" />
                {option.label}
              </span>
              {active && <Check className="size-4" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
