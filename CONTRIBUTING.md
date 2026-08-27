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
python3 scripts/check_skill_compatibility.py
```

涉及活动妙搭模板时，也请在模板目录依次运行 `npm ci`、`npm test -- --runInBand`、
`npm run type:check` 和 `npm run build`。GitHub CI 会以 Node 20 重复执行这些检查。

业务 Skill 必须在 OfferLoop 飞书工作区中保持职责边界清晰。跨 Skill 联动失败时不能破坏已成功的
当前步骤，也不能绕过三张 Base、知识库和权限契约降级成另一套业务真源。

内部评测框架、隐藏发布集、真实用户数据、完整 Trace 和凭证不属于公开仓内容，不得随 Pull Request
提交。对外测试只能使用合成或匿名数据。
