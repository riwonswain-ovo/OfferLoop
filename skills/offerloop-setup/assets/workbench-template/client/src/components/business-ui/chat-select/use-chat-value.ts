'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { listChatsByIds } from '@client/src/components/business-ui/api/chats/service';
import type {
  Chat,
  ChatSelectValue,
  ValueType,
} from '@client/src/components/business-ui/chat-select/types';
import {
  chatInfoToChat,
  createUnknownChat,
  extractIdsFromValue,
} from '@client/src/components/business-ui/chat-select/utils';

export type UseChatValueResult = {
  /**
   * 标准化后的内部 value（Chat 对象格式）
   * 用于传递给 BaseCombobox
   */
  internalValue: Chat | Chat[] | null;

  /**
   * 是否正在加载群组信息
   */
  isLoading: boolean;

  /**
   * 将内部 Chat 对象转换回外部格式
   * ID 模式时返回字符串，对象模式时返回 Chat
   */
  toExternalValue: (
    internalVal: Chat | Chat[] | null,
    multiple: boolean,
  ) => ChatSelectValue;
};

/**
 * 处理 ChatSelect 的 value 类型转换
 *
 * - 根据 valueType 决定 value 是 chatID 字符串还是 Chat 对象
 * - ID 模式下调用搜索 API 获取完整群组信息
 * - 无效 ID 生成 "未知群组" 占位
 *
 * @param value - 外部传入的 value
 * @param multiple - 是否多选模式
 * @param valueType - 值类型，'string' 表示 ID 模式，'object' 表示 Chat 对象模式
 */
export function useChatValue(
  value: ChatSelectValue,
  multiple: boolean = false,
  valueType: ValueType = 'string',
): UseChatValueResult {
  const isIdMode = valueType === 'string';

  const [resolvedChats, setResolvedChats] = useState<Map<string, Chat>>(
    new Map(),
  );
  const [isLoading, setIsLoading] = useState(false);

  const currentIds = useMemo(() => extractIdsFromValue(value), [value]);

  const missingIds = useMemo(() => {
    if (!isIdMode) return [];
    return currentIds.filter((id) => !resolvedChats.has(String(id)));
  }, [isIdMode, currentIds, resolvedChats]);

  // 稳定化 missingIds 引用
  const missingIdsKey = missingIds.join(',');

  useEffect(() => {
    if (!missingIdsKey) {
      return;
    }

    const ids = missingIdsKey.split(',');
    let cancelled = false;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const response = await listChatsByIds(ids);
        if (cancelled) return;

        const chatInfoMap = response?.data?.chatInfoMap || {};
        setResolvedChats((prev) => {
          const next = new Map(prev);
          for (const [chatId, chatInfo] of Object.entries(chatInfoMap)) {
            const chat = chatInfoToChat(chatInfo);
            next.set(String(chatId), chat);
          }
          // 标记未找到的 ID 为未知群组
          for (const id of ids) {
            if (!next.has(String(id))) {
              next.set(String(id), createUnknownChat(id));
            }
          }
          return next;
        });
      } catch (error) {
        console.error('Failed to resolve chat IDs:', error);
        if (!cancelled) {
          setResolvedChats((prev) => {
            const next = new Map(prev);
            for (const id of ids) {
              if (!next.has(String(id))) {
                next.set(String(id), createUnknownChat(id));
              }
            }
            return next;
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [missingIdsKey]);

  const internalValue = useMemo((): Chat | Chat[] | null => {
    if (value === null || value === undefined) {
      return multiple ? [] : null;
    }

    if (Array.isArray(value) && value.length === 0) {
      return [];
    }

    if (!isIdMode) {
      return value as Chat | Chat[];
    }

    const chats = currentIds
      .map((id) => resolvedChats.get(String(id)))
      .filter((c): c is Chat => c !== undefined);

    if (multiple) {
      return chats;
    }

    return chats[0] ?? null;
  }, [value, isIdMode, currentIds, resolvedChats, multiple]);

  const toExternalValue = useCallback(
    (
      internalVal: Chat | Chat[] | null,
      isMultiple: boolean,
    ): ChatSelectValue => {
      if (internalVal === null) {
        return null;
      }

      if (isIdMode) {
        // ID 模式：返回 string 或 string[]
        if (isMultiple) {
          return (internalVal as Chat[]).map((c) => String(c.id));
        }
        return String((internalVal as Chat).id);
      }

      // Object 模式：直接返回 Chat 对象
      return internalVal;
    },
    [isIdMode],
  );

  return {
    internalValue,
    isLoading,
    toExternalValue,
  };
}
