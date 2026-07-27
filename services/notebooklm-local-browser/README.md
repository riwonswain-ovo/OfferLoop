# OfferLoop NotebookLM 私人浏览器

这个服务只在本机 `127.0.0.1` 上提供一个可通过网页操作的 Chromium，并默认打开
NotebookLM。Chromium 的个人资料和 Google 登录状态保存在 Docker volume
`notebooklm-browser-data` 中。

## 地址

- 飞书内入口：`http://127.0.0.1:39002/`

## 运行

```bash
docker-compose up -d
docker-compose ps
docker-compose logs --tail 100
```

服务端口仅绑定到 `127.0.0.1`，不会暴露到局域网或公网。飞书看到的只是本机
远程画面；其中 Chromium 访问 Google 和 NotebookLM 时仍使用官方 HTTPS。

`com.offerloop.notebooklm-browser.plist` 会在登录这台 Mac 后运行安装到
`~/Library/Application Support/OfferLoop/notebooklm-browser` 的运行副本，
恢复 Colima 和私人 Chromium。该启动项是单次、幂等的，不会常驻轮询。
