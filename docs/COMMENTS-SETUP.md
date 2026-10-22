# 登录与评论 / Login and comments

首页未登录时显示“用 GitHub 登录”；作者登录后显示“写作空间”；普通用户登录后入口消失，渐入“登录成功，可以评论哦~”。失败时保留重试入口并显示“登录失败，可以再次尝试”。
The homepage shows GitHub sign-in for guests, Writing space for the author, and a fading comment invitation for signed-in visitors. Failed sign-in keeps a retry button.

登录继续使用已配置的 /admin/ 回调地址。回调时编辑器隐藏，验证会话后返回登录前的本站页面；普通用户直接访问 /admin/ 会返回首页。作者编辑器仅在验证通过后初始化。GitHub Pages 仍为静态托管，私密数据访问由数据库和发布函数强制鉴权。
Sign-in uses the existing /admin/ callback. The editor stays hidden during the callback, which returns users to their original page inside this blog. Non-authors visiting /admin/ return home. The editor initializes only after author verification. On static GitHub Pages, database policies and the publisher enforce access to private data.

执行一次 supabase/migrations/202610220003_article_comments.sql。只增加文章评论表及函数，不修改草稿权限，不清理已有数据。
Run this migration once. It adds comment tables and functions, without changing draft permissions or deleting existing data.

文章发布并确认上线后自动开启评论；作者访问已上线文章也会自动补开。文章固定 ID 关联评论，更新正文和标题不会丢失留言。评论只支持纯文本，并通过 textContent 显示。公开字段仅有评论编号、文章编号、GitHub 用户名、留言正文和发布时间。
Comments open after publication is confirmed; an author visit also opens them if needed. Comments use permanent article IDs and survive content updates. Messages render as plain text with textContent. Public fields are comment ID, article ID, GitHub username, message, and publication time.

发布评论需要真实 GitHub 身份；用户名从 auth.identities 读取，不信任浏览器提交的昵称或 user_metadata。匿名用户可读，不能发；普通账号不能开启任意评论区、直接写表、修改留言或取得私密草稿。
Posting requires a GitHub identity. The server reads usernames from auth.identities, not browser-supplied names or user_metadata. Guests can read but cannot post. Ordinary accounts cannot open threads, write tables directly, edit messages, or access private drafts.

每条 1–3000 字，同一账号间隔 30 秒，每天最多 100 条。分页每次 20 条，按时间及编号游标向后加载，避免新留言造成重复分页。留言公开显示用户名和正文；不会公开邮箱及内部账号 UUID。
Messages allow 1–3000 characters, with 30 seconds between submissions and a limit of 100 per day per account. Cursor pagination loads 20 messages at a time. Emails and internal user UUIDs stay private.

需要隐藏留言时，可在数据库的 blog_comments 表将对应行 removed 设为 true；公开读取自动排除隐藏留言。不要删除账号来代替留言管理。
To moderate a message, set its removed field to true in blog_comments. Public reads exclude hidden messages. Account deletion is not a comment moderation tool.
