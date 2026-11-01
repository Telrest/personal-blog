# 网站发布

- 正式地址：https://telrest.github.io/the-secret-of-design/
- 魔丸模式：https://telrest.github.io/the-secret-of-design/#/game
- 仓库：https://github.com/Telrest/the-secret-of-design
- 发布记录：https://github.com/Telrest/the-secret-of-design/actions

## 自动更新

`main` 分支通过 GitHub Actions 自动测试、构建并发布到 GitHub Pages。
更新本地代码后，提交并推送到 `main`；等最新的发布流程成功，网站即更新。
测试或构建失败时不会覆盖已经上线的版本。

## 构建配置

- Node.js 24，使用 `npm ci` 安装锁定依赖。
- 检查：`npm test`。
- 上线构建：`npm run build -- --base=/the-secret-of-design/`。
- 发布目录：`dist/`，不将依赖、截图和构建产物提交到源代码仓库。
- Hash 路由保留 `#/exhibit/pen`、`#/game` 等入口，无需服务器重写。
- CI 单独指定 GitHub Pages 的子目录，保留本地 Vite 的相对路径配置。
- 三维模型、许可文本和游戏贴图与网站一起发布，不依赖本机磁盘路径。

部署流程位于 `.github/workflows/deploy.yml`。如果以后绑定自定义域名，
需要同步调整构建时的 `base`，并在仓库 Pages 设置中配置域名。
