# Contributing

欢迎提交 Issue 和 Pull Request。

新增 Skill 时：

1. 使用小写连字符目录名：`skills/<skill-name>/`；
2. 提供 `SKILL.md`，且 frontmatter 的 `name` 与目录名一致；
3. 把详细规则放进该 Skill 的 `references/`，避免跨 Skill 隐式依赖；
4. 把重复、确定性的操作放进 `scripts/` 并添加测试；
5. 不提交真实凭证、用户路径、Base token、邮件正文或运行状态；
6. 运行仓库测试和 Skill 验证。

业务 Skill 应可独立运行。跨 Skill 联动必须是可选能力，失败时不能破坏当前 Skill 的主流程。
