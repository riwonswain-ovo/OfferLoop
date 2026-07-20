'use client';

import { logger } from '@lark-apaas/client-toolkit/logger';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SHA1 from 'crypto-js/sha1';

import {
  fetchUserProfile,
  getAssetsUrl,
} from '@client/src/components/business-ui/api/user-profiles/service';
import { ErrorImage } from '@client/src/components/business-ui/user-profile/error-image';
import { getEnv } from '@lark-apaas/client-toolkit/utils/getEnv';
import { useExternalScript } from '@client/src/components/business-ui/user-profile/user-external-script';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { UserInput } from '@client/src/components/business-ui/types/user';

type WebComponentAPI = {
  config(params: {
    openId: string;
    signature: string;
    appId: string;
    timestamp: string;
    nonceStr: string;
    url: string;
    jsApiList: string[];
    locale?: string[];
    env?: string;
  }): Promise<void>;
  render(
    name: string,
    props: Record<string, unknown>,
    container: HTMLElement | null,
  ): Promise<unknown>;
  onAuthError(cb: (error: Error) => void): void;
  onError(cb: (error: Error) => void): void;
};

declare global {
  // 运行环境标识（可根据需要扩展实际取值范围）
  var ENVIRONMENT: 'staging' | 'local' | 'production' | string;
  // 飞书 H5 webComponent SDK
  var webComponent: WebComponentAPI;
}

interface UserProfileProps {
  readonly value?: string | UserInput;
  readonly userId?: string | undefined;
  readonly user_id?: string | undefined;
  readonly accountType?: 'apaas' | 'lark' | undefined;
}

function generateRandomString(length: number): string {
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < length; i += 1) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }

  return result;
}

type BaseUserProfileProps = BaseSimpleProfileProps | BaseOfficialProfileProps;

const ACCOUNT_STATUS = {
  UNSPECIFIED: 0,
  Inactive: 1,
  Active: 2,
  Disabled: 3,
  Terminated: 4,
  NotJoined: 5,
  Resigned: 6,
} as const;
type AccountStatus = (typeof ACCOUNT_STATUS)[keyof typeof ACCOUNT_STATUS];

const AccountStatusMap: Record<AccountStatus, string> = {
  [ACCOUNT_STATUS.UNSPECIFIED]: '',
  [ACCOUNT_STATUS.Active]: '已启用',
  [ACCOUNT_STATUS.Inactive]: '未激活',
  [ACCOUNT_STATUS.Disabled]: '已停用',
  [ACCOUNT_STATUS.Terminated]: '已停用',
  [ACCOUNT_STATUS.NotJoined]: '未激活',
  [ACCOUNT_STATUS.Resigned]: '已停用',
};

interface BaseSimpleProfileProps {
  readonly useLarkCard: false;
  readonly userProfileInfo: {
    readonly name?: string;
    readonly avatar?: string;
    readonly email?: string;
    //
    readonly userStatus: AccountStatus;
    readonly userType: '_employee' | '_externalUser';
  };
}

interface BaseOfficialProfileProps {
  readonly useLarkCard: true;
  readonly larkCardParam: {
    readonly needRedirect?: boolean;
    readonly redirectURL?: string;
    readonly larkAppID: string;
    readonly jsAPITicket: string;
    readonly larkOpenID: string;
    readonly targetLarkOpenID: string;
  };
}

/**
 * 通用响应结构
 * 用于标准化 API 响应格式
 */
export interface WithCommonResponse<T> {
  data: T;
}

