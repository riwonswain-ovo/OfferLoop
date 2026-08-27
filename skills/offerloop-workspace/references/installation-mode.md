# OfferLoop 飞书完整模式契约

每个 OfferLoop Skill 开始工作前，先运行同级隐藏运行时中的
`scripts/install_mode.py`。该脚本只读取本机非敏感配置，不联网；正式运行只接受 `full`。

## `full`：飞书完整闭环

- 安装 7 个长期 Skill。
- 使用用户私有的 OfferLoop 飞书知识库和三张业务 Base。
- 不执行全局画像门禁；每个 Skill 只收集当前任务所需的最小信息。
- 产出型 Skill 默认按 `artifact-contract.md` 自动保存到飞书；用户可在当轮明确说“不保存”。
- 旧工作台已经退役；自动化和公网服务不属于完整模式的必需组件，只有用户另行选择时才配置。

配置缺失、损坏或记录为旧版 `single` 时，脚本返回 `migration_required=true`。Skill 可以说明当前
任务所需信息和只读准备步骤，但在三张 Base、知识库 locator 与权限完成验收前不得把 OfferLoop
报告为 `ready`，也不得把 Chat-only 或本地文件流程描述成受支持的独立模式。引导用户运行
`scripts/setup_offerloop.py --agent <agent> --mode full` 完成迁移和飞书初始化。
