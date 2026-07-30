import React, { useEffect, useMemo, useRef, useState } from 'react';
import SHA1 from 'crypto-js/sha1';
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';

import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type { UserProfileData } from '@lark-apaas/client-toolkit/tools/services';

import type {
  WorkbenchWikiComponentAuth,
  WorkbenchWikiComponentAuthResponse,
  WorkbenchWikiDocumentPreviewResponse,
  WorkbenchWikiNode,
} from '@shared/api.interface';

import {
  getWorkbenchWikiComponentAuth,
  getWorkbenchWikiDocumentPreview,
} from '@client/src/api';
import { fetchUserProfile } from '@client/src/components/business-ui/api/user-profiles/service';
import { useExternalScript } from '@client/src/lib/external-script';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@client/src/components/ui/alert';
import { Button } from '@client/src/components/ui/button';

const LARK_DOC_COMPONENT_SDK =
  'https://sf1-scmcdn-cn.feishucdn.com/obj/feishu-static/' +
  'docComponentSdk/lib/1.0.13.js';

interface DocComponentSdkOptions {
  src: string;
  mount: HTMLElement;
  auth: WorkbenchWikiComponentAuth;
  config: {
    extensions: Record<string, unknown>;
  };
  size: {
    width: string;
    height: string;
  };
  onAuthError: (error: unknown) => void;
  onError: (error: unknown) => void;
  onMountSuccess: () => void;
  onMountTimeout: () => void;
}

interface DocComponentSdkInstance {
  start: () => Promise<void>;
  destroy: () => void;
}

interface DocComponentSdkConstructor {
  new (options: DocComponentSdkOptions): DocComponentSdkInstance;
}

declare global {
  var DocComponentSdk: DocComponentSdkConstructor | undefined;
}

interface WorkbenchWikiDocumentProps {
  node: WorkbenchWikiNode;
  onBack: () => void;
}

const createNonce = (length: number): string => {
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let index = 0; index < length; index += 1) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

const summarizeComponentError = (value: unknown): string => {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  if (typeof value !== 'object' || value === null) {
    return String(value);
  }

  const error = value as Record<string, unknown>;
  const safeFields = ['code', 'msg', 'message', 'type', 'reason'];
  const summary: Record<string, string | number | boolean | null> = {};
  for (const field of safeFields) {
    const fieldValue = error[field];
    if (fieldValue === null) {
      summary[field] = null;
    } else if (
      typeof fieldValue === 'string'
      || typeof fieldValue === 'number'
      || typeof fieldValue === 'boolean'
    ) {
      summary[field] = fieldValue;
    }
  }
  return Object.keys(summary).length > 0
    ? JSON.stringify(summary)
    : Object.prototype.toString.call(value);
};

