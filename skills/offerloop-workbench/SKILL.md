---
name: offerloop-workbench
description: 按需创建、部署、升级和验收 OfferLoop 飞书可视化工作台。仅当用户明确要求“搭建/部署/打开/修复 OfferLoop 工作台”“配置妙搭应用或工作台 OAuth”“发布招聘数据面板”时使用；工作台是可选体验层，读取既有知识库和三张业务 Base，不创建业务真源，不影响 job-collection、recruiting-reminder 或训练 Skill 的独立运行。
---

# OfferLoop Workbench

按需部署 OfferLoop 的飞书可视化工作台。知识库、企业清单、求职进展、笔面试中心和训练产物
必须已经由 `offerloop-setup` / `offerloop-workspace` 创建或接管；本 Skill 不拥有这些数据。

运行脚本前，先根据当前 `SKILL.md` 所在位置解析 Skill 根目录；所有 `scripts/...` 和
`assets/...` 都相对该目录，不假设 Agent 当前工作目录。

## 职责边界

- `offerloop-setup`：初始化 OfferLoop 核心空间、飞书身份、权限和资源定位。
- `offerloop-workspace`：维护必需的私有知识库、三张 Base 入口和训练 Markdown 产物。
- 本 Skill：创建或接管妙搭应用，铺设工作台模板，配置 OAuth 和环境变量，发布并验收。

未安装、未运行、未配置或部署失败时，工作台状态保持 `not_selected`、`needs_action` 或
`blocked`；不得回滚 Base、日历、知识库文档或训练产物，也不得把 OfferLoop 核心能力报为失败。

## 前置检查

从 `~/.config/offerloop/config.json` 读取非敏感定位：

- `lark_profile`
- `target_base_url`
- `progress_base_url`
- `reminder_base_url`
- `wiki_space_id`
- `workspace_home_node_token`
- 可选的 `workbench_url`

先调用 `offerloop-setup` 运行：

```bash
python3 scripts/preflight.py --capability workbench --json
```

缺少知识库或三张 Base 时先完成核心初始化。不要由工作台新建第二套业务 Base，也不要根据标题
猜测资源。App Secret、OAuth token、Cookie 和部署凭据不得写入公共配置、Git 或对话。

## 部署流程

用户明确要求搭建或修复工作台时，完整读取 `references/golden-path.md`。依次执行：

1. 只读核验知识库和三张 Base locator。
2. 创建或接管用户指定的妙搭应用；发现已有应用时禁止重复创建。
3. 在已绑定的本地妙搭项目上运行模板铺设：

```bash
python3 scripts/materialize_workbench.py \
  --destination '<MIAODA_PROJECT_DIR>' \
  --dry-run \
  --json
```

4. 展示将覆盖的版本化文件数量；用户确认后去掉 `--dry-run` 执行。
5. 按黄金路径配置环境变量、OAuth 回调和最小 scope。
6. 发布应用并完成发布后浏览器验收。
7. 验收成功后，通过 `offerloop-setup/scripts/configure.py --workbench-url` 登记 HTTPS 入口。
8. 可选地更新知识库首页的工作台入口；没有入口时首页仍保持完整可用。

模板铺设只覆盖版本化源码，必须保留目标项目自己的 `.spark`、`.env*`、日志、构建产物和凭据。

## 验收

不能把“代码已复制”“页面能打开”或“用户完成授权”单独表述为部署成功。至少确认：

- 工作台 HTTPS 地址可访问。
- 三张 Base 只读加载正常，首屏不做全量扫描。
- 投递管理看板视图每页最多 9 条，表格视图的三张表各自每页最多 15 条；当前 Base / 当前视图按需读取。
- 日历 OAuth 使用正确回调、最小 scope 和服务端 token 契约。
- 知识库入口可选展示工作台链接；删除或停用该链接不影响知识库。
- 任一工作台错误不写回或删除业务数据。

## 安全与回滚

- 发布、覆盖应用源码、修改环境变量或 OAuth 配置前列出精确目标并取得确认。
- 不复制模板来源应用的绑定、密钥或环境文件。
- 不删除旧应用；需要切换时保留旧入口作为回滚。
- 工作台只做读取、筛选和导航；业务编辑仍进入对应 Base。
