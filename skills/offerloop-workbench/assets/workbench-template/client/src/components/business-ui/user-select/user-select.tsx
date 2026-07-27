'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  searchUsers,
  convertExternalContact,
  type AccountType,
} from '@client/src/components/business-ui/api/users/service';
import { BaseCombobox } from '@client/src/components/business-ui/entity-combobox/base-combobox';
import { useEntityComboboxContext } from '@client/src/components/business-ui/entity-combobox/context';
import type {
  UserSelectItemValue,
  UserSelectProps,
} from '@client/src/components/business-ui/user-select/types';
import { useUserValue } from '@client/src/components/business-ui/user-select/use-user-value';
import { UserItem } from '@client/src/components/business-ui/user-select/user-item';
import { UserSelectTag } from '@client/src/components/business-ui/user-select/user-select-tag';
import {
  searchUserInfoToUser,
  isUnregisteredExternalContact,
} from '@client/src/components/business-ui/user-select/utils';

function createUsersFetcher(options: { accountType?: AccountType; pageSize?: number } = {}) {
  const { accountType = 'apaas', pageSize = 100 } = options;

  return async (search: string) => {
    const response = await searchUsers({ query: search, pageSize });
    const userList = response?.data?.userList || [];

    return {
      items: userList.map((user) => searchUserInfoToUser(user, accountType)),
    };
  };
}

// 内部包装组件用于获取 context 中的 size
const UserItemWrapper = ({
  userValue,
  isSelected,
  className,
  disabled,
  isConverting,
}: {
  userValue: UserSelectItemValue;
  isSelected: boolean;
  className?: string;
  disabled?: boolean;
  isConverting?: boolean;
}) => {
  const { size, searchValue } = useEntityComboboxContext();
  return (
    <UserItem
      userValue={userValue}
      isSelected={isSelected}
      className={className}
      size={size}
      searchKeyword={searchValue}
      disabled={disabled}
      isConverting={isConverting}
    />
  );
};

const UserSelectTagWrapper = ({
  userValue,
  onClose,
  className,
  disabled,
  isLoading,
  accountType,
}: {
  userValue: UserSelectItemValue;
  onClose: (value: UserSelectItemValue, e: React.MouseEvent) => void;
  className?: string;
  disabled?: boolean;
  isLoading?: boolean;
  accountType?: 'apaas' | 'lark';
}) => {
  const { size } = useEntityComboboxContext();
  return (
    <UserSelectTag
      userValue={userValue}
      onClose={onClose}
      className={className}
      size={size}
      disabled={disabled}
      isLoading={isLoading}
      accountType={accountType}
    />
  );
};

