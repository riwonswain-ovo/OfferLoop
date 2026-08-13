import axios, { type AxiosInstance } from 'axios';

const axiosForBackend: AxiosInstance = axios.create({
  baseURL: process.env.CLIENT_BASE_PATH || '/',
  withCredentials: true,
});

axiosForBackend.interceptors.request.use((config) => {
  if (window.csrfToken) {
    config.headers['X-Suda-Csrf-Token'] = window.csrfToken;
  }
  config.headers['X-Page-Route'] = window.location.pathname;
  return config;
});

export { axiosForBackend };
