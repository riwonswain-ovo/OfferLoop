import * as React from 'react';
import { mergeAttributes, Node, type CommandProps } from '@tiptap/core';
import { type Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';
import { CircleAlert, DownloadIcon, EyeIcon, Trash2Icon } from 'lucide-react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';

import { uploadFile } from '@/components/business-ui/api/files/service';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { FileAeColorfulIcon } from '@/components/ui/icons/file-ae-colorful-icon';
import { FileAiColorfulIcon } from '@/components/ui/icons/file-ai-colorful-icon';
import { FileAudioColorfulIcon } from '@/components/ui/icons/file-audio-colorful-icon';
import { FileCodeColorfulIcon } from '@/components/ui/icons/file-code-colorful-icon';
import { FileCsvColorfulIcon } from '@/components/ui/icons/file-csv-colorful-icon';
import { FileKeynoteColorfulIcon } from '@/components/ui/icons/file-keynote-colorful-icon';
import { FilePagesColorfulIcon } from '@/components/ui/icons/file-pages-colorful-icon';
import { FilePsColorfulIcon } from '@/components/ui/icons/file-ps-colorful-icon';
import { FileSketchColorfulIcon } from '@/components/ui/icons/file-sketch-colorful-icon';
import { FileWikiExcelColorfulIcon } from '@/components/ui/icons/file-wiki-excel-colorful-icon';
import { FileWikiImageColorfulIcon } from '@/components/ui/icons/file-wiki-image-colorful-icon';
import { FileWikiPdfColorfulIcon } from '@/components/ui/icons/file-wiki-pdf-colorful-icon';
import { FileWikiPptColorfulIcon } from '@/components/ui/icons/file-wiki-ppt-colorful-icon';
import { FileWikiTextColorfulIcon } from '@/components/ui/icons/file-wiki-text-colorful-icon';
import { FileWikiUnknownColorfulIcon } from '@/components/ui/icons/file-wiki-unknown-colorful-icon';
import { FileWikiVideoColorfulIcon } from '@/components/ui/icons/file-wiki-video-colorful-icon';
import { FileWikiWordColorfulIcon } from '@/components/ui/icons/file-wiki-word-colorful-icon';
import { FileWikiZipColorfulIcon } from '@/components/ui/icons/file-wiki-zip-colorful-icon';
import { Spinner } from '@/components/ui/spinner';

export interface AttachmentAttributes {
  url: string;
  fileName?: string;
  fileSize?: string;
  fileType?: string;
  fileExt?: string;
  uploadId?: string | null;
}

export type AttachmentUploadFn = (file: File) => Promise<string>;

export interface AttachmentExtensionOptions {
  upload?: AttachmentUploadFn;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    attachment: {
      setAttachment: (attributes: AttachmentAttributes) => ReturnType;
      insertAttachments: (files: File[]) => ReturnType;
    };
  }
}

function findAttachmentByUploadId(doc: ProseMirrorNode, uploadId: string) {
  let foundPos: number | null = null;
  doc.descendants((node: ProseMirrorNode, pos: number) => {
    if (foundPos != null) return false;
    if (node.type?.name === 'attachment' && node.attrs?.uploadId === uploadId) {
      foundPos = pos;
      return false;
    }
    return true;
  });
  return foundPos;
}

function fileToAttachmentAttributes(
  file: File,
  uploadId: string,
): AttachmentAttributes {
  const fileSize = (file.size / 1024).toFixed(2) + ' KB';
  const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
  const fileName = fileExt
    ? file.name.slice(0, -(fileExt.length + 1))
    : file.name;
  const fileType = file.type || fileExt || '';

  return {
    url: '',
    fileName,
    fileExt,
    fileSize,
    fileType,
    uploadId,
  };
}

function withDownloadParam(url: string) {
  // blob URL 追加 search 会导致地址失效
  if (url.startsWith('blob:')) return url;

  try {
    const u = new URL(url, window.location.href);
    u.searchParams.set('download', 'true');
    return u.toString();
  } catch {
    return url;
  }
}

