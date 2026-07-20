import { normalizeUser, isValidUserId } from '@client/src/components/business-ui/utils/user';
import type { User } from '@client/src/components/business-ui/types/user';
import type { UserInfo } from '@lark-apaas/client-toolkit/tools/services';
import type { AccountType } from '@client/src/components/business-ui/api/users/service';

// 直接导出统一的函数
export { normalizeUser, isValidUserId };

// user-display 专用的转换函数
export function userInfoToUser(
  userInfo: (UserInfo & { avatar?: any }) | any,
  accountType: AccountType,
): User {
  let avatarUrl: string | undefined;

  if (typeof userInfo.avatar === 'string') {
    avatarUrl = userInfo.avatar;
  } else if (userInfo.avatar?.image?.large) {
    avatarUrl = userInfo.avatar.image.large;
  }

  return {
    user_id: accountType === 'lark' ? userInfo.larkUserID : userInfo.userID,
    larkUserId: userInfo.larkUserID,
    name: userInfo.name,
    avatar: avatarUrl,
    user_type: userInfo.userType,
    department: userInfo.department as any,
  };
}

export function createUnknownUser(user_id: string): User {
  return {
    user_id,
    name: '未知用户',
  };
}
