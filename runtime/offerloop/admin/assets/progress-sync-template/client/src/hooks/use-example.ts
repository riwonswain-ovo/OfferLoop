// import { useState, useEffect } from 'react';
// import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
// import { logger } from '@lark-apaas/client-toolkit/logger';

// interface RecordData {
//   title?: string,
//   type?: string,
//   creator?: string,
//   speakDate?: string,
// record: any;
// loading: boolean;
// error?: string;
// }

// export function useRecordData() {
//   const [data, setData] = useState<RecordData>({
//     record: {},
//     loading: true,
//     error: null,
//   });

//   useEffect(() => {
//     fetchRecordData();
//   }, []);

//   const fetchRecordData = async () => {
//     try {
//       setData(prev => ({ ...prev, loading: true, error: null }));

//       // 使用axios实例获取数据
//       const response = await axiosForBackend.get('/api/hello');

//       // 提取响应数据中的 data 字段
//       const record = response.data.data;

//       setData({
//         record,
//         loading: false,
//         error: null,
//       });
//     } catch (error) {
//       logger.error('获取数据失败', error);
//       setData(prev => ({
//         ...prev,
//         loading: false,
//         error: '获取数据失败，请稍后重试',
//       }));
//     }
//   };

//   return { ...data, refetch: fetchRecordData };
// }