const WorkbenchWikiDocument: React.FC<WorkbenchWikiDocumentProps> = ({
  node,
  onBack,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const embedFailureHandledRef = useRef<boolean>(false);
  const previewRequestIdRef = useRef<number>(0);
  const userInfo = useCurrentUserProfile();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [authorizationUrl, setAuthorizationUrl] = useState<string>('');
  const [retryCount, setRetryCount] = useState<number>(0);
  const [embedEnabled, setEmbedEnabled] = useState<boolean>(
    Boolean(node.documentUrl),
  );
  const [preview, setPreview] =
    useState<WorkbenchWikiDocumentPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string>('');
  const scriptOptions = useMemo(() => ({}), []);
  const docsPocEnabled = useMemo(
    (): boolean =>
      new URLSearchParams(globalThis.location.search).get('docsPoc') === '1',
    [],
  );
  const componentUserId = docsPocEnabled ? '' : (userInfo?.user_id ?? '');
  const scriptStatus = useExternalScript(LARK_DOC_COMPONENT_SDK, scriptOptions);

  useEffect(() => {
    embedFailureHandledRef.current = false;
    previewRequestIdRef.current += 1;
    setPreview(null);
    setPreviewError('');
    setPreviewLoading(false);
    setAuthorizationUrl('');
    setError('');
    setLoading(Boolean(node.documentUrl));
    setEmbedEnabled(Boolean(node.documentUrl));
  }, [node.documentUrl, node.nodeToken]);

  useEffect(() => {
    if (node.objectType !== 'docx' || embedEnabled) {
      return;
    }

    const requestId: number = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    setPreview(null);
    setPreviewError('');
    setPreviewLoading(true);
    void getWorkbenchWikiDocumentPreview(node.nodeToken)
      .then((response): void => {
        if (previewRequestIdRef.current === requestId) {
          setPreview(response);
        }
      })
      .catch((previewLoadError: unknown): void => {
        if (previewRequestIdRef.current === requestId) {
          setPreviewError(
            previewLoadError instanceof Error
              ? previewLoadError.message
              : '飞书文档正文暂时无法读取',
          );
        }
      })
      .finally((): void => {
        if (previewRequestIdRef.current === requestId) {
          setPreviewLoading(false);
        }
      });

    return (): void => {
      if (previewRequestIdRef.current === requestId) {
        previewRequestIdRef.current += 1;
      }
    };
  }, [embedEnabled, node.nodeToken, node.objectType]);

  useEffect(() => {
    if (!embedEnabled) {
      setLoading(false);
      return;
    }
    if (
      !node.documentUrl
      || (!docsPocEnabled && !componentUserId)
    ) {
      return;
    }
    if (scriptStatus === 'error') {
      setLoading(false);
      setError('飞书文档组件加载失败，请刷新后重试。');
      embedFailureHandledRef.current = true;
      setEmbedEnabled(false);
      return;
    }
    if (scriptStatus !== 'ready') {
      return;
    }

    let cancelled = false;
    let instance: DocComponentSdkInstance | null = null;
    let mountTimeout: number | undefined;
    const failEmbedding = (message: string): void => {
      if (cancelled || embedFailureHandledRef.current) {
        return;
      }
      embedFailureHandledRef.current = true;
      if (mountTimeout) {
        window.clearTimeout(mountTimeout);
      }
      setLoading(false);
      setError(message);
      setEmbedEnabled(false);
    };
    const renderDocument = async (): Promise<void> => {
      setLoading(true);
      setError('');
      setAuthorizationUrl('');
      try {
        let componentAuth: WorkbenchWikiComponentAuth;
        if (docsPocEnabled) {
          const authResponse: WorkbenchWikiComponentAuthResponse =
            await getWorkbenchWikiComponentAuth(globalThis.location.href);
          if (!authResponse.connected || !authResponse.auth) {
            setAuthorizationUrl(authResponse.authorizationUrl ?? '');
            setLoading(false);
            return;
          }
          componentAuth = authResponse.auth;
        } else {
          if (!componentUserId) {
            throw new Error('当前账号暂时无法使用飞书云文档组件');
          }
          const profile: UserProfileData = await fetchUserProfile(
            componentUserId,
            'apaas',
          );
          if (!profile.useLarkCard) {
            throw new Error('当前账号暂时无法使用飞书云文档组件');
          }
          if (profile.larkCardParam.needRedirect) {
            setAuthorizationUrl(profile.larkCardParam.redirectURL ?? '');
            setLoading(false);
            return;
          }
          const timestamp: number = Date.now();
          const nonceStr: string = createNonce(16);
          const url: string = globalThis.location.href.split('#')[0] ?? '';
          const signatureSource =
            `jsapi_ticket=${profile.larkCardParam.jsAPITicket}` +
            `&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
          componentAuth = {
            openId: profile.larkCardParam.larkOpenID,
            signature: SHA1(signatureSource).toString(),
            appId: profile.larkCardParam.larkAppID,
            timestamp,
            nonceStr,
            url,
            jsApiList: ['DocsComponent'],
          };
        }

        if (cancelled || !mountRef.current) {
          return;
        }
        const DocComponentSdk = globalThis.DocComponentSdk;
        if (typeof DocComponentSdk !== 'function') {
          throw new Error('飞书新版文档组件 SDK 未正确加载');
        }
        mountTimeout = window.setTimeout((): void => {
          failEmbedding(
            '飞书文档加载时间过长。你可以重新加载，或先在飞书中打开。',
          );
        }, 15_000);

        instance = new DocComponentSdk({
          src: node.documentUrl,
          mount: mountRef.current,
          auth: componentAuth,
          config: {
            extensions: {
              suiteNavBar: {
                disable: false,
              },
              directory: {
                disable: true,
              },
              like: {
                disable: true,
              },
              content: {
                readonly: false,
                titleVisible: true,
                mode: 'wide',
                unscrollable: false,
              },
              comment: {
                partial: {
                  disable: false,
                  open: false,
                },
                global: {
                  disable: false,
                },
              },
            },
          },
          size: {
            width: '100%',
            height: '100%',
          },
          onAuthError: (authError: unknown): void => {
            const detail = summarizeComponentError(authError);
            logger.error(`飞书文档组件鉴权失败：${detail}`);
            failEmbedding(
              docsPocEnabled
                ? `飞书文档组件鉴权失败：${detail}`
                : '飞书文档授权已失效，请刷新后重试。',
            );
          },
          onError: (componentError: unknown): void => {
            const detail = summarizeComponentError(componentError);
            logger.error(`飞书文档组件运行失败：${detail}`);
            failEmbedding(
              docsPocEnabled
                ? `飞书文档组件运行失败：${detail}`
                : '飞书文档暂时无法打开，请稍后重试。',
            );
          },
          onMountSuccess: (): void => {
            if (!cancelled) {
              if (mountTimeout) {
                window.clearTimeout(mountTimeout);
              }
              setLoading(false);
            }
          },
          onMountTimeout: (): void => {
            failEmbedding(
              '飞书文档加载时间过长。你可以重新加载，或先在飞书中打开。',
            );
          },
        });
        await instance.start();
      } catch (renderError: unknown) {
        logger.error('打开飞书知识库文档失败', renderError);
        failEmbedding(
          renderError instanceof Error
            ? renderError.message
            : '飞书文档暂时无法打开',
        );
      }
    };

    void renderDocument();
    return () => {
      cancelled = true;
      instance?.destroy();
      if (mountTimeout) {
        window.clearTimeout(mountTimeout);
      }
      if (mountRef.current) {
        mountRef.current.replaceChildren();
      }
    };
  }, [
    node.documentUrl,
    node.wikiUrl,
    docsPocEnabled,
    embedEnabled,
    retryCount,
    scriptStatus,
    componentUserId,
  ]);

  const retryEmbedding = (): void => {
    embedFailureHandledRef.current = false;
    previewRequestIdRef.current += 1;
    setPreview(null);
    setPreviewError('');
    setPreviewLoading(false);
    setError('');
    setLoading(true);
    setEmbedEnabled(true);
    setRetryCount((count: number): number => count + 1);
  };

  return (
    <main className="flex min-h-screen flex-col bg-muted/30">
      <header className="grid min-h-18 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-b bg-background px-4 pt-20 pb-3 md:flex md:flex-wrap md:gap-3 md:px-6 md:py-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="返回 OfferLoop 工作台"
          onClick={onBack}
          data-ai-section-type="button"
        >
          <ArrowLeft />
        </Button>
        <div className="flex min-w-0 items-center gap-3 md:flex-1">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileText className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-semibold">{node.title}</h1>
            <p className="text-xs text-muted-foreground">
              来自 OfferLoop 飞书知识库
            </p>
          </div>
        </div>
        <div className="col-span-2 flex justify-self-end gap-2 md:col-auto">
          <Button asChild variant="outline" size="sm">
            <a href={node.wikiUrl} target="_blank" rel="noreferrer">
              在飞书中打开
              <ExternalLink />
            </a>
          </Button>
        </div>
      </header>

      {!node.documentUrl ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <Alert className="max-w-xl">
            <AlertTitle>该类型暂不支持内嵌阅读</AlertTitle>
            <AlertDescription>
              可以使用右上角“在飞书中打开”查看该内容。
            </AlertDescription>
          </Alert>
        </div>
      ) : (
        <section className="relative min-h-0 flex-1 bg-background">
          <div
            ref={mountRef}
            className="h-[calc(100vh-9rem)] min-h-[480px] w-full md:h-[calc(100vh-4.5rem)] md:min-h-[560px]"
          />
          {embedEnabled && loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/90">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <LoaderCircle className="size-5 animate-spin text-primary" />
                正在打开飞书文档…
              </div>
            </div>
          ) : null}
          {authorizationUrl ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background p-6">
              <div className="max-w-md space-y-4 text-center">
                <h2 className="text-lg font-semibold">需要连接飞书文档</h2>
                <p className="text-sm text-muted-foreground">
                  首次使用时完成一次飞书授权，之后即可在工作台内查看并编辑文档。
                </p>
                <Button asChild>
                  <a href={authorizationUrl}>连接飞书文档</a>
                </Button>
              </div>
            </div>
          ) : null}
          {previewLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <LoaderCircle className="size-5 animate-spin text-primary" />
                内嵌组件不可用，正在读取飞书文档正文…
              </div>
            </div>
          ) : null}
          {preview ? (
            <div className="absolute inset-0 overflow-y-auto bg-background">
              <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-5 py-3 backdrop-blur">
                <p className="text-sm text-muted-foreground">
                  飞书内嵌组件在当前环境未能加载，现显示纯文字预览。彩色图标、卡片和编辑能力请在飞书中打开。
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={retryEmbedding}
                    data-ai-section-type="button"
                  >
                    <RefreshCw />
                    重试内嵌
                  </Button>
                  <Button asChild size="sm">
                    <a href={node.wikiUrl} target="_blank" rel="noreferrer">
                      在飞书中打开
                      <ExternalLink />
                    </a>
                  </Button>
                </div>
              </div>
              <article className="mx-auto max-w-4xl whitespace-pre-wrap px-6 py-8 text-[15px] leading-7 text-foreground md:px-10">
                {preview.content || '该文档目前没有可预览的文字内容。'}
              </article>
            </div>
          ) : null}
          {!preview && !previewLoading && (error || previewError) ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background p-6">
              <Alert variant="destructive" className="max-w-lg">
                <AlertTitle>文档打开失败</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>{error}</p>
                  {previewError ? <p>{previewError}</p> : null}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={retryEmbedding}
                    data-ai-section-type="button"
                  >
                    <RefreshCw />
                    重新加载
                  </Button>
                  <Button asChild size="sm">
                    <a href={node.wikiUrl} target="_blank" rel="noreferrer">
                      在飞书中打开
                      <ExternalLink />
                    </a>
                  </Button>
                </AlertDescription>
              </Alert>
            </div>
          ) : null}
        </section>
      )}
    </main>
  );
};

export { WorkbenchWikiDocument };
