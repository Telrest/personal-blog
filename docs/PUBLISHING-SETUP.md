# 发布与备份配置指南 / Publishing & Backup Setup

本指南适用于已实现私有草稿和登录功能的仓库：`Telrest/personal-blog`。

This guide covers the existing private-draft/login workflow for `Telrest/personal-blog`.

- 线上站点 / Live site: <https://telrest.github.io/personal-blog/>
- Supabase 项目引用 / Project ref: `xsemjxtrrqagenegqynl`

## 1. 只执行一次新迁移 / Run the new migration once

在 Supabase Dashboard 的 **SQL Editor** 中执行一次：

Run this once in the Supabase Dashboard **SQL Editor**:

`supabase/migrations/202610220002_publishing_backup.sql`

之后不要重复执行，也不要重跑第一份迁移脚本。

Do not run it again, and do not rerun the first migration.

该迁移提供一致的草稿/历史快照，以及仅供服务端在上线、备份校验通过后调用的清理函数。

It adds a consistent draft/history snapshot and a server-only cleanup function used after publication and backup verification.

## 2. 生成并部署发布函数 / Generate and deploy the function

本地运行 / Locally run:

```text
npm run prepare:publisher
```

这会生成 `.local/publisher/blog-publish.ts`；生成文件不含密钥。

This generates `.local/publisher/blog-publish.ts`; the generated file contains no secrets.

在 Supabase Dashboard 中打开 **Edge Functions → Deploy new function → Via Editor**，将生成文件的**完整内容**粘贴进去，函数名填写 `blog-publish`，然后部署。

In Supabase Dashboard, open **Edge Functions → Deploy new function → Via Editor**, paste the **entire generated file**, name it `blog-publish`, and deploy.

只对这个函数关闭平台旧的 `verify_jwt` 网关校验。函数代码本身使用 `Auth.getUser` 校验真实用户 JWT，并调用作者 RPC；不要删除这段手动校验。

Disable the platform legacy `verify_jwt` gate **only for this function**. The code itself verifies the real user JWT with `Auth.getUser` and calls the author RPC; do not remove that manual verification.

CLI 可替代编辑器部署 / CLI alternative:

```text
supabase functions deploy blog-publish --project-ref xsemjxtrrqagenegqynl
```

`config.toml` 已为该函数设置 `verify_jwt=false`。

`config.toml` already sets `verify_jwt=false` for this function.

## 3. 创建 GitHub 凭据 / Create the GitHub credential

创建 **fine-grained PAT** / Create a **fine-grained PAT**:

- Resource owner: `Telrest`
- Repository access: **Only select repositories → `personal-blog`**
- Permissions: **Contents: Read and write**
- 设置合理过期时间 / Set a sensible expiry

由人工将令牌只填入 Supabase **Edge Functions → Secrets** 的 `BLOG_GITHUB_TOKEN`。

A human must enter the token **only** in Supabase **Edge Functions → Secrets** as `BLOG_GITHUB_TOKEN`.

绝不要把令牌放入 `PUBLIC_` 变量、代码、聊天或 Git。

Never put the token in `PUBLIC_` variables, code, chat, or Git.

`SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY` 由 Supabase 运行时自动提供；无需索取或手动填写 service_role 密钥。若 PAT 疑似泄露，立即撤销并轮换。

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are supplied by the Supabase runtime; do not ask for or manually enter a service_role key. If the PAT may be exposed, revoke and rotate it immediately.

## 4. 作者发布流程 / Author publishing workflow

1. 使用现有登录进入作者界面。发布前填写非空标题、正文和安全的英文文章地址（slug），并保存云端草稿。

   Sign in with the existing author login. Before publishing, provide a nonblank title, body, and safe English article address (slug), then save the cloud draft.
2. 选择本地备份文件夹，且必须位于公开仓库之外，例如 `E:\web\blog-backups`。若浏览器支持目录访问，直接选择文件夹；否则下载 `.blog-backup.json`，再通过文件选择器选中该下载文件完成校验。

   Choose a local backup folder **outside the public repository**, e.g. `E:\web\blog-backups`. If the browser supports directory access, select the folder; otherwise download `.blog-backup.json` and then **select the downloaded file** for verification.
3. 发布只确认公开的最终 JSON。GitHub Pages 构建会更新首页、列表、分类、日期和详情页；更新文章时保留原 `published_at` 和文章 id。

   Publish confirms the public final JSON only. The GitHub Pages build updates the homepage, list, categories, dates, and detail page; updates preserve the original `published_at` and article id.
4. 服务端核对线上发布清单的精确 revision。只有核对通过后才保存完整备份：草稿、当前元数据、最多 30 条历史，以及导入的本地历史（最多 30 条）；随后读回并哈希校验。

   The server checks the exact live publication-manifest revision. Only then does it save a full backup: draft, current metadata, up to 30 history entries, plus imported local history (up to 30); the backup is read back and hashed for verification.
5. 仅当勾选清理选项，且上述校验成功后，才可能删除云端草稿/历史。仅发起下载不会触发删除。失败或出现更新版本的草稿时，云端数据保留。秘密草稿历史不会进入 GitHub。

   Cloud draft/history may be deleted only when the cleanup checkbox is enabled and those checks succeed. Starting a download alone never deletes. On failure or a newer draft version, cloud data is preserved. No secret draft history enters GitHub.

归档不等于删除；删除行可使数据库空间可复用，但 Dashboard 显示的大小不一定会立即下降。外链图片仍只是 URL，不嵌入图片二进制；上传功能尚未实现。

Archived is not deletion. Deleting rows makes database space reusable, but the dashboard size may not drop immediately. External linked images remain URLs, not embedded image binaries; upload is not implemented.

## 5. 导入、超时与限制 / Import, timeouts, and limits

本地导入会先校验备份，然后载入新的本地编辑器内容和历史；在明确重新发布前不会公开。

Local import validates the backup first, then loads new local editor content/history; nothing becomes public until an explicit republish.

发布超时后可重复发布以复查状态；相同内容具有幂等性。关闭页面会保留云端草稿。评论功能尚未实现。

After a timeout, repeat publish to recheck status; the same content is idempotent. Closing the page preserves the cloud draft. Comments are not implemented yet.

## 6. 安全的首次验证 / Safe first verification

首次验证时先**取消勾选**清理选项，走完整个发布流程并确认公开 JSON 与备份文件正确；这会保留云端数据。不要在未经所有者同意时替其发布虚构文章。

For the first verification, **uncheck** cleanup, run the full flow, and confirm the public JSON and backup are correct; cloud data is preserved. Do not publish fabricated articles on behalf of the owner.

测试已覆盖本地 PostgreSQL 权限、模拟的 GitHub/部署/文件 I/O；真实云端端到端仍需完成本指南的配置后验证。

Tests cover local PostgreSQL permissions and simulated GitHub/deployment/file I/O; true cloud end-to-end verification still requires this setup.
