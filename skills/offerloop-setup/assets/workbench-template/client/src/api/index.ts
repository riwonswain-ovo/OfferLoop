import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';

import type {
  WorkbenchCalendarResponse,
  WorkbenchDataset,
  WorkbenchDatasetQuery,
  WorkbenchResponse,
} from '@shared/api.interface';

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

const getWorkbenchDataset = async (
  query: WorkbenchDatasetQuery,
): Promise<WorkbenchDataset> => {
  try {
    const response = await axiosForBackend({
      url: '/api/workbench/dataset',
      method: 'GET',
      params: query,
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

export {
  getWorkbench,
  getWorkbenchCalendar,
  getWorkbenchDataset,
};
