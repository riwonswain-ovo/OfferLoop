'use client';

import * as React from 'react';
import { Paperclip } from 'lucide-react';
import { toast } from 'sonner';

import { useTiptapEditor } from '@/components/business-ui/tiptap-editor/hooks/use-tiptap-editor';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface AttachmentToolbarButtonProps {
  accept?: string;
}

export function AttachmentToolbarButton({
  accept,
}: AttachmentToolbarButtonProps) {
  const { editor } = useTiptapEditor();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  if (!editor) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const ok = editor
      .chain()
      .focus()
      .insertAttachments(Array.from(files))
      .run();
    if (!ok) {
      toast.error('插入附件失败（请确认 attachment 扩展已启用且提供 upload）');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={700}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="size-6 px-0"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="size-4" />
            <span className="sr-only">上传附件</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>上传附件</p>
        </TooltipContent>
      </Tooltip>
      <input
        type="file"
        multiple
        accept={accept}
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileChange}
      />
    </TooltipProvider>
  );
}
