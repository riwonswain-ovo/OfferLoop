import type { Chat, ChatInfo, ChatSelectValue, I18nText } from './types';

/**
 * 获取国际化文本显示值（独立实现，不依赖其他组件）
 */
function getI18nText(text: I18nText | string | undefined): string {
  if (!text) return '';
  if (typeof text === 'string') return text;
  return text.zh_cn || text.en_us || text.ja_jp || '';
}

/**
 * 获取群组显示名称
 */
export function getChatDisplayName(name: ChatInfo['name']): string {
  return getI18nText(name);
}

/**
 * ChatInfo → Chat 标准化转换
 */
export function chatInfoToChat(chatInfo: ChatInfo): Chat {
  return {
    id: chatInfo.chatID,
    name: getChatDisplayName(chatInfo.name),
    avatar: chatInfo.avatar,
    raw: chatInfo,
  };
}

/**
 * 创建未知群组占位（ID 无法解析时使用）
 */
export function createUnknownChat(id: string): Chat {
  return {
    id,
    name: '未知群组',
    avatar: '',
    raw: undefined,
  };
}

/**
 * 判断 value 是否为 ID 模式（字符串或字符串数组）
 */
export function isIdModeValue(
  value: ChatSelectValue,
): value is string | string[] {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return true;
  }
  if (Array.isArray(value) && value.length > 0) {
    return typeof value[0] === 'string';
  }
  return false;
}

/**
 * 从 value 中提取 ID 列表
 */
export function extractIdsFromValue(value: ChatSelectValue): string[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [];
    }
    if (typeof value[0] === 'string') {
      return value as string[];
    }
    return (value as Chat[]).map((c) => c.id);
  }
  return [(value as Chat).id];
}
