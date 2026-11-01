# 第三方来源与许可

本项目为课程作业。下列第三方作品的许可与使用方式逐条登记。

## 方法与评审参考（未复制源码）

**elvarofficial/teardown** — <https://github.com/elvarofficial/teardown>
MIT License, Copyright (c) 2026 elvarofficial, Copyright (c) 2026 whaleyxbt

本项目借鉴的是它的**工作方法与质量约定**，不是代码：

| 借鉴点 | 在本项目中的落法 |
| --- | --- |
| 真实参考建模：先找实物照片 / 剖切图 / 厂商图，对着建 | 每件展品先定参考物与尺寸来源，标注不出来的数值不显示 |
| 真实尺寸、单一来源：一个输入驱动全部姿态与读数 | `store` + 派生函数是唯一事实来源，3D/读数/标签同源 |
| 一个输入驱动一切，不手 K 帧 | 观察时钟 `clock` 推进模型时间，姿态与读数都是时间的函数 |
| 工作零件单独打开 / 剖切 / 透视 | 舞台开启 `localClippingEnabled`，展示方式预留实体/剖切/透视三态 |
| 浅色摄影棚式布景、单一强调色 | 暖纸底 + 墨色 + 单一朱红强调色（图纸蓝只做标注） |
| 按帧复核，不靠「我觉得对」 | 见 `docs/verification.md`：构建、单测、逐屏截图复核 |
| 分层：math / geometry / stage / console | 四层：model / geometry / controls / content |

teardown 自带的三个示例是 V8 发动机、塞斯纳起落架与仿生兽，**没有**圆珠笔或涡扇模型；
本项目也没有沿用它的单文件离线打包方式。因此没有它的代码被复制进本仓库。

若后续确实复用其源码，请在此处登记：文件名、原路径、原许可全文。