export const UserSelect: React.FC<UserSelectProps> = (props) => {
  const {
    size = 'medium',
    triggerType = 'button',
    renderTrigger,
    multiple = false,
    value,
    valueType = 'string',
    accountType = 'apaas',
    defaultValue,
    onChange,
    defaultOpen,
    disabled,
    autoFocus,
    required,
    name,
    className,
    classNames,
    placeholder = '请选择',
    emptyText = '没有匹配结果，换个关键词试试吧',
    tagClosable,
    maxTagCount,
    onSelect,
    onDeselect,
    onClear,
    onFocus,
    onBlur,
    slotProps,
    getOptionDisabled,
  } = props;

  // 使用 useUserValue 处理不同类型的 value（包括 defaultValue）
  const { internalValue, isLoading, toExternalValue } = useUserValue(
    value ?? null,
    multiple,
    accountType,
    valueType,
  );

  // 始终追踪最新 internalValue，避免异步开户回调中闭包捕获过期值
  const internalValueRef = useRef(internalValue);
  internalValueRef.current = internalValue;

  // 同样处理 defaultValue，确保 ID 字符串类型的 defaultValue 也能正确解析
  const { internalValue: internalDefaultValue } = useUserValue(
    defaultValue ?? null,
    multiple,
    accountType,
    valueType,
  );

  const baseFetchFn = useMemo(() => createUsersFetcher({ accountType }), [accountType]);

  // 正在开户中的用户 ID 集合
  const [convertingSet, setConvertingSet] = useState<Set<string>>(() => new Set());

  // 已开户用户映射：旧 ID → 转换后的 UserSelectItemValue，用于回写到待选列表
  const [convertedMap, setConvertedMap] = useState<Map<string, UserSelectItemValue>>(
    () => new Map(),
  );

  // 包装 fetchFn，将已开户用户替换到搜索结果中
  // convertedMap 变化 → fetchFn 引用变化 → useFetchData 自动 refetch
  const fetchFn = useCallback(
    async (search: string) => {
      const result = await baseFetchFn(search);
      if (convertedMap.size === 0) return result;
      return {
        ...result,
        items: result.items.map((item) => convertedMap.get(item.id) ?? item),
      };
    },
    [baseFetchFn, convertedMap],
  );

  // 标记是否有即将开户的用户（用于在 handleOpenChange 中阻止关闭）
  // 时序：handleChange（设置标记）→ handleOpenChange（检查标记）→ handleSelect（开始开户）
  const pendingConvertRef = useRef(false);

  // 受控 open 状态：开户期间阻止 popover 关闭
  const [open, setOpen] = useState(defaultOpen ?? false);
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    // 有正在开户或即将开户的用户时，不允许关闭下拉
    if (!nextOpen && pendingConvertRef.current) return;
    setOpen(nextOpen);
  }, []);

  // 开户中的用户禁止再次点击
  const mergedGetOptionDisabled = useCallback(
    (option: UserSelectItemValue) => {
      if (convertingSet.has(option.id)) return true;
      if (isUnregisteredExternalContact(option)) return false;
      return getOptionDisabled?.(option) ?? false;
    },
    [getOptionDisabled, convertingSet],
  );

  /**
   * onChange 门卫：过滤掉未注册外部联系人，不允许未开户用户进入选中列表。
   * 同时设置 pendingConvertRef 标记，阻止 handleOpenChange 关闭下拉。
   */
  const handleChange = useCallback(
    (newValue: UserSelectItemValue | UserSelectItemValue[] | null) => {
      if (!onChange) return;

      if (multiple && Array.isArray(newValue)) {
        const hasUnregistered = newValue.some((u) => isUnregisteredExternalContact(u));
        if (hasUnregistered) {
          pendingConvertRef.current = true;
        }
        const filtered = newValue.filter((u) => !isUnregisteredExternalContact(u));
        const externalValue = toExternalValue(filtered, multiple);
        (onChange as (value: unknown) => void)(externalValue);
      } else if (!multiple) {
        const user = newValue as UserSelectItemValue | null;
        if (user && isUnregisteredExternalContact(user)) {
          // 不允许未注册用户进入选中值，标记即将开户
          pendingConvertRef.current = true;
          return;
        }
        const externalValue = toExternalValue(newValue, multiple);
        (onChange as (value: unknown) => void)(externalValue);
      }
    },
    [onChange, multiple, toExternalValue],
  );

  /**
   * onSelect 拦截：检测未注册外部联系人，触发开户流程。
   * 开户成功后手动调用 onChange 回填转换后的用户。
   */
  const handleSelect = useCallback(
    (user: UserSelectItemValue) => {
      if (!isUnregisteredExternalContact(user)) {
        onSelect?.(user);
        return;
      }

      const larkUserID = user.raw?.larkUserId;
      if (!larkUserID) return;
      if (convertingSet.has(user.id)) return;

      setConvertingSet((prev) => new Set(prev).add(user.id));
      // pendingConvertRef 已在 handleChange 中设置，此处转为正式开户状态

      void (async () => {
        try {
          const result = await convertExternalContact(larkUserID);
          const { userInfo } = result.data;
          const forceUserID = String(userInfo.userID);
          const convertedUser: UserSelectItemValue = {
            ...user,
            id: forceUserID,
            raw: user.raw ? { ...user.raw, user_id: forceUserID } : undefined,
          };

          // 回写到待选列表：触发 fetchFn 引用变化 → useFetchData refetch → 列表更新
          setConvertedMap((prev) => new Map(prev).set(user.id, convertedUser));

          onSelect?.(convertedUser);
          if (onChange) {
            if (multiple) {
              const current = Array.isArray(internalValueRef.current)
                ? internalValueRef.current
                : [];
              const externalValue = toExternalValue([...current, convertedUser], multiple);
              (onChange as (value: unknown) => void)(externalValue);
            } else {
              const externalValue = toExternalValue(convertedUser, multiple);
              (onChange as (value: unknown) => void)(externalValue);
            }
          }
          // 开户成功后关闭下拉（单选）
          if (!multiple) {
            pendingConvertRef.current = false;
            setOpen(false);
          }
        } catch {
          toast.error('外部用户添加失败');
        } finally {
          setConvertingSet((prev) => {
            const next = new Set(prev);
            next.delete(user.id);
            // 所有开户完成后清除标记
            if (next.size === 0) {
              pendingConvertRef.current = false;
            }
            return next;
          });
        }
      })();
    },
    [onSelect, onChange, multiple, toExternalValue, convertingSet],
  );

  const renderTagWithLoading = useCallback(
    (
      userValue: UserSelectItemValue,
      onClose: (value: UserSelectItemValue, e: React.MouseEvent) => void,
      tagDisabled?: boolean,
    ) => (
      <UserSelectTagWrapper
        key={userValue.id}
        userValue={userValue}
        onClose={onClose}
        disabled={tagDisabled}
        isLoading={isLoading}
        accountType={accountType}
      />
    ),
    [isLoading, accountType],
  );

  return (
    <BaseCombobox
      autoFocus={autoFocus}
      className={className}
      classNames={classNames}
      debounce={300}
      open={open}
      onOpenChange={handleOpenChange}
      defaultValue={internalDefaultValue}
      disabled={disabled}
      emptyText={emptyText}
      fetchFn={fetchFn}
      getItemLabel={(userValue) => userValue.name}
      getItemValue={(userValue) => userValue}
      getOptionDisabled={mergedGetOptionDisabled}
      maxTagCount={maxTagCount}
      multiple={multiple}
      name={name}
      onBlur={onBlur}
      onChange={handleChange}
      onClear={onClear}
      onDeselect={onDeselect}
      onFocus={onFocus}
      onSelect={handleSelect}
      placeholder={placeholder}
      renderItem={(userValue, isSelected, itemClassName, itemDisabled) => (
        <UserItemWrapper
          key={userValue.id}
          userValue={userValue}
          isSelected={isSelected}
          className={itemClassName}
          disabled={itemDisabled}
          isConverting={convertingSet.has(userValue.id)}
        />
      )}
      renderTag={renderTagWithLoading}
      renderTrigger={renderTrigger}
      required={required}
      searchPlaceholder=""
      showSearch
      size={size}
      slotProps={slotProps}
      tagClosable={tagClosable}
      triggerType={triggerType}
      value={internalValue}
    />
  );
};

export { type UserSelectItemValue as UserValue };

export { ItemPill } from '@client/src/components/business-ui/entity-combobox/item-pill';
