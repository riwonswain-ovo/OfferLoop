# OfferLoop 安装模式契约

每个 OfferLoop Skill 开始工作前，先运行同级隐藏运行时中的
`scripts/install_mode.py`，并按输出选择行为。该脚本只读取本机非敏感配置，不联网。

## `full`：完整闭环

- 安装 9 个 Skill。
- 使用用户私有的 OfferLoop 飞书知识库和三张业务 Base。
- 除 `career-profile` 外，8 个业务 Skill 先执行 `profile-gate.md`。
- 产出型 Skill 默认按 `artifact-contract.md` 自动保存到飞书；用户可在当轮明确说“不保存”。
- 旧工作台已经退役；自动化和公网服务不属于完整模式的必需组件，只有用户另行选择时才配置。

## `single`：单 Skill

- 只保证已选择 Skill 与隐藏的最小共享运行时存在。
- 跳过全局飞书用户画像门禁；只询问当前任务真正需要的最小信息。
- 默认在 Chat 中交付结果，不自动创建知识库、Base、目录、文档、日历或任务。
- 用户明确要求连接飞书，并完成相应授权和 locator 配置后，才读取或写入飞书。
- Skill 本身以飞书为核心输入或输出时（例如 `job-collection`），应解释该项连接是执行当前功能
  所需，而不是把整套 OfferLoop 工作区作为前置条件。

配置缺失、损坏或来自旧版时，为保护既有用户的数据与自动保存习惯，按 `full` 兼容处理，并提示
用户可重新运行 `scripts/setup_offerloop.py` 明确选择模式。
