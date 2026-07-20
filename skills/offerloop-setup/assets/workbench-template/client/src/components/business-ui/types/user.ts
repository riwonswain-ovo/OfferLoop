// client/src/types/user.ts

import type { I18nText } from '@/components/business-ui/entity-combobox/types';
import type { Department } from '@/components/business-ui/department-select/types';

/**
 * 重新导出相关类型，方便统一导入
 */
export type { I18nText, Department };

/**
 * 用户类型枚举
 */
export type UserType = '_employee' | '_externalUser' | '_anonymousUser';

/**
 * 统一的标准用户类型（单一事实来源）
 * 使用下划线命名（与后端统一），larkUserId 除外
 */
export interface User {
  /** 用户 ID（未注册外部联系人可能没有） */
  user_id?: string;

  /** 飞书用户 ID（保持驼峰） */
  larkUserId?: string;

  /**
   * 用户名称
   * 支持简单字符串或国际化文本
   */
  name?: I18nText | string;

  /** 用户头像 URL */
  avatar?: string;

  /** 用户邮箱 */
  email?: string;

  /**
   * 用户类型
   * - '_employee': 内部员工
   * - '_externalUser': 外部用户
   * - '_anonymousUser': 匿名用户
   */
  user_type?: UserType;

  /** 部门信息（引用 DepartmentSelect 的类型） */
  department?: Department;

  /** 租户名称（外部用户显示） */
  tenantName?: string;

  /** 用户状态 */
  status?: number;
}

/**
 * 用户数据输入类型（用于组件 Props）
 * 兼容驼峰和下划线命名，内部自动转换为标准 User 类型
 */
export type UserInput =
  | User
  | {
      user_id?: string;
      userId?: string;         // 兼容驼峰
      larkUserId?: string;
      name?: I18nText | string;
      avatar?: string;
      email?: string;
      user_type?: UserType;
      userType?: UserType;     // 兼容驼峰
      department?: Department | any;
      status?: number;
    };
