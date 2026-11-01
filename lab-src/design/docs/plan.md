# 实施计划

目标：一座可以亲手操作的原理展馆，五件展品各自独立、互不拖累。
**分阶段推进，一个阶段只让一件展品真正可操作。**

## 阶段 0 · 检查现有项目（已完成）

- 工作区为空：没有 `package.json`、没有 git 仓库，无历史资产可复用。
- 运行环境：Node 24.17、npm 11.13。
- 结论：从零搭建，参考仓库只提供方法，不提供成品。

## 阶段 1 · 框架、首页、展品页、统一控制（已完成）

1. Vite + TypeScript + React + three.js 工程脚手架，严格模式类型检查。
2. 设计系统：设计变量（暖纸底 / 墨色 / 单一朱红 / 图纸蓝）、基础排版、
   工程图纸细节（图纸框、四角刻度、标题栏、尺寸线）。
3. 首页：一块展馆索引图纸 + 五个问题引导 + 使用说明 + 数据来源分级。
4. 展品页：路由、页头（编号/标题/问题/状态）、工作区布局（模型主列 + 控制侧栏）、
   展品间导航、制作中页面。
5. 统一控制组件：滑块、单选组、开关、播放条（暂停/重置/观察速度）、镜头条、读数表、
   数据来源标签、状态标记、导览步骤卡。
6. 地基：唯一状态源 store、观察时钟 clock、明确状态机 machine（含 23 条单元测试）。
7. 三维舞台：懒加载、单一帧循环、WebGL 兜底、镜头锁定、离场释放；
   附开发自检页 `#/stage-check` 验证链路。

## 阶段 2 · 按动圆珠笔（已完成）

按用户提供的 JJ15 资料包实现，实际落地的文件：

```
src/exhibits/pen/
  model.ts         参数、索引拓扑、derivePose、导览步骤（纯逻辑）
  controller.ts    x / leg / cycle 状态持有者 + 动画时间轴 + 提交判据
  model.test.ts    15 条用例：三个关键位移、索引交替、未提交回退…
  controller.test.ts 13 条用例：完整循环、20 次不漂移、暂停、拖动作废…
  geometry.ts      零件与材质、半剖（裁剪面）、爆开偏移
  scene.ts         舞台 + 拖动按帽 + 点击选零件 + 预设镜头
  content.ts       零件说明、接触关系、阶段文案、出处
  CamDiagram.tsx   凸轮展开教学图
  controls.tsx     侧边控制面板
  index.tsx        组合
```

结果：01 号展品状态改为「已开放」，可操作、可剖视、可拆解、可拖动按帽按压。
模型说明见 `docs/pen-model.md`。

## 阶段 3 · GPA 可视化（已完成）

按任务卡实现，文件在 src/exhibits/gpa/：

\\n  model.ts        规则配置、解析、computeGpa、格式化（纯逻辑）
  model.test.ts   27 条用例：60/100/<60、手算样例 3.4375、权重与贡献之和、空与 0、59→60、联合提分…
  storage.ts      localStorage + 导入导出校验
  storage.test.ts 11 条用例：刷新恢复、空列表不被示例覆盖、损坏数据、往返一致、导入失败
  charts.tsx      四个视图（学分权重 / 当前贡献 / 提分实验 / 满绩差距）
  CourseEditor.tsx 课程编辑（文本框 + 滑块 + 参与开关 + 删除）
  panels.tsx      顶部概览、侧栏解释、底部规则
  GuidePanel.tsx  「带我看懂」独立示例五步
  index.tsx       状态、持久化、导入导出、组合
\\n
结果：04 号展品状态改为「已开放」，标题按任务卡改为「GPA 的秘密」。模型说明见 docs/gpa-model.md。

## 阶段 4 · 自行车变速器（已完成）

按用户资料包 `E:\web\source\bicycle`（GIANT Talon 0 + Shimano Deore M6100 1×12）实现，
展品标题改为「变速的秘密」。实际落地的文件：

```
src/exhibits/derailleur/
  model.ts        齿比 / 轮速 / 车速 / 力矩 / 功率 / 换挡状态机 / 滑行（纯逻辑）
  model.test.ts   15 条用例：齿比、CSV 样例、功率恒等、效率、踏频 0、换挡机、滑行
  chainPath.ts    闭合链环（切线枚举 + 排自交 + 取最短）、三维链长、摆臂角二分
  chainPath.test.ts 13 条用例：12 挡同链长闭合、包角、切向连续、三维取点
  controller.ts   角度积分、换挡按链条行程推进、驱动/滑行
  controller.test.ts 13 条用例：刷新率一致、飞轮同步、停踩排队、不跳角、重置、夹取
  geometry.ts     真实齿数前盘与 12 片飞轮、120 个链节实例、四连杆后拨、整车、材质
  scene.ts        预设镜头、点选零件、旁观者模式、拨前轮彩蛋
  content.ts      零件说明、镜头、导览五步、教学设定清单、出处
  Compare.tsx     固定踏频 / 固定输入力矩两种比较
  controls.tsx    换挡、踏频、力矩、观察、视角、显示、零件、读数
  index.tsx       组合
src/styles/derailleur.css
docs/derailleur-model.md
```

结果：05 号展品状态改为「已开放」，12 挡稳态联动 + 闭合链条 + 后拨换挡可操作。
链长固定 120 节，12 挡全部可闭合（误差 3e−7 mm 量级）；两导轮中心距从资料包初值 90 mm 调到 130 mm
（资料包允许「可调以闭合链长」），使导向轮包角从 3–9° 升到 23–57°。
## 阶段 7 · 骨骼的秘密（已完成）

按资料包《骨折模拟：小脚趾的结构与修复》实现，实际落地的文件：

```
src/exhibits/bone/
  model.ts / model.test.ts      坐标换算、预制裂面、断端变换、λ 形变、修复曲线（26 条用例）
  mesh.ts / mesh.test.ts        网格工具：合并顶点、Loop 细分、平面切分与断面封口（10 条用例）
  geometry.ts                   加载右足 GLB、切分两片、剖切面、受力箭头、骨痂叠层、拾取
  scene.ts                      镜头预设、拾取、标注投影、释放
  state.ts                      三个页签各自的状态 + 修复进度时钟
  content.ts                    文案、图例、出处、模型边界、带我看懂的 10 步
  controls.tsx / diagrams.tsx / index.tsx
  assets/right-foot-26-bones.glb  BodyParts3D 右足 26 骨（CC BY 4.0）
src/styles/bone.css
docs/bone-model.md
```

结果：03 号展品状态改为「已开放」，可整足定位、看预制裂面、调断端姿态、剖切、
三种受力方向的归一化示意、通用修复四阶段。模型说明见 `docs/bone-model.md`。
## 阶段 5–6 · 其余两件展品

02（涡扇发动机）按同样模板接入（03 已完成，见上一节）。
每件展品完成前一律显示「制作中」，不显示假模型。

## 明确不做（本版）

账号、后端、学校系统接入、视频导出。
