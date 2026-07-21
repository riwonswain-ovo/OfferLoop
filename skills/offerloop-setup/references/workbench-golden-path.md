# OfferLoop 工作台一次成功部署路径

本文件是部署 `workspace` 或 `full` 时的强制执行契约。它固化已经在线跑通的方案，优先级高于
临时猜测或旧实现。除用户亲自同意 OAuth 外，其余步骤由 Agent 连续完成并逐门验收。

## 1. 发布前固定契约

### Base 与首屏

- 三个 Base 的默认视图都按“信息更新时间/创建时间/开始时间”降序，确保新增记录位于最上方；
  只改视图排序，不重排或复制记录。
- 工作台首屏只请求工作台元数据和当前 Base 的当前视图第一页；每页固定 30 条。
- 其他 Base、其他子视图和下一页只在用户切换或翻页时读取，page token 按数据集和视图隔离缓存。
- React 首次加载和 OAuth 完成必须有一次性 guard，开发模式 StrictMode 也不能发起两次令牌轮换。

### 飞书应用

开发者后台同时开通并发布：

```text
calendar:calendar:readonly
calendar:calendar.event:read
offline_access
```

安全设置精确登记：

```text
<WORKBENCH_PUBLIC_URL>/calendar-oauth-callback
```

只登记前端路由。禁止把重定向 URL 写成
`<WORKBENCH_PUBLIC_URL>/api/workbench/calendar/oauth/callback`，否则飞书跨站 302 到妙搭 API 时没有
妙搭 CSRF header，会得到 `Forbidden, csrf token not found in header`。

### OAuth 与令牌

1. 授权 URL 显式传入上述三个 scope，scope 用空格分隔并正确 URL 编码。
2. 飞书回跳专用 React 路由 `/calendar-oauth-callback?code=...&state=...`。
3. 页面使用妙搭项目的同源请求客户端 POST `/api/workbench/calendar/oauth/complete`；不得用浏览器
   原生跨站回跳直接访问 API。
4. 服务端校验加密 state Cookie 后，用 JSON 请求交换令牌；回调只执行一次。
5. Cookie 只保存 `userId`、refresh token 和 refresh token 过期时间，使用 HttpOnly、Secure、
   SameSite=Lax、工作台 path，并按不超过 3000 字符分片。
6. access token 不写入 Cookie、环境变量、Git、日志或配置；每次日历读取用 refresh token 换取，
   仅在本次服务端请求内使用，并把轮换后的 refresh token 重新加密写回。
7. scope 或会话结构改变时升级 Cookie 名称版本，让旧授权明确迁移；不要继续解密旧结构后猜测兼容。

### 日历 API

固定调用顺序：

```text
POST /open-apis/authen/v2/oauth/token              # refresh_token grant
POST /open-apis/calendar/v4/calendars/primary      # 注意：必须是 POST
GET  /open-apis/calendar/v4/calendars/:id/events/instance_view
```

`instance_view` 的时间范围为当天 00:00 起未来 7 天。只显示标题或描述包含笔试、测评、机试、面试、
群面、一面至五面或 HR 面的未取消事件。`calendar_id` 必须 URL 编码。

## 2. 构建与发布门禁

在铺设后的妙搭工作台目录依次执行：

```bash
npm run type:check
npm test -- --runInBand
npm run lint
npm run build
```

四项全部通过后，才提交并推送 `sprint/default`。`+release-create` 只发布已经推送的远端提交；拿到
release ID 后，每 20 秒用 `+release-get` 查询，只有同一 release 返回 `finished` 且 commit ID 等于
本次提交，才能进入浏览器验收。`publishing`、旧 commit 或页面能打开都不算完成。

## 3. 浏览器验收门禁

按顺序检查，不跳步：

1. 刷新工作台，页面应在常规网络下 10 秒内可交互；“投递进展数据”存在，默认数据集第一页为
   30 条，其他 Base/子视图可切换并翻页。
2. “未来 7 天笔试与面试”显示“来自飞书个人日历”，同时保留“打开日历 Base”。
3. 点击“连接飞书日历”。授权页必须展示“读取日程信息”和“获取日历、日程及忙闲信息”，以及
   持续访问授权。
4. 用户同意后应回到工作台；连接按钮消失，没有空白页、Forbidden、400/503、“授权会话过长”
   或“个人日历暂时读取失败”。有匹配事件时显示标题和时间；无匹配事件时显示 0 项属于成功。
5. 再刷新一次。连接按钮仍不出现、未来 7 天仍可读取，证明 refresh token 轮换和 Cookie path 正常。
6. 查看线上日志/Trace：OAuth complete 为成功响应，calendar GET 为 200；确认 release commit ID 是
   本轮提交。不得读取或输出 Cookie/token。

只有六步全部通过，`workspace` 才能标为 `ready`。

## 4. 症状到修复的固定映射

| 症状 | 原因 | 固定修复 |
| --- | --- | --- |
| `csrf token not found in header` | OAuth 直接 302 到妙搭 API | 回调改为前端路由，再同源 POST API；不关闭 CSRF |
| 授权后空白或一直加载 | 回调页没有独立路由，或重复初始化 | 注册 `/calendar-oauth-callback`，OAuth complete 与首次加载各加一次性 guard |
| 400/503 且看不到飞书错误 | 网关吞掉了异常响应 | OAuth 交换保留飞书安全错误描述并返回可展示的业务结果；绝不回显 token |
| “授权会话过长” | access + refresh token 一起加密后超过 Cookie 限制 | Cookie 只存 refresh token 并分片，access token 仅在服务端内存 |
| 已连接但主日历读取失败 | 缺少 readonly scope，或主日历误用 GET | 同时请求两项日历 scope；主日历改为 POST |
| 授权码偶发失败 | 查询解析把 `+` 变成空格 | 交换前将 code 中的空格规范回 `+`，同时保留 URL 编码 |
| 刷新后掉线 | Cookie path/轮换写回错误，或重复 refresh | Cookie path 使用工作台公开 URL path；每次刷新只发一个 calendar 请求并写回新 refresh token |
| 首屏约一分钟 | 首屏全量扫描多个 Base 和视图 | 元数据先行、当前视图按需取 30 条；切换和翻页再加载；用 Trace 验证 |

同一症状修复后必须从“构建与发布门禁”重新开始，不在未发布的本地代码上反复让用户授权。
