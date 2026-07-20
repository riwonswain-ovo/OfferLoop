'use client';

import * as React from 'react';
import { mergeAttributes, type CommandProps } from '@tiptap/core';
import TiptapImage from '@tiptap/extension-image';
import { type Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';
import { nanoid } from 'nanoid';

import { uploadFile } from '@/components/business-ui/api/files/service';
import { cn } from '@/lib/utils';

export interface ImageAttrs {
  src: string;
  alt?: string;
  title?: string;
  width?: number | string | null;
  height?: number | null;
  uploadId?: string | null;
}

export type ImageUploadFn = (file: File) => Promise<string>;

export interface ImageOptions {
  upload?: ImageUploadFn;
  HTMLAttributes?: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageUpload: {
      insertImages: (files: File[]) => ReturnType;
    };
  }
}

function findImageByUploadId(doc: ProseMirrorNode, uploadId: string) {
  let foundPos: number | null = null;
  doc.descendants((node: ProseMirrorNode, pos: number) => {
    if (foundPos != null) return false;
    if (node.type?.name === 'image' && node.attrs?.uploadId === uploadId) {
      foundPos = pos;
      return false;
    }
    return true;
  });
  return foundPos;
}

function clampSize(value: number, { min, max }: { min: number; max: number }) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function ImageNodeView(props: NodeViewProps) {
  const { editor, selected } = props;
  const attrs = props.node.attrs as ImageAttrs;
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const imgRef = React.useRef<HTMLImageElement>(null);
  const [naturalRatio, setNaturalRatio] = React.useState<number | null>(null);

  const isEditable = editor.isEditable;

  // 计算宽高比：优先使用属性中的宽高，否则使用自然宽高比
  const aspectRatio =
    typeof attrs.width === 'number' && attrs.height
      ? attrs.width / attrs.height
      : naturalRatio;

  const style = React.useMemo<React.CSSProperties>(() => {
    if (attrs.width === '100%') {
      return {
        width: '100%',
        height: 'auto',
      };
    }
    if (typeof attrs.width === 'number' && attrs.height) {
      return {
        width: `${attrs.width}px`,
        aspectRatio: `${attrs.width} / ${attrs.height}`,
      };
    }
    return {};
  }, [attrs.width, attrs.height]);

  const startResize = React.useCallback(
    (corner: 'nw' | 'ne' | 'sw' | 'se') =>
      (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!isEditable) return;
        e.preventDefault();
        e.stopPropagation();

        const img = imgRef.current;
        const wrapper = wrapperRef.current;
        if (!img || !wrapper) return;

        const rect = img.getBoundingClientRect();
        const startWidth = rect.width;
        const startHeight = rect.height;

        const ratio =
          aspectRatio ?? (startHeight ? startWidth / startHeight : null);
        if (!ratio) return;

        const startX = e.clientX;
        const startY = e.clientY;

        const containerWidth = wrapper.parentElement?.clientWidth ?? rect.width;
        const minWidth = 80;

        const onMove = (ev: PointerEvent) => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;

          // 保持宽高比
          // 根据角落方向调整宽度
          let nextWidth = startWidth;
          if (corner === 'ne' || corner === 'se') {
            nextWidth = startWidth + dx;
          } else {
            nextWidth = startWidth - dx;
          }

          // 允许垂直拖拽调整大小，根据角落映射 dy 到宽度变化
          const dyAsWidth = dy * ratio;
          if (corner === 'se' || corner === 'sw') {
            nextWidth =
              Math.abs(dyAsWidth) > Math.abs(dx)
                ? startWidth + dyAsWidth
                : nextWidth;
          } else {
            nextWidth =
              Math.abs(dyAsWidth) > Math.abs(dx)
                ? startWidth - dyAsWidth
                : nextWidth;
          }

          nextWidth = clampSize(nextWidth, {
            min: minWidth,
            max: containerWidth,
          });

          const nextHeight = nextWidth / ratio;

          // 如果接近容器宽度，吸附到 100%
          if (Math.abs(containerWidth - nextWidth) < 10) {
            props.updateAttributes({
              width: '100%',
              height: null,
            });
            return;
          }

          props.updateAttributes({
            width: Math.round(nextWidth),
            height: Math.round(nextHeight),
          });
        };

        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      },
    [aspectRatio, isEditable, props],
  );

  return (
    <NodeViewWrapper
      className={cn('not-prose my-3 flex justify-center')}
      data-type="image-block"
    >
      <div
        ref={wrapperRef}
        className={cn(
          'relative inline-block max-w-full rounded-md',
          selected && isEditable ? 'ring-2 ring-ring/50' : '',
        )}
        style={style}
        contentEditable={false}
      >
        <img
          ref={imgRef}
          src={attrs.src}
          alt={attrs.alt ?? ''}
          title={attrs.title}
          className={cn('block size-full rounded-md object-cover')}
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              setNaturalRatio(img.naturalWidth / img.naturalHeight);
            }
          }}
        />

        {attrs.uploadId ? (
          <>
            <div className="pointer-events-none absolute inset-0 rounded-md bg-black/25" />
            <div className="pointer-events-none absolute top-2 right-2 flex items-center gap-1 rounded-md bg-primary-foreground/20 px-2 py-1 text-sm/5 text-primary-foreground">
              <span
                className="size-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent"
                aria-hidden="true"
              />
              <span className="sr-only">图片上传中</span>
            </div>
          </>
        ) : null}

        {selected && isEditable && (
          <>
            <ResizeHandle corner="nw" onPointerDown={startResize('nw')} />
            <ResizeHandle corner="ne" onPointerDown={startResize('ne')} />
            <ResizeHandle corner="sw" onPointerDown={startResize('sw')} />
            <ResizeHandle corner="se" onPointerDown={startResize('se')} />
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

function ResizeHandle({
  corner,
  onPointerDown,
}: {
  corner: 'nw' | 'ne' | 'sw' | 'se';
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const positionClass =
    corner === 'nw'
      ? '-left-1.5 -top-1.5'
      : corner === 'ne'
        ? '-right-1.5 -top-1.5'
        : corner === 'sw'
          ? '-left-1.5 -bottom-1.5'
          : '-right-1.5 -bottom-1.5';

  const cursorClass =
    corner === 'nw' || corner === 'se'
      ? 'cursor-nwse-resize'
      : 'cursor-nesw-resize';

  const label =
    corner === 'nw'
      ? 'Resize image from top-left'
      : corner === 'ne'
        ? 'Resize image from top-right'
        : corner === 'sw'
          ? 'Resize image from bottom-left'
          : 'Resize image from bottom-right';

  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'absolute z-10 flex size-2.5 items-center justify-center rounded-full border border-primary bg-background shadow-sm',
        cursorClass,
        positionClass,
      )}
      onPointerDown={onPointerDown}
    />
  );
}