它的 kit 与评审规则本身又来自 [whaleyxbt/claude-motion](https://github.com/whaleyxbt/claude-motion)（MIT）。

## 按动笔展品的具体依据

外观与机构依据用户提供的资料包 `E:\web\source\jj15-reference-pack-20261101`（2026-11-01 整理），
其中登记的可访问来源：

| 编号 | 来源 | 用在本项目的哪一部分 |
| --- | --- | --- |
| S01 | [ZEBRA 官方产品页：SARASA CLIP 0.5](https://www.zebra.co.jp/pro/detail/sarasa-clip/?tab=lineup_sarasa-clip_05) | 全长 141.0 mm、轴径 11.0 mm、球珠 0.5 mm 的比例锚点 |
| S02 | [ZEBRA 官方替芯页：JF-0.5](https://www.zebra.co.jp/pro/kaeshin/kaeshin_jel/) | 笔芯长 111.1 mm、最大直径 6.1 mm |
| S04 | [SARASA CLIP 同系列实物拆解记录](https://blog.kamujp.com/2016/12/zebra.html) | 零件组成的旁证（按杆、回转子、弹簧、笔芯、笔夹） |
| S05 | [Zebra JP2007083498A 专利](https://patents.google.com/patent/JP2007083498A/en) | 通用按动原理：导槽 → 斜面转动 → 锁止位停留 → 再按解除 |
| S06 | [elvarofficial/teardown](https://github.com/elvarofficial/teardown) | 统一模型状态、剖切观察、按帧复核的方法 |

用户提供的照片（U01–U03）与视频（U04）只作为外观与配色参考；
视频没有做逐帧分析，**没有**从视频里量出齿数、行程或任何内部尺寸。

资料包明确标注为「教学设定」的参数（3 凸耳 + 6 个交替深浅索引位、每循环 60°、
位移 0 / 2.2 / 4.0 / 4.8 mm、弹簧 18/15.5 mm 等）在本项目中原样采用，
并在页面与 `docs/pen-model.md` 中写明不是实测值。

没有复制资料包之外的第三方图片或文章全文。站内所有几何体由代码生成。

## GPA 展品的依据

绩点换算公式来自北京航空航天大学教务部的公开说明页（S07）：

| 编号 | 来源 | 用途 |
| --- | --- | --- |
| S07 | [北京航空航天大学教务部 · 成绩与绩点换算说明](https://sge.buaa.edu.cn/info/1221/2957.htm) | 60≤s≤100 时 g(s)=4−3(100−s)²/1600；s<60 记 0 |

该公式在页面中作为「可替换的规则配置」的默认预设使用，页面上写明了来源、适用范围与待确认项；
不宣称适用于所有年级、学院或全部课程。没有转载该页面的文字或图表。

示例课程取自用户提供的一份课程清单，仅用于演示算法，不是任何学校或专业的培养方案。

## 骨骼展品的具体依据

部位与侧别来自用户提供的报告摘录（`E:\web\source\foot-fracture` 与
`E:\web\source\foot-model-assets-20261101`，2026-11-01 整理）。报告只提供了
「右第 5 近节趾骨基底部骨折」这一条文字信息：**没有**影像、姓名、病历号或联系方式
被转录入本仓库或页面；模型不据此重建个人骨折形态。

整足骨格来自 **BodyParts3D**（Database Center for Life Science，DBCLS）的公开解剖数据：

| 项目 | 内容 |
| --- | --- |
| 来源 | <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html> |
| 许可 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)（官方许可页：<https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html>） |
| 官方要求的署名 | BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International |
| 本仓库文件 | `src/exhibits/bone/assets/right-foot-26-bones.glb`（右足 26 块骨，米制、Y 轴向上、整足居中） |
| 资源包已做的修改 | 从官方数据提取右足、合并完全重合顶点、重算法线、统一朝向与单位（mm → m） |
| 本展品另做的修改 | 目标骨 Loop 细分一级、按教学裂面切分并封口、剖切面、骨痂叠层、受力箭头 |
| 许可快照 | 资源包附带的官方许可页快照整理见 `docs/foot-model-attribution.md` |

解剖名称与部位关系另参考（未转载全文）：

| 编号 | 来源 | 用途 |
| --- | --- | --- |
| F01 | [AAOS: Toe and Forefoot Fractures](https://orthoinfo.aaos.org/en/diseases--conditions/toe-and-forefoot-fractures/) | 跖骨与趾骨的区分、近节趾骨部位 |
| F02 | [AO Surgery Reference: Lesser toe fractures](https://surgeryreference.aofoundation.org/orthopedic-trauma/adult-trauma/foot-phalanges/lesser-toe-fractures/definition) | 小趾骨折的一般受力背景（不用于判断受伤原因） |
| F03 | [OpenStax A&P 2e 6.5 Fractures: Bone Repair](https://openstax.org/books/anatomy-and-physiology-2e/pages/6-5-fractures-bone-repair) | 修复四阶段的名称与顺序 |
| F04 | [OpenStax A&P 2e 8.4 Bones of the Lower Limb](https://openstax.org/books/anatomy-and-physiology-2e/pages/8-4-bones-of-the-lower-limb) | 足骨分组与标准教学骨数 |

裂面位置、倾角、裂隙/横移/旋转默认值、λ 与形变上限、修复阶段区间都是教学设定，
不是临床参数，也不是任何人的测量值。页面与 `docs/bone-model.md` 逐条写明。
## 运行时依赖

| 依赖 | 许可 |
| --- | --- |
| three.js | MIT |
| React / React DOM | MIT |
| React Router | MIT |
| Vite | MIT |
| TypeScript | Apache-2.0 |

均以 npm 依赖形式引入，未修改其源码。

## 字体

不打包任何字体文件。界面的中文走系统字体（PingFang SC / HarmonyOS Sans SC /
Source Han Sans SC / Microsoft YaHei），数字与标注走系统等宽字体
（JetBrains Mono / Cascadia Mono / Consolas）。因此没有字体授权问题。

## 图片与数据

除骨骼展品外，没有引入外部图片、贴图或第三方数据集；其余几何体由代码生成。
骨骼展品使用 BodyParts3D 的右足骨网格（CC BY 4.0，见上一节），
这是唯一的外部三维数据；页面上的断面纹理、骨痂与箭头仍由代码生成。
所有数值的来源在展品内逐条标注为实测 / 文献 / 教学假设 / 纯视觉效果。

魔丸模式（番外游戏）另用了一张位图：北京航空航天大学校徽
`public/mowan/beihang-logo.jpg`，由用户提供，只用于骑手头盔上的圆形贴片
（贴图在运行时用 canvas 加了一圈蓝边，缩放不影响）。校徽的著作权归北京航空航天大学；
本项目是课程作业，非商业使用，若需公开部署请先确认使用权。
起点门楼是按用户提供的实拍照片**用代码重建**的三维示意，没有把照片本身放进页面。