async function renderLarkProfile({
  larkAppID,
  jsAPITicket,
  larkOpenID,
  cardRef,
  targetLarkOpenID,
}: BaseOfficialProfileProps['larkCardParam'] & {
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
  const timestamp = Date.now().toString();
  const nonceStr = generateRandomString(10);
  const url = globalThis.location.href.split('#')[0] ?? '';
  const message = `jsapi_ticket=${jsAPITicket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
  const signature = SHA1(message).toString();

  await globalThis.webComponent.config({
    openId: larkOpenID,
    signature,
    appId: larkAppID,
    timestamp,
    nonceStr,
    url,
    jsApiList: ['user_profile'],
    locale: ['zh_cn'],
    ...(getEnv() === 'BOE'
      ? { env: 'feishu_boe' }
      : {}),
  });

  const myComponent = await globalThis.webComponent.render(
    'UserProfile',
    {
      openId: targetLarkOpenID,
    },
    cardRef.current,
  );

  return myComponent;
}

function UserProfile(props: UserProfileProps) {
  const { value, userId: originUserId, user_id, accountType = 'apaas' } = props;

  const userId =
    (typeof value === 'string'
      ? value
      : (value as any)?.user_id || (value as any)?.userId) ||
    user_id ||
    originUserId;

  const cardRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const redirectURLRef = useRef<string>('');
  const [response, setResponse] = useState<BaseUserProfileProps>(
    {} as BaseUserProfileProps,
  );
  const [error, setError] = useState<boolean>(false);

  const onAuthError = useCallback(() => {
    globalThis.webComponent.onAuthError(function (error: Error) {
      const errorMessage = JSON.parse(error.message);
      // 存在token过期情况，但后端无法识别，需要前端这边主动识别error，并进行鉴权重定向
      if (
        errorMessage?.msg?.code === 20442 &&
        errorMessage?.msg?.msg === 'jsapi-ticket not exist'
      ) {
        globalThis.location.replace(redirectURLRef.current);
      }
    });

    globalThis.webComponent.onError(function (error: Error) {
      logger.info('webComponent onError', error);
    });
  }, []);

  // 按需注入飞书 H5 JS SDK，仅在组件使用时加载
  const larkSdkURl =
    'https://lf3-cdn-tos.bytegoofy.com/obj/goofy/locl/lark/external_js_sdk/h5-js-sdk-1.2.21.js';
  const scriptOptions = useMemo(
    () => ({ onloadCallback: onAuthError }),
    [onAuthError],
  );
  const scriptStatus = useExternalScript(larkSdkURl, scriptOptions);

  const fetchData = useCallback(async () => {
    if (!userId) return;

    const controller = new AbortController();

    setLoading(true);
    setError(false);

    try {
      const data = await fetchUserProfile(userId, accountType, controller.signal);
      setResponse(data as BaseUserProfileProps);

      if (data.useLarkCard && !data.larkCardParam.needRedirect) {
        redirectURLRef.current = data.larkCardParam.redirectURL ?? '';
        await renderLarkProfile({
          ...data.larkCardParam,
          cardRef,
        });
        setLoading(false);
      } else {
        setLoading(false);
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        // 直接退出，不处理 AbortError
      } else {
        // 最终的UI反馈
        setError(true);
        setLoading(false);
      }
    }
  }, [userId, accountType]);

  useEffect(() => {
    if (scriptStatus !== 'ready') return;

    void fetchData();
  }, [fetchData, scriptStatus]);

  if (error) {
    return (
      <Card
        ref={cardRef}
        className="flex min-h-124 w-80 flex-col items-center justify-center gap-4 border-0 p-0"
      >
        <ErrorImage />
        {/* <Button variant="outline" className="border-red-500 text-black hover:bg-red-50" onClick={fetchData}>
        加载失败 请重试
      </Button> */}
        <div>
          <span className="text-sm">加载失败 请</span>
          <Button
            size="sm"
            variant="ghost"
            className="pr-1 pl-1 text-primary! not-disabled:hover:bg-primary/10 not-disabled:hover:text-primary/90 focus-visible:bg-primary/20"
            onClick={fetchData}
          >
            重试
          </Button>
        </div>
      </Card>
    );
  }
  return (
    <Card
      ref={cardRef}
      className="flex h-130 w-80 flex-col items-center justify-center gap-6 border-0 p-0"
    >
      {loading ? <LoadingComponent /> : <BaseUserProfile {...response} />}
    </Card>
  );
}

function LoadingComponent() {
  return <Spinner className="size-8 animate-spin text-primary" />;
}

function BaseUserProfile(props: BaseUserProfileProps) {
  const { useLarkCard } = props;
  if (!useLarkCard) {
    const { userProfileInfo } = props as BaseSimpleProfileProps;

    return <SimpleUserProfile userProfileInfo={userProfileInfo} />;
  }

  const { larkCardParam } = props;
  const { needRedirect, redirectURL } = larkCardParam;
  if (needRedirect) {
    if (!redirectURL) {
      return null;
    }

    globalThis.location.replace(redirectURL);
    return null;
  }
}

function SimpleUserProfile(props: {
  readonly userProfileInfo: BaseSimpleProfileProps['userProfileInfo'];
}) {
  const { userProfileInfo } = props;

  return (
    <Card className="flex w-80 flex-col gap-0 overflow-hidden border-0 p-0">
      <div className="relative h-34 w-full">
        <img
          src={getAssetsUrl(
            '/obj/eden-cn/lm-zhhwh/ljhwZthlaukjlkulzlp/ui/bg.png',
          )}
          alt="cover"
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          width={320}
          height={112}
        />
      </div>

      <CardContent className="h-96 w-80 pt-0 pr-4 pb-4 pl-4">
        <div className="relative">
          <Avatar className="absolute left-0 size-22.5 -translate-y-1/2 border-2 border-background">
            <AvatarImage
              src={userProfileInfo.avatar}
              alt={userProfileInfo.name}
            />
            <AvatarFallback>{userProfileInfo.name?.at(0)}</AvatarFallback>
          </Avatar>

          <div className="pt-13.5">
            <div className="flex items-center gap-2 pt-0.5 pb-1.5 leading-tight font-semibold">
              <span className="text-xl">{userProfileInfo.name}</span>
              {userProfileInfo.userType === '_externalUser' && (
                <Badge className="rounded-sm border-0 bg-blue-500/20 pt-px pr-1.5 pb-px pl-1 text-sm text-blue-900">
                  外部
                </Badge>
              )}
              {AccountStatusMap[userProfileInfo.userStatus] !== '' && (
                <Badge className="rounded-sm border-0 bg-foreground/10 pt-px pr-1.5 pb-px pl-1 text-sm text-foreground">
                  {AccountStatusMap[userProfileInfo.userStatus]}
                </Badge>
              )}
            </div>
            {userProfileInfo.email && (
              <div className="mt-6 grid grid-cols-[84px_1fr] gap-y-3 text-sm">
                <div className="text-muted-foreground">邮箱</div>
                <div>
                  <a
                    className="break-all text-primary underline-offset-4 hover:underline"
                    href={`mailto:${userProfileInfo.email ?? ''}`}
                  >
                    {userProfileInfo.email}
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export { UserProfile };