function getFileIcon(fileType?: string) {
  if (!fileType) return FileWikiUnknownColorfulIcon;

  const type = fileType.toLowerCase();

  switch (type) {
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'svg':
    case 'webp':
      return FileWikiImageColorfulIcon;
    case 'mp4':
    case 'webm':
    case 'mov':
      return FileWikiVideoColorfulIcon;
    case 'mp3':
    case 'wav':
    case 'ogg':
      return FileAudioColorfulIcon;
    case 'pdf':
      return FileWikiPdfColorfulIcon;
    case 'doc':
    case 'docx':
    case 'rtf':
      return FileWikiWordColorfulIcon;
    case 'xls':
    case 'xlsx':
      return FileWikiExcelColorfulIcon;
    case 'csv':
      return FileCsvColorfulIcon;
    case 'ppt':
    case 'pptx':
      return FileWikiPptColorfulIcon;
    case 'txt':
    case 'md':
      return FileWikiTextColorfulIcon;
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return FileWikiZipColorfulIcon;
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
    case 'html':
    case 'css':
    case 'json':
    case 'py':
    case 'java':
    case 'c':
    case 'cpp':
    case 'go':
    case 'rs':
    case 'php':
      return FileCodeColorfulIcon;
    case 'ai':
      return FileAiColorfulIcon;
    case 'psd':
    case 'ps':
      return FilePsColorfulIcon;
    case 'ae':
      return FileAeColorfulIcon;
    case 'sketch':
      return FileSketchColorfulIcon;
    case 'key':
    case 'keynote':
      return FileKeynoteColorfulIcon;
    case 'pages':
      return FilePagesColorfulIcon;
    default:
      return FileWikiUnknownColorfulIcon;
  }
}

