import { axiosForBackend } from '@client/src/api/backend-client';
import { logger } from '@client/src/lib/client-logger';

import type {
  KnowledgeDigestResponse,
  ProductSenseAutoCompleteResponse,
  ProductSenseCompleteResponse,
  ProductSenseDraftInput,
  ProductSenseExternalCompleteInput,
  ProductSenseFeedbackInput,
  ProductSenseSelectInput,
  ProductSenseSession,
  WorkbenchApplicationsResponse,
  WorkbenchCalendarResponse,
  WorkbenchDataset,
  WorkbenchDatasetQuery,
  WorkbenchInterviewsResponse,
  WorkbenchHomeResponse,
  WorkbenchHomeStageCountsResponse,
  WorkbenchResponse,
  WorkbenchWikiComponentAuthResponse,
  WorkbenchWikiDirectoryResponse,
  WorkbenchWikiDocumentPreviewResponse,
} from '@shared/api.interface';

let bootstrapHomePromiseConsumed = false;

const getProductSenseSession = async (): Promise<ProductSenseSession> => {
  try {
    const response = await axiosForBackend({
      url: '/api/workbench/product-sense',
      method: 'GET',
    });
    return response.data as ProductSenseSession;
  } catch (error: unknown) {
    logger.error('读取产品 Sense 推荐失败', error);
    throw error;
  }
};

const switchProductSenseQuestion = async (
  input: ProductSenseFeedbackInput,
): Promise<ProductSenseSession> => {
  try {
    const response = await axiosForBackend({
      url: '/api/workbench/product-sense/switch',
      method: 'POST',
      data: input,
    });
    return response.data as ProductSenseSession;
  } catch (error: unknown) {
    logger.error('更换产品 Sense 题目失败', error);
    throw error;
  }
};

const selectProductSenseQuestion = async (
  input: ProductSenseSelectInput,
): Promise<ProductSenseSession> => {
  try {
    const response = await axiosForBackend({
      url: '/api/workbench/product-sense/select',
      method: 'POST',
      data: input,
    });
    return response.data as ProductSenseSession;
  } catch (error: unknown) {
    logger.error('选择产品 Sense 题目失败', error);
    throw error;
  }
};

const saveProductSenseDraft = async (
  input: ProductSenseDraftInput,
): Promise<ProductSenseSession> => {
  try {
    const response = await axiosForBackend({
      url: '/api/workbench/product-sense/draft',
      method: 'POST',
      data: input,
    });
    return response.data as ProductSenseSession;
  } catch (error: unknown) {
    logger.error('保存产品 Sense 回答失败', error);
    throw error;
  }
};

const completeProductSense =
  async (): Promise<ProductSenseCompleteResponse> => {
    try {
      const response = await axiosForBackend({
        url: '/api/workbench/product-sense/complete',
        method: 'POST',
      });
      return response.data as ProductSenseCompleteResponse;
    } catch (error: unknown) {
      logger.error('归档产品 Sense 回答失败', error);
      throw error;
    }
  };

const completeExternalProductSense = async (
  input: ProductSenseExternalCompleteInput,
): Promise<ProductSenseCompleteResponse> => {
  try {
    const response = await axiosForBackend({
      url: '/api/workbench/product-sense/complete-external',
      method: 'POST',
      data: input,
    });
    return response.data as ProductSenseCompleteResponse;
  } catch (error: unknown) {
    logger.error('验收 Agent 产品 Sense 文档失败', error);
    throw error;
  }
};

const autoCompleteProductSense =
  async (): Promise<ProductSenseAutoCompleteResponse> => {
    try {
      const response = await axiosForBackend({
        url: '/api/workbench/product-sense/complete-auto',
        method: 'POST',
      });
      return response.data as ProductSenseAutoCompleteResponse;
    } catch (error: unknown) {
      logger.error('自动验收 Agent 产品 Sense 文档失败', error);
      throw error;
    }
  };

const getWorkbench = async (): Promise<WorkbenchResponse> => {
  try {
    const response = await axiosForBackend({
      url: '/api/workbench',
      method: 'GET',
    });
    return response.data as WorkbenchResponse;
  } catch (error: unknown) {
    logger.error('读取 OfferLoop 工作台数据失败', error);
    throw error;
  }
};

const getWorkbenchApplications =
  async (): Promise<WorkbenchApplicationsResponse> => {
    try {
      const response = await axiosForBackend({
        url: '/api/workbench/applications',
        method: 'GET',
      });
      return response.data as WorkbenchApplicationsResponse;
    } catch (error: unknown) {
      logger.error('读取投递管理数据失败', error);
      throw error;
    }
  };

const getKnowledgeDigest = async (): Promise<KnowledgeDigestResponse> => {
  try {
    const response = await axiosForBackend({
      url: '/api/workbench/knowledge-digest',
      method: 'GET',
    });
    return response.data as KnowledgeDigestResponse;
  } catch (error: unknown) {
    logger.error('读取知识速览失败', error);
    throw error;
  }
};

