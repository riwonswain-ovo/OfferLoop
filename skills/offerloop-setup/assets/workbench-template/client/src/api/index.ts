import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';

import type { WorkbenchResponse } from '@shared/api.interface';


const getWorkbench = async (): Promise<WorkbenchResponse> => {
  try {
    const response = await axiosForBackend({
      url: '/api/workbench',
      method: 'GET',
    });
    return response.data as WorkbenchResponse;
  } catch (error) {
    logger.error('读取 OfferLoop 工作台数据失败', error);
    throw error;
  }
};

export { getWorkbench };