function AttachmentNodeView(props: NodeViewProps) {
  const { url, fileName, fileExt, fileSize, fileType, uploadId } = props.node
    .attrs as AttachmentAttributes;

  const uploading = Boolean(uploadId);

  const effectiveUrl = url || '';
  const displayName =
    fileName ||
    (effectiveUrl ? effectiveUrl.split('/').pop() : '') ||
    'Untitled';
  const displayExt = fileExt || '';

  const iconComponent = getFileIcon(displayExt || fileType);

  const deleteNode = () => {
    props.deleteNode();
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!effectiveUrl || uploading) return;

    const downloadUrl = withDownloadParam(effectiveUrl);

    const filename =
      displayName + (displayExt ? `.${displayExt}` : '') || '附件';

    try {
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      window.open(downloadUrl, '_blank');
    }
  };

  const handlePreview = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!effectiveUrl || uploading) return;
    window.open(effectiveUrl, '_blank');
  };

  const highlighted = props.selected;
  const error = !uploading && !effectiveUrl;

  return (
    <NodeViewWrapper className="my-3 select-none">
      <div
        aria-invalid={error || undefined}
        className={cn(
          'relative flex w-full items-center gap-2 rounded-md border bg-card px-3 py-2 text-card-foreground transition-colors',
          uploading && 'opacity-70',
          'hover:border-primary aria-invalid:border-destructive aria-invalid:hover:border-destructive',
          highlighted && 'border-primary',
        )}
      >
        <div className="flex shrink-0 items-center justify-center text-muted-foreground">
          {React.createElement(iconComponent, {
            className: 'size-6',
            strokeWidth: 1.5,
          })}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="truncate text-sm/[22px] font-normal text-foreground">
            {displayName}
            {displayExt ? `.${displayExt}` : ''}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {fileSize || 'Unknown size'}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {uploading ? (
            <div className="flex items-center">
              <Spinner className="text-muted-foreground" />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {error ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="附件不可用"
                  title="附件不可用"
                  onClick={() => {
                    toast.error('该附件链接缺失，请重新上传');
                  }}
                >
                  <CircleAlert className="size-4 text-destructive" />
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handlePreview}
                    disabled={!effectiveUrl}
                    aria-label="预览"
                    title="预览"
                  >
                    <EyeIcon className="size-4" />
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleDownload}
                    disabled={!effectiveUrl}
                    aria-label="下载"
                    title="下载"
                  >
                    <DownloadIcon className="size-4" />
                  </Button>
                </>
              )}

              {props.editor.isEditable && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={deleteNode}
                  aria-label="删除"
                  title="删除"
                >
                  <Trash2Icon className="size-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const Attachment = Node.create<AttachmentExtensionOptions>({
  name: 'attachment',
  group: 'block',
  atom: true,

  addOptions() {
    return {
      upload: async (file: File) => {
        const data = await uploadFile(file);
        return data.url;
      },
    };
  },

  addAttributes() {
    return {
      url: {
        default: null,
        parseHTML: (element) => {
          return element.getAttribute('data-url') || null;
        },
        renderHTML: (attributes) => {
          return {
            'data-url': attributes.url || null,
          };
        },
      },
      fileName: {
        default: null,
        parseHTML: (element) => {
          return element.getAttribute('data-file-name') || null;
        },
        renderHTML: (attributes) => {
          return {
            'data-file-name': attributes.fileName || null,
          };
        },
      },
      fileSize: {
        default: null,
        parseHTML: (element) => {
          return element.getAttribute('data-file-size') || null;
        },
        renderHTML: (attributes) => {
          return {
            'data-file-size': attributes.fileSize || null,
          };
        },
      },
      fileType: {
        default: null,
        parseHTML: (element) => {
          return element.getAttribute('data-file-type') || null;
        },
        renderHTML: (attributes) => {
          return {
            'data-file-type': attributes.fileType || null,
          };
        },
      },
      fileExt: {
        default: null,
        parseHTML: (element) => {
          return element.getAttribute('data-file-ext') || null;
        },
        renderHTML: (attributes) => {
          return {
            'data-file-ext': attributes.fileExt || null,
          };
        },
      },
      uploadId: {
        default: null,
        rendered: false,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="attachment"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as AttachmentAttributes;
    const url = attrs.url || '';
    const fileName = attrs.fileName || '';
    const fileExt = attrs.fileExt || '';
    const fileSize = attrs.fileSize || '';

    const displayTitle =
      fileName + (fileExt ? `.${fileExt}` : '') || 'Attachment';

    const meta = fileSize;

    const merged = mergeAttributes(HTMLAttributes, {
      'data-type': 'attachment',
      title: displayTitle,
    });

    if (!url) {
      return ['div', merged];
    }

    return [
      'div',
      merged,
      [
        'a',
        {
          href: url,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        ['span', {}, displayTitle],
        meta ? ['span', {}, ` (${meta})`] : '',
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentNodeView);
  },

  addCommands() {
    return {
      setAttachment:
        (attributes: AttachmentAttributes) =>
        ({ commands }: CommandProps) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },

      insertAttachments:
        (files: File[]) =>
        ({ editor, commands }: CommandProps) => {
          if (!files || files.length === 0) return false;

          const upload = this.options.upload;
          if (!upload) return false;

          const uploads = files.map((file) => {
            const uploadId = nanoid();
            return {
              file,
              uploadId,
              attrs: fileToAttachmentAttributes(file, uploadId),
            };
          });

          // 一次性插入多个节点，避免 NodeSelection 导致后续插入替换掉前一个节点
          const inserted = commands.insertContent([
            ...uploads.map(({ attrs }) => ({
              type: this.name,
              attrs,
            })),
            { type: 'paragraph' },
          ]);

          // 并发上传：不阻塞命令返回
          void Promise.all(
            uploads.map(async ({ file, uploadId }) => {
              try {
                const url = await upload(file);

                // Ensure state is settled.
                await new Promise((resolve) => requestAnimationFrame(resolve));

                const pos = findAttachmentByUploadId(
                  editor.state.doc,
                  uploadId,
                );
                if (pos == null) return;

                const node = editor.state.doc.nodeAt(pos);
                if (!node || node.type.name !== this.name) return;

                editor
                  .chain()
                  .command(({ tr }) => {
                    tr.setNodeMarkup(pos, undefined, {
                      ...node.attrs,
                      url,
                      uploadId: null,
                    });
                    return true;
                  })
                  .run();
              } catch {
                const pos = findAttachmentByUploadId(
                  editor.state.doc,
                  uploadId,
                );
                if (pos != null) {
                  editor
                    .chain()
                    .deleteRange({ from: pos, to: pos + 1 })
                    .run();
                }
              }
            }),
          );

          return inserted;
        },
    };
  },
});
