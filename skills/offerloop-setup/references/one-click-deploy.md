# 一键部署流程

当用户明确说“部署完整 OfferLoop”“一键部署”或“为新用户创建整套求职空间”时，按此流程执行。“一键”指 Agent 连续执行；飞书扫码授权和本机 IMAP 授权码仍必须由用户亲自完成。

## 启动

先运行：

```bash
python3 scripts/deployment_plan.py --capability full --json
```

它只输出脱敏计划。不要输出配置值、URL token、密钥或邮件地址。用户确认“部署”后，写入可恢复的本地进度：

```bash
python3 scripts/deployment_plan.py --capability full --write-checkpoint --json
```

## 总确认后的连续阶段

1. 完整读取 `lark-shared`，确认选定 profile 的 bot 与 user 身份；缺少 user scope 时走 split-flow 授权，不借用 bot 访问个人资源。
2. 完整读取 `lark-base`、`job-collection/references/field-contract.md`、`job-collection/references/excel-insert.md` 与 `recruiting-reminder/SKILL.md`，创建三张独立 Base。严格按字段、物理子表、视图和 workflow 契约创建；不得创建编号、父记录或旧双 Base。
3. 完整读取 `offerloop-workspace`、`lark-wiki`、`lark-doc`。创建默认私有的 `OfferLoop 求职空间`、固定九项顶层目录和 README 首页；三张 Base 只登记入口，不复制记录。
4. 完整读取 `lark-apps`。分别创建并初始化两个新的妙搭全栈应用，保留新应用自己的 `.spark/meta.json` 绑定，然后用以下命令铺设随 Skill 分发的脱敏模板：

   ```bash
   python3 scripts/materialize_app_template.py --template workbench --destination '<WORKBENCH_APP_DIR>' --json
   python3 scripts/materialize_app_template.py --template progress-sync --destination '<SYNC_APP_DIR>' --json
   ```

   模板清单中的 `required_environment` 只列变量名；按新建的三个 Base 和飞书应用填写妙搭环境变量，不把值写入 Skill、本地 Git 或 checkpoint。铺设脚本必须保留新应用自己的 `.git`、`.spark`、`.spark_project`、`.env*`，再依次安装依赖、运行测试与类型检查、提交、推送和发布。模板不存在、无法访问或无法验证时停止并报告，禁止临时创建功能不完整的替代应用。
5. 创建且只启用一条“企业清单：投递进度变为已投递 → 求职进展” workflow。同步服务必须以企业主表 record ID 幂等 upsert，且不覆盖人工填写的岗位、JD、投递日期或更后阶段。
6. 将非敏感 locator 写入 `~/.config/offerloop/config.json`：profile、三个 Base URL、知识库 space/home、工作台 HTTPS URL、schema version 与 `progress_sync` 定位。不得写入 App Secret、OpenAPI key、Cookie 或 IMAP 授权码。
7. 仅创建 IMAP 模板。让用户在本机填写后，再获得第二次确认运行 `fetch_mail.py --check-connection`；不得搜索或读取邮件。
8. 完整读取 `verification-matrix.md` 后运行只读验收。即时联动演练需要临时记录时，验证后精确删除企业和进展两侧记录。

## 幂等与恢复

- 先读取已有 locator、Base、工作流和知识库节点；存在时接管，不按标题重建第二套资源。
- 已有即时工作流时检查 endpoint 与请求形状；只修复明确错误的单条工作流，避免重复触发。
- 任一阶段失败时保留已完成资源和 checkpoint，报告阶段、错误类别、未完成资源与安全重试步骤。不得删除已创建资源来“重试”。
- 工作台或同步服务模板未随安装包提供时，部署状态为 `blocked`；这是发布包缺失，不是用户权限问题。
