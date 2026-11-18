# 博客源码结构

修改功能时，在对应模块里找界面、流程或数据读写。页面地址由 Astro 路由提供，文章详情路由也负责列出要生成的文章。

| 功能                                   | 源码位置                                                 |
| -------------------------------------- | -------------------------------------------------------- |
| 首页、滚动和导航                       | src/features/home/ui/                                    |
| 关于页与自我介绍                       | src/features/about/ui/、src/features/about/data/about.ts |
| 文章列表、详情、Markdown 与 LaTeX      | src/features/articles/{ui,logic,data}/                   |
| GitHub 登录、作者识别、跳转状态        | src/features/auth/{ui,logic,data}/                       |
| 写作、排版、私密草稿、归档和历史       | src/features/writing/{ui,logic,data}/                    |
| 发布确认、本地备份、导入恢复和清理     | src/features/publishing/{ui,logic,data}/                 |
| 评论列表、提交、开启评论区             | src/features/comments/{ui,logic,data}/                   |
| 实验目录、照片转字符画、快速排序       | src/features/lab/{catalog,photo,quicksort}/              |
| 《设计的秘密》的展品、小游戏和成绩计算 | lab-src/design/src/                                      |
| 全站布局、主题、光标与通用按钮         | src/shared/ui/                                           |
| 站点信息与 Supabase 客户端配置         | src/shared/data/                                         |

- **ui** 负责页面结构、样式、事件绑定和状态展示。跨模块的页面入口位于 src/pages/。
- **logic** 负责排版、数据转换、权限状态、保存顺序和发布确认。草稿与发布逻辑接收读写接口，可以用测试数据验证。浏览器预览与静态文章共用公式解析，各自使用适用的 HTML 清理器。
- **data** 读写 Supabase、浏览器存储、本地文件或站内资源。新文章公开定稿仍由 src/content/published/ 提供。

Supabase 发布入口位于 supabase/functions/blog-publish/index.ts。服务逻辑在 logic/，GitHub 文件、Pages 上线状态和草稿快照由 data/ 读取。浏览器与发布服务共用 supabase/functions/_shared/publication.ts 中的文章和备份协议。数据库表及权限规则位于 supabase/migrations/，通过新的迁移文件更新。

运行 npm test 验证博客逻辑与数据库权限，运行 npm run build 验证 GitHub Pages 静态构建。运行 npm run prepare:publisher 生成可部署的 Supabase 函数。设计实验可在 lab-src/design/ 下单独运行 npm test。
