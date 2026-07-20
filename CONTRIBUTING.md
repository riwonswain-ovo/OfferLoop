# Contributing

欢迎提交 Issue 和 Pull Request。

新增 Skill 时：

1. 使用小写连字符目录名：`skills/<skill-name>/`；
2. 提供 `SKILL.md`，且 frontmatter 的 `name` 与目录名一致；
3. 把详细规则放进该 Skill 的 `references/`，避免跨 Skill 隐式依赖；
4. 把重复、确定性的操作放进 `scripts/` 并添加测试；
5. 不提交真实凭证、用户路径、Base token、邮件正文或运行状态；
6. 运行仓库测试和 Skill 验证。

当前完整测试命令：

```bash
python3 -m unittest discover -s tests -v
python3 -m unittest discover -s skills/job-collection/tests -v
python3 -m unittest discover -s skills/recruiting-reminder/tests -v
npm --prefix services/job-progress-sync test
python3 skills/job-collection/scripts/validate_skill.py
```

涉及妙搭模板时，也请在每个模板目录依次运行 `npm ci`、`npm test -- --runInBand`、
`npm run type:check` 和 `npm run build`。GitHub CI 会以 Node 20 对两份可部署模板重复执行这些检查。

业务 Skill 应可独立运行。跨 Skill 联动必须是可选能力，失败时不能破坏当前 Skill 的主流程。