export const Image = TiptapImage.extend<ImageOptions>({
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
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const styleWidth = element.style?.width;
          if (styleWidth && styleWidth.trim().endsWith('%')) {
            return styleWidth.trim();
          }

          const rawWidth = element.getAttribute('width');
          if (!rawWidth) return null;
          if (rawWidth.trim().endsWith('%')) return rawWidth.trim();

          const parsed = Number.parseInt(rawWidth, 10);
          return Number.isFinite(parsed) ? parsed : null;
        },
        renderHTML: (attributes) => {
          const width = attributes.width;
          if (!width) return {};
          if (width === '100%') {
            return {
              style: 'width: 100%; height: auto;',
            };
          }
          if (typeof width === 'number') {
            return { width: String(width) };
          }
          return {
            style: `width: ${String(width)}; height: auto;`,
          };
        },
      },
      height: {
        default: null,
        parseHTML: (element) => {
          const rawHeight = element.getAttribute('height');
          if (!rawHeight) return null;
          const parsed = Number.parseInt(rawHeight, 10);
          return Number.isFinite(parsed) ? parsed : null;
        },
        renderHTML: (attributes) => {
          const height = attributes.height;
          if (!height) return {};
          return { height: String(height) };
        },
      },
      uploadId: {
        default: null,
        rendered: false,
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    // Width/height serialization happens via addAttributes().
    // We intentionally do not put layout classes on the wrapper; consumers can style by data-type.
    return [
      'div',
      {
        'data-type': 'image-block',
      },
      [
        'img',
        mergeAttributes(
          this.options.HTMLAttributes ?? {},
          Object.fromEntries(Object.entries(HTMLAttributes)),
        ),
      ],
    ];
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="image-block"] img[src]',
      },
      {
        tag: 'img[src]:not([src^="data:"])',
      },
    ];
  },

  addCommands() {
    return {
      ...this.parent?.(),
      insertImages:
        (files: File[]) =>
        ({ editor, commands }: CommandProps) => {
          if (!files || files.length === 0) return false;

          const upload = this.options.upload;
          if (!upload) return false;

          const uploads = files.map((file) => {
            const uploadId = nanoid();
            const previewUrl = URL.createObjectURL(file);

            return {
              file,
              uploadId,
              previewUrl,
            };
          });

          // 一次性插入多个节点，避免 NodeSelection 导致后续插入替换掉前一个节点
          const inserted = commands.insertContent([
            ...uploads.map(({ uploadId, previewUrl }) => ({
              type: this.name,
              attrs: {
                src: previewUrl,
                uploadId,
              },
            })),
            { type: 'paragraph' },
          ]);

          // 并发上传：不阻塞命令返回
          void Promise.all(
            uploads.map(async ({ file, uploadId, previewUrl }) => {
              try {
                const url = await upload(file);

                // Ensure state is settled
                await new Promise((resolve) => requestAnimationFrame(resolve));

                const pos = findImageByUploadId(editor.state.doc, uploadId);
                if (pos == null) return;

                const node = editor.state.doc.nodeAt(pos);
                if (!node || node.type.name !== this.name) return;

                editor
                  .chain()
                  .command(({ tr }: CommandProps) => {
                    tr.setNodeMarkup(pos, undefined, {
                      ...node.attrs,
                      src: url,
                      uploadId: null,
                    });
                    return true;
                  })
                  .run();
              } catch {
                const pos = findImageByUploadId(editor.state.doc, uploadId);
                if (pos != null) {
                  editor
                    .chain()
                    .deleteRange({ from: pos, to: pos + 1 })
                    .run();
                }
              } finally {
                if (previewUrl.startsWith('blob:')) {
                  try {
                    URL.revokeObjectURL(previewUrl);
                  } catch {
                    // ignore
                  }
                }
              }
            }),
          );

          return inserted;
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});
