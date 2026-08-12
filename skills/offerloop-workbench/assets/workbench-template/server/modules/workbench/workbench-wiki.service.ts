import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';

import type {
  WorkbenchWikiDirectoryResponse,
  WorkbenchWikiDocumentPreviewResponse,
  WorkbenchWikiNode,
} from '@shared/api.interface';

const FEISHU_API_ROOT = 'https://open.feishu.cn/open-apis';
const OFFERLOOP_WIKI_SPACE_ID = '7663472168944012468';
const OFFERLOOP_WIKI_SPACE_NAME = 'OfferLoop 求职空间';
const OFFERLOOP_WIKI_HOST = 'https://my.feishu.cn';
const TOKEN_SAFETY_WINDOW_MS = 5 * 60 * 1000;
const DIRECTORY_CACHE_MS = 60 * 1000;
const WIKI_PAGE_SIZE = 50;
const MAX_DIRECTORY_DEPTH = 10;

interface FeishuEnvelope<T> {
  code: number;
  msg?: string;
  data?: T;
  tenant_access_token?: string;
  expire?: number;
}

interface FeishuWikiNode {
  has_child?: boolean;
  node_token: string;
  obj_token: string;
  obj_type: string;
  title?: string;
}

interface FeishuWikiNodePage {
  has_more?: boolean;
  page_token?: string;
  items?: FeishuWikiNode[];
}

interface DirectoryCache {
  expiresAt: number;
  value: WorkbenchWikiDirectoryResponse;
}

interface FeishuRawContent {
  content?: string;
}

@Injectable()
export class WorkbenchWikiService {
  private readonly logger = new Logger(WorkbenchWikiService.name);
  private accessToken = '';
  private accessTokenExpiresAt = 0;
  private accessTokenPromise: Promise<string> | null = null;
  private directoryCache: DirectoryCache | null = null;
  private directoryPromise: Promise<WorkbenchWikiDirectoryResponse> | null =
    null;

  constructor(private readonly httpService: HttpService) {}

  async getDirectory(
    forceRefresh = false,
  ): Promise<WorkbenchWikiDirectoryResponse> {
    if (
      !forceRefresh &&
      this.directoryCache &&
      Date.now() < this.directoryCache.expiresAt
    ) {
      return this.directoryCache.value;
    }
    if (this.directoryPromise) {
      return this.directoryPromise;
    }
    this.directoryPromise = this.loadDirectory();
    try {
      const value: WorkbenchWikiDirectoryResponse = await this.directoryPromise;
      this.directoryCache = {
        value,
        expiresAt: Date.now() + DIRECTORY_CACHE_MS,
      };
      return value;
    } finally {
      this.directoryPromise = null;
    }
  }

  async getDocumentPreview(
    nodeToken: string,
  ): Promise<WorkbenchWikiDocumentPreviewResponse> {
    const directory: WorkbenchWikiDirectoryResponse = await this.getDirectory();
    const node: WorkbenchWikiNode | undefined = this.findNode(
      directory.nodes,
      nodeToken,
    );
    if (!node) {
      throw new NotFoundException('知识库文档不存在');
    }
    if (node.objectType !== 'docx') {
      throw new BadRequestException('该文档类型暂不支持工作台预览');
    }

    const token: string = await this.getAccessToken();
    const response: AxiosResponse<FeishuEnvelope<FeishuRawContent>> =
      await firstValueFrom(
        this.httpService.get<FeishuEnvelope<FeishuRawContent>>(
          `${FEISHU_API_ROOT}/docx/v1/documents/` +
            `${node.objectToken}/raw_content`,
          {
            headers: { Authorization: `Bearer ${token}` },
            params: { lang: 0 },
          },
        ),
      );
    const payload: FeishuRawContent = this.unwrap(
      response.data,
      '读取飞书文档正文',
    );
    return {
      content: String(payload.content ?? '').slice(0, 300_000),
      generatedAt: new Date().toISOString(),
      sourceUrl: node.wikiUrl,
      title: node.title,
    };
  }

  private async loadDirectory(): Promise<WorkbenchWikiDirectoryResponse> {
    const token: string = await this.getAccessToken();
    const nodes: WorkbenchWikiNode[] = await this.loadNodes(
      token,
      undefined,
      0,
      new Set<string>(),
    );
    return {
      spaceId: OFFERLOOP_WIKI_SPACE_ID,
      spaceName: OFFERLOOP_WIKI_SPACE_NAME,
      generatedAt: new Date().toISOString(),
      nodes,
    };
  }

