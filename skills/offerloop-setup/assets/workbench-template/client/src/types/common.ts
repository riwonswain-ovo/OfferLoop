/**
 * 用户状态枚举
 */
enum IUserStatus {
  active = 1,
  inactive = 2,
}
/**
 * 用户信息类型
 */
export type IUserProfile = {
  user_id: string;
  email: string;
  name: string;
  avatar: string;
  status: IUserStatus;
};



/**
 * 文件类型
 */
export type IFileAttachment = {
  bucket_id: string;
  file_path: string;
};
declare global {
  interface Window {
    userId?: string;
    token?: string;
    csrfToken?: string;
  }
}
