'use client';

import { useCallback, useMemo } from 'react';

import { useUsersByIds } from '@client/src/components/business-ui/api/users/queries';
import type {
  AccountType,
  UserSelectItemValue,
  UserSelectValue,
  ValueType,
} from '@client/src/components/business-ui/user-select/types';
import {
  extractIdsFromValue,
  userInfoToUser,
  createUnknownUser,
} from '@client/src/components/business-ui/user-select/utils';
import { getI18nText } from '@client/src/components/business-ui/utils/user';
import type { User } from '@client/src/components/business-ui/types/user';

/**
 * 将 User 转换为 UserSelectItemValue
 */
function userToItemValue(user: User, accountType: AccountType): UserSelectItemValue {
  return {
    id: accountType === 'lark' ? (user.larkUserId || user.user_id || '') : (user.user_id || user.larkUserId || ''),
    name: getI18nText(user.name) || '未知用户',
    avatar: user.avatar,
    raw: user,
  };
}

export type UseUserValueResult = {
  /**
   * 标准化后的内部 value（UserSelectItemValue 对象格式）
   * 用于传递给 BaseCombobox
   */
  internalValue: UserSelectItemValue | UserSelectItemValue[] | null;

  /**
   * 是否正在加载用户信息
   */
  isLoading: boolean;

  /**
   * 将内部 UserSelectItemValue 对象转换回外部格式
   * ID 模式时返回字符串，对象模式时返回 UserSelectItemValue
   */
  toExternalValue: (
    internalVal: UserSelectItemValue | UserSelectItemValue[] | null,
    multiple: boolean,
  ) => UserSelectValue;
};

/**
 * 处理 UserSelect 的 value 类型转换
 *
 * - 根据 valueType 决定 value 是 ID 字符串还是 UserSelectItemValue 对象
 * - ID 模式下调用 API 获取完整用户信息（使用 react-query 缓存）
 * - 无效 ID 生成 "未知用户" 占位
 *
 * @param value - 外部传入的 value
 * @param multiple - 是否多选模式
 * @param accountType - 账户类型
 * @param valueType - 值类型，'string' 表示 ID 模式，'object' 表示 UserSelectItemValue 对象模式
 */
export function useUserValue(
  value: UserSelectValue,
  multiple: boolean = false,
  accountType: AccountType = 'apaas',
  valueType: ValueType = 'string',
): UseUserValueResult {
  const isIdMode = valueType === 'string';

  // 提取当前 value 中的所有 ID
  const currentIds = useMemo(() => extractIdsFromValue(value), [value]);

  // ID 模式下需要获取的 ID 列表（去重和排序，确保相同的 ID 集合有相同的 queryKey）
  const idsToFetch = useMemo(() => {
    if (!isIdMode) return [];
    return [...new Set(currentIds.map(String))].filter(Boolean).sort();
  }, [isIdMode, currentIds]);

  // 使用 react-query hook 获取用户信息
  const { data: response, isLoading } = useUsersByIds(idsToFetch, accountType);

  // 构建 ID -> UserSelectItemValue 的映射
  const usersMap = useMemo(() => {
    const map = new Map<string, UserSelectItemValue>();
    const userInfoMap = response?.data?.userInfoMap || {};

    for (const id of idsToFetch) {
      const userInfo = userInfoMap[id];
      const user = userInfo
        ? userInfoToUser(userInfo, accountType)
        : createUnknownUser(id);
      map.set(String(id), user);
    }
    return map;
  }, [response, idsToFetch, accountType]);

  const internalValue = useMemo((): UserSelectItemValue | UserSelectItemValue[] | null => {
    if (value === null || value === undefined) {
      return multiple ? [] : null;
    }

    if (Array.isArray(value) && value.length === 0) {
      return [];
    }

    if (!isIdMode) {
      // Object 模式：将 User 转换为 UserSelectItemValue
      if (Array.isArray(value)) {
        return (value as User[]).map((user) => userToItemValue(user, accountType));
      }
      return userToItemValue(value as User, accountType);
    }

    const users = currentIds
      .map((id) => usersMap.get(String(id)))
      .filter((u): u is UserSelectItemValue => u !== undefined);

    if (multiple) {
      return users;
    }

    return users[0] ?? null;
  }, [value, isIdMode, currentIds, usersMap, multiple, accountType]);

  const toExternalValue = useCallback(
    (
      internalVal: UserSelectItemValue | UserSelectItemValue[] | null,
      isMultiple: boolean,
    ): UserSelectValue => {
      if (internalVal === null) {
        return null;
      }

      if (isIdMode) {
        // ID 模式：返回 string 或 string[]
        if (isMultiple) {
          return (internalVal as UserSelectItemValue[]).map((u) => String(u.id));
        }
        return String((internalVal as UserSelectItemValue).id);
      }

      // Object 模式：提取 raw 数据，返回标准 User 类型
      if (isMultiple) {
        return (internalVal as UserSelectItemValue[]).map((u) => u.raw!);
      }
      return (internalVal as UserSelectItemValue).raw!;
    },
    [isIdMode],
  );

  return {
    internalValue,
    isLoading,
    toExternalValue,
  };
}