  private async loadNodes(
    accessToken: string,
    parentNodeToken: string | undefined,
    depth: number,
    visited: Set<string>,
  ): Promise<WorkbenchWikiNode[]> {
    if (depth >= MAX_DIRECTORY_DEPTH) {
      return [];
    }
    const sourceNodes: FeishuWikiNode[] = await this.loadNodePageSet(
      accessToken,
      parentNodeToken,
    );
    return Promise.all(
      sourceNodes.map(
        async (source: FeishuWikiNode): Promise<WorkbenchWikiNode> => {
          const hasChildren: boolean = Boolean(source.has_child);
          const alreadyVisited: boolean = visited.has(source.node_token);
          const nextVisited: Set<string> = new Set(visited);
          nextVisited.add(source.node_token);
          const children: WorkbenchWikiNode[] =
            hasChildren && !alreadyVisited
              ? await this.loadNodes(
                  accessToken,
                  source.node_token,
                  depth + 1,
                  nextVisited,
                )
              : [];
          return {
            nodeToken: source.node_token,
            objectToken: source.obj_token,
            objectType: source.obj_type,
            title: String(source.title ?? '未命名文档'),
            hasChildren,
            wikiUrl: `${OFFERLOOP_WIKI_HOST}/wiki/${source.node_token}`,
            documentUrl: this.createDocumentUrl(source),
            children,
          };
        },
      ),
    );
  }

  private async loadNodePageSet(
    accessToken: string,
    parentNodeToken?: string,
  ): Promise<FeishuWikiNode[]> {
    const nodes: FeishuWikiNode[] = [];
    let pageToken = '';
    do {
      const response: AxiosResponse<FeishuEnvelope<FeishuWikiNodePage>> =
        await firstValueFrom(
          this.httpService.get<FeishuEnvelope<FeishuWikiNodePage>>(
            `${FEISHU_API_ROOT}/wiki/v2/spaces/` +
              `${OFFERLOOP_WIKI_SPACE_ID}/nodes`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
              params: {
                page_size: WIKI_PAGE_SIZE,
                ...(parentNodeToken
                  ? { parent_node_token: parentNodeToken }
                  : {}),
                ...(pageToken ? { page_token: pageToken } : {}),
              },
            },
          ),
        );
      const page: FeishuWikiNodePage = this.unwrap(
        response.data,
        '读取知识库目录',
      );
      nodes.push(...(page.items ?? []));
      pageToken = page.has_more ? String(page.page_token ?? '') : '';
    } while (pageToken);
    return nodes;
  }

  private createDocumentUrl(source: FeishuWikiNode): string | undefined {
    if (source.obj_type === 'docx') {
      return `${OFFERLOOP_WIKI_HOST}/docx/${source.obj_token}`;
    }
    if (source.obj_type === 'sheet') {
      return `${OFFERLOOP_WIKI_HOST}/sheets/${source.obj_token}`;
    }
    if (source.obj_type === 'bitable') {
      return `${OFFERLOOP_WIKI_HOST}/wiki/${source.node_token}`;
    }
    return undefined;
  }

  private findNode(
    nodes: WorkbenchWikiNode[],
    nodeToken: string,
  ): WorkbenchWikiNode | undefined {
    for (const node of nodes) {
      if (node.nodeToken === nodeToken) {
        return node;
      }
      const child: WorkbenchWikiNode | undefined = this.findNode(
        node.children,
        nodeToken,
      );
      if (child) {
        return child;
      }
    }
    return undefined;
  }

  private async getAccessToken(): Promise<string> {
    if (
      this.accessToken &&
      Date.now() + TOKEN_SAFETY_WINDOW_MS < this.accessTokenExpiresAt
    ) {
      return this.accessToken;
    }
    if (this.accessTokenPromise) {
      return this.accessTokenPromise;
    }
    this.accessTokenPromise = this.requestAccessToken();
    try {
      return await this.accessTokenPromise;
    } finally {
      this.accessTokenPromise = null;
    }
  }

  private async requestAccessToken(): Promise<string> {
    const response: AxiosResponse<FeishuEnvelope<never>> = await firstValueFrom(
      this.httpService.post<FeishuEnvelope<never>>(
        `${FEISHU_API_ROOT}/auth/v3/tenant_access_token/internal`,
        {
          app_id: this.requireEnv('FEISHU_APP_ID'),
          app_secret: this.requireEnv('FEISHU_APP_SECRET'),
        },
      ),
    );
    const payload: FeishuEnvelope<never> = response.data;
    if (payload.code !== 0 || !payload.tenant_access_token) {
      this.logger.error(
        `获取飞书访问凭证失败：${payload.code} ${payload.msg ?? ''}`.trim(),
      );
      throw new ServiceUnavailableException('飞书知识库暂时无法连接');
    }
    this.accessToken = payload.tenant_access_token;
    this.accessTokenExpiresAt =
      Date.now() + Number(payload.expire ?? 7200) * 1000;
    return this.accessToken;
  }

  private unwrap<T>(response: FeishuEnvelope<T>, action: string): T {
    if (response.code !== 0 || !response.data) {
      this.logger.error(
        `${action}失败：${response.code} ${response.msg ?? ''}`.trim(),
      );
      throw new ServiceUnavailableException(
        `${action}失败，请确认应用拥有知识库阅读权限`,
      );
    }
    return response.data;
  }

  private requireEnv(name: string): string {
    const value: string = String(process.env[name] ?? '').trim();
    if (!value) {
      throw new ServiceUnavailableException(`缺少环境变量 ${name}`);
    }
    return value;
  }
}
