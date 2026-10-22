# personal blog

Telrest 的个人博客首页。Astro 静态网站，适配桌面和手机，包含玻璃导航、明暗模式、分类空状态、实验室与关于区域。

Telrest’s personal homepage, built with Astro. Includes responsive glass navigation, light/dark themes, category empty states, a lab, and an about section.

## 本地使用 / Local use

Requires Node.js 22.12+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

访问终端显示的 `/personal-blog/` 地址。构建：`npm run build`；构建预览：`npm run preview`。

Open the printed URL with `/personal-blog/`. Build with `npm run build`; preview the build with `npm run preview`.

## GitHub Pages

Repository: `Telrest/personal-blog`. In Settings → Pages, select GitHub Actions as the build source. Push to `main` to publish via the included workflow.

Expected URL: https://telrest.github.io/personal-blog/

## 内容与图片 / Content and artwork

- 个人信息：`src/data/site.ts`；首页：`src/pages/index.astro`；样式：`src/styles/global.css`。
- Wallpaper: `public/images/forest-wallpaper.jpg`. Supplied by the owner; artist and license currently unconfirmed. See `ASSETS.md`.
- There are no published articles yet. Category names are provisional. No sample posts are presented as real writing.
- `admin/` 支持 Markdown 编辑、文件及粘贴导入、排版、清理后的预览和导出。配置 Supabase 后可用 GitHub 登录，作者可以自动或手动保存私密草稿、归档和查看历史版本。接入步骤见 [私密草稿配置](docs/PRIVATE-DRAFTS-SETUP.md)。未配置时仍为本次页面试写，离开前请导出；不把草稿存入 localStorage。图片上传及评论稍后接入。
- `admin/` supports Markdown editing, file/paste import, formatting, sanitized preview, and export. After Supabase setup, authors can sign in with GitHub, save private drafts manually or automatically, archive them, and inspect history. See [Private draft setup](docs/PRIVATE-DRAFTS-SETUP.md). Without configuration, writing remains temporary; export before leaving. Draft text is not stored in localStorage. Image uploads and comments come later.
- 发布流程已实现，启用方法见 [发布与备份配置](docs/PUBLISHING-SETUP.md)：只将定稿写入公开仓库，生成 `/articles/` 列表、文章页面和首页分类记录。完整 JSON 备份包含私密历史，可以本地载入；只有上线与备份验证都成功后才可清理云端。启用需要第二份数据库脚本、`blog-publish` 服务和仅限此仓库的 GitHub 写入凭据。图片上传和评论仍待实现。
- The publishing flow is implemented; see [Publishing and backup setup](docs/PUBLISHING-SETUP.md). Only final articles enter the public repository, generating `/articles/`, article pages, and homepage listings. Full JSON backups retain private history and support local restore. Cloud cleanup requires successful deployment and backup verification. Activation requires the second migration, the `blog-publish` service, and a GitHub write credential restricted to this repository. Image uploads and comments remain unimplemented.
- Do not add confidential drafts or attachments to this repository, including Git history. A `draft` flag only hides content; it does not make a public file private. Future CMS work must use separate authenticated private storage and export only explicitly published content.
- No article-wide CC license has been applied yet. Third-party artwork is excluded from any future license applied to original articles.
