import type { AccountType } from '@lark-apaas/client-toolkit/tools/services';
import type { UserInput } from '@client/src/components/business-ui/types/user';

export interface UserWithAvatarProps {
  /**
   * 用户数据，可以只传 userId，组件会自动查询 name 和 avatar
   */
  data: UserInput;
  /**
   * @default medium
   */
  size?: 'small' | 'medium' | 'large';
  /**
   * @default tag
   */
  mode?: 'tag' | 'plain';
  className?: string;
  /**
   * @default true
   */
  showLabel?: boolean;
  /**
   * 账户类型，用于查询用户信息
   * @default 'apaas'
   */
  accountType?: AccountType;
}
