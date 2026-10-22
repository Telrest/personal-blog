# 私密草稿配置 / Private draft setup

这一阶段提供 GitHub 登录、作者专用的云端草稿、归档及最近 30 个历史版本。发布和评论将在后续单独接入。没有配置服务时，写作空间继续提供临时编辑、导入和导出。

This stage adds GitHub login, private author drafts, archiving, and up to 30 historical versions. Publishing and comments come later. Without a configured service, the editor still supports temporary writing, import, and export.

## 1. 创建项目 / Create the project

在 Supabase 创建项目，保存数据库密码到自己的密码管理器。将 `supabase/migrations/202610220001_private_drafts.sql` 的完整内容放入该项目的 SQL Editor 执行一次。脚本只创建本阶段需要的表和权限。

Create a Supabase project and keep its database password in your password manager. Run the entire `supabase/migrations/202610220001_private_drafts.sql` once in its SQL Editor. It creates only this stage's tables and permissions.

## 2. 配置 GitHub 登录 / Configure GitHub login

在 GitHub 的 Settings → Developer settings → OAuth Apps 创建应用。Homepage URL 填 `https://telrest.github.io/personal-blog/`。Authorization callback URL 使用 Supabase 项目 Authentication → Sign In / Providers → GitHub 页面给出的地址，通常是 `https://项目编号.supabase.co/auth/v1/callback`。

Create an OAuth App under GitHub Settings → Developer settings → OAuth Apps. Set Homepage URL to `https://telrest.github.io/personal-blog/`. Use the callback URL shown by Supabase under Authentication → Sign In / Providers → GitHub, usually `https://PROJECT_REF.supabase.co/auth/v1/callback`.

将 Client ID 和 Client Secret 填入 Supabase 的 GitHub provider 配置并启用。Client Secret 只填在 Supabase 控制台，不要提交到仓库，也不需要发给助手。

Enter the Client ID and Client Secret in Supabase's GitHub provider settings and enable it. Keep the Client Secret in the Supabase dashboard; do not commit it or send it to the assistant.

Authentication → URL Configuration 的 Site URL 填 `https://telrest.github.io/personal-blog/`，Redirect URLs 加入以下精确地址：

Set Authentication → URL Configuration → Site URL to `https://telrest.github.io/personal-blog/`, and add these exact Redirect URLs:

- `https://telrest.github.io/personal-blog/admin/`
- `http://127.0.0.1:4321/personal-blog/admin/`
- `http://127.0.0.1:4322/personal-blog/admin/`

## 3. 配置公开连接信息 / Set public connection values

在项目 Connect 或 API Keys 页面找到项目网址及 **publishable key**（以 `sb_publishable_` 开头）。本阶段不使用 secret、service_role 或数据库密码。复制 `.env.example` 为本地 `.env`，填入这两个值；`.env` 已被 Git 忽略。

Find the project URL and **publishable key** (starting with `sb_publishable_`) under Connect or API Keys. This stage does not use a secret key, service_role key, or database password. Copy `.env.example` to a local `.env` and fill both values. Git ignores `.env`.

在 GitHub 仓库 Settings → Secrets and variables → Actions → Variables 创建相同名称的两项 Repository variables，重新运行 Deploy personal blog。只填一项或误填高权限密钥会使构建失败，避免把它放进网页。

Create two Repository variables with the same names under GitHub repository Settings → Secrets and variables → Actions → Variables, then rerun Deploy personal blog. The build fails if only one value is set or a privileged key is used, preventing that key from entering the site.

## 4. 开通唯一作者 / Grant author access

先打开 `/personal-blog/admin/`，用 Telrest 的 GitHub 登录。首次登录没有作者权限是正常的；不会把第一个访问者自动设为作者。展开“账号信息”，复制自己的账号编号，并在 Supabase Authentication → Users 中确认它对应你自己的 GitHub 身份。

Open `/personal-blog/admin/` and sign in with Telrest's GitHub account. The first login intentionally has no author access; the first visitor never becomes the author automatically. Expand Account information, copy your account UUID, and verify its GitHub identity under Supabase Authentication → Users.

在 SQL Editor 执行下面的模板，将占位符替换为已经核对的编号。不要根据陌生人提供的编号授权。此操作只能在数据库控制台执行，网页不能自行提升权限。

Run this template in SQL Editor, replacing the placeholder with the UUID you verified. Never grant access to an ID supplied by someone else. Only the database console can grant this access; the browser cannot promote itself.

```sql
do $$
declare author_id uuid := 'REPLACE_WITH_YOUR_VERIFIED_UUID';
begin
  if not exists (select 1 from auth.identities where user_id = author_id and provider = 'github') then
    raise exception 'The verified GitHub account does not exist';
  end if;
  insert into public.blog_owners(user_id) values (author_id) on conflict do nothing;
end $$;
```

刷新写作空间后，确认出现“已登录为作者”和“保存私密草稿”。不要为普通评论账号插入 blog_owners。

Refresh the editor and check for the author status and Save private draft button. Never add ordinary reader or commenter accounts to blog_owners.

## 5. 上线验证 / Verify the live connection

- 导入一篇测试文章，保存，刷新，再从私密草稿列表打开；换设备登录后也应能打开。/ Import a test article, save, refresh, and reopen it from private drafts. Check another signed-in device too.
- 修改并手动保存，打开历史版本；测试归档及恢复。/ Edit and manually save, inspect history, and test archiving and restoring.
- 未登录以及另一个普通 GitHub 账号都不应读到草稿。数据库 RLS 执行权限检查，隐藏按钮不是权限保护。/ Signed-out visitors and a second ordinary GitHub account must not read drafts. Database RLS enforces access; hidden buttons are not the security boundary.
- 同时在两个窗口编辑同一草稿，旧窗口保存应提示冲突，不能覆盖新内容。断网时应显示未保存，内容仍可导出。/ Edit one draft in two windows. A stale save must report a conflict instead of overwriting newer text. Offline saves must report failure while allowing export.

自动保存会在停止输入约两秒后尝试；成功确认前不会显示“已保存”。手动保存会保留修改前的内容，自动保存的历史快照间隔约五分钟；只保留最近 30 个。导出不等于云端保存。草稿未保存也未导出时，离开页面会提醒。

Autosave tries about two seconds after typing stops and reports success only after confirmation. Manual saves keep the previous content; automatic history snapshots are spaced about five minutes apart, retaining the latest 30. Exporting does not mark a cloud save as successful. Leaving with unsaved, unexported changes triggers a warning.

目前通过了本地 PostgreSQL 权限与版本冲突测试；真实 OAuth、网络、Supabase 项目权限及跨设备行为仍需创建项目后完成上述验证。公开仓库和 Pages 构建中不存放草稿；草稿正文保存在 Supabase。认证会话保存在浏览器，公用电脑使用后请退出登录。

Local PostgreSQL permission and conflict tests pass. Real OAuth, network, Supabase project permissions, and cross-device behavior still require the checks above once the project exists. Drafts are stored in Supabase, outside the public repository and Pages build. Authentication sessions persist in the browser; sign out on shared computers.
