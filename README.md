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
- `admin/` is an honest placeholder, not an authenticated CMS. Login, editing, uploading, saving and publishing are not implemented in this phase.
- Do not add confidential drafts or attachments to this repository, including Git history. A `draft` flag only hides content; it does not make a public file private. Future CMS work must use separate authenticated private storage and export only explicitly published content.
- No article-wide CC license has been applied yet. Third-party artwork is excluded from any future license applied to original articles.