const getWorkbenchDataset = async (
  query: WorkbenchDatasetQuery,
): Promise<WorkbenchDataset> => {
  try {
    const params = {
      ...query,
      filters: query.filters
        ? JSON.stringify(query.filters)
        : undefined,
    };
    const response = await axiosForBackend({
      url: '/api/workbench/dataset',
      method: 'GET',
      params,
    });
    return response.data as WorkbenchDataset;
  } catch (error: unknown) {
    logger.error('读取 OfferLoop 分页数据失败', error);
    throw error;
  }
};

const getWorkbenchCalendar = async (): Promise<WorkbenchCalendarResponse> => {
  try {
    const response = await axiosForBackend({
      url: '/api/workbench/calendar',
      method: 'GET',
    });
    return response.data as WorkbenchCalendarResponse;
  } catch (error: unknown) {
    logger.error('读取 OfferLoop 个人日历失败', error);
    throw error;
  }
};

const getWorkbenchInterviews =
  async (): Promise<WorkbenchInterviewsResponse> => {
    try {
      const response = await axiosForBackend({
        url: '/api/workbench/interviews',
        method: 'GET',
      });
      return response.data as WorkbenchInterviewsResponse;
    } catch (error: unknown) {
      logger.error('读取面试与复盘数据失败', error);
      throw error;
    }
  };

const getWorkbenchHome = async (): Promise<WorkbenchHomeResponse> => {
  if (!bootstrapHomePromiseConsumed && typeof window !== 'undefined') {
    bootstrapHomePromiseConsumed = true;
    const bootstrapWindow: Window & {
      __offerloopHomePromise?: Promise<WorkbenchHomeResponse>;
    } = window;
    if (bootstrapWindow.__offerloopHomePromise) {
      try {
        return await bootstrapWindow.__offerloopHomePromise;
      } catch (error: unknown) {
        logger.error('复用工作台首屏请求失败，改为重新读取', error);
      }
    }
  }
  try {
    const response = await axiosForBackend({
      url: '/api/workbench/home',
      method: 'GET',
    });
    return response.data as WorkbenchHomeResponse;
  } catch (error: unknown) {
    logger.error('读取工作台首页数据失败', error);
    throw error;
  }
};

const getWorkbenchHomeStageCounts =
  async (): Promise<WorkbenchHomeStageCountsResponse> => {
    try {
      const response = await axiosForBackend({
        url: '/api/workbench/home/stage-counts',
        method: 'GET',
      });
      return response.data as WorkbenchHomeStageCountsResponse;
    } catch (error: unknown) {
      logger.error('读取工作台首页阶段统计失败', error);
      throw error;
    }
  };

const getWorkbenchWikiDirectory = async (
  forceRefresh = false,
): Promise<WorkbenchWikiDirectoryResponse> => {
  try {
    const response = await axiosForBackend({
      url: '/api/workbench/wiki-directory',
      method: 'GET',
      params: forceRefresh ? { refresh: 'true' } : undefined,
    });
    return response.data as WorkbenchWikiDirectoryResponse;
  } catch (error: unknown) {
    logger.error('读取 OfferLoop 知识库目录失败', error);
    throw error;
  }
};

const getWorkbenchWikiDocumentPreview = async (
  nodeToken: string,
): Promise<WorkbenchWikiDocumentPreviewResponse> => {
  try {
    const response = await axiosForBackend({
      url: '/api/workbench/wiki-document-preview',
      method: 'GET',
      params: { nodeToken },
    });
    return response.data as WorkbenchWikiDocumentPreviewResponse;
  } catch (error: unknown) {
    logger.error('读取 OfferLoop 飞书文档预览失败', error);
    throw error;
  }
};

const getWorkbenchWikiComponentAuth = async (
  url: string,
): Promise<WorkbenchWikiComponentAuthResponse> => {
  try {
    const response = await axiosForBackend({
      url: '/api/workbench/wiki-component-auth',
      method: 'GET',
      params: { url },
    });
    return response.data as WorkbenchWikiComponentAuthResponse;
  } catch (error: unknown) {
    logger.error('获取 OfferLoop 飞书文档组件鉴权失败', error);
    throw error;
  }
};

const completeWorkbenchCalendarOAuth = async (
  code: string,
  state: string,
): Promise<{ connected: boolean; message?: string }> => {
  try {
    const response = await axiosForBackend({
      url: '/api/workbench/calendar/oauth/complete',
      method: 'POST',
      data: { code, state },
    });
    return response.data as { connected: boolean; message?: string };
  } catch (error: unknown) {
    logger.error('完成 OfferLoop 个人日历授权失败', error);
    throw error;
  }
};

export {
  autoCompleteProductSense,
  completeExternalProductSense,
  completeProductSense,
  completeWorkbenchCalendarOAuth,
  getProductSenseSession,
  getKnowledgeDigest,
  getWorkbench,
  getWorkbenchApplications,
  getWorkbenchCalendar,
  getWorkbenchHome,
  getWorkbenchHomeStageCounts,
  getWorkbenchInterviews,
  getWorkbenchDataset,
  getWorkbenchWikiDirectory,
  getWorkbenchWikiComponentAuth,
  getWorkbenchWikiDocumentPreview,
  saveProductSenseDraft,
  selectProductSenseQuestion,
  switchProductSenseQuestion,
};
