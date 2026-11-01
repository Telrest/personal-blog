# 架构与接入手册

## 一、四层分离

一件展品 = 四个文件职责，互不越界：

```
        ┌──────────────────────────────────────────────┐
        │  store（唯一状态源：输入参数 + 模型状态）      │
        └───────┬───────────────┬──────────────┬───────┘
                │               │              │
     model.ts   │      geometry.ts     controls.tsx   content.ts
  计算/状态机   │      摆零件/材质      写回输入       文案与出处
  （无 three）  │      （three.js）    （React）     （纯数据）
                │               │              │
                └──── 3D / 读数 / 标签全部同源 ────────┘
```

- `model.ts`：真实单位，纯函数 + 明确状态机。不 import three.js，可单测。
- `geometry.ts`：只按 `model` 给出的状态摆零件、剖切、上色，不自己算物理。
- `controls.tsx`：只负责把用户操作写回 store，不保存第二份显示数值。
- `content.ts`：导览步骤、说明文案、每个数值的来源（实测/文献/教学假设/视觉效果）。

界面层 `index.tsx` 只做组合：把 store、舞台、控制面板、解释内容拼起来。

## 二、三个地基

| 文件 | 职责 | 为什么需要 |
| --- | --- | --- |
| `lib/store.ts` | 唯一状态源，浅合并 + 变更才通知 | 满足「输入参数与模型状态是唯一事实来源」 |
| `lib/clock.ts` | 模型时间 = 真实时间 × 观察速度；暂停/重置/速度 | 满足「支持暂停、重置、观察速度调节」；3D 每帧读它，UI 以 20 Hz 通知 |
| `lib/machine.ts` | 状态 + 事件 + 守卫 + action + 轨迹 | 满足「锁止、历史、多输入用明确状态机」 |

`clock.ts` 的通知频率低于帧率：3D 场景每帧直接读 `clock.get()`，
React 只以 20 Hz 重渲染读数，避免 60 Hz 重渲染把面板拖慢。

## 三、展品 ↔ 舞台的契约

`lib/stageContract.ts`：

```ts
interface StageRuntime<S> {
  update(state: S): void        // 把最新模型状态推给场景
  render(): void                // 画一帧
  resize(w, h, dpr): void
  resetCamera(): void           // 只有用户点「回到默认视角」才会被调用
  dispose(): void               // 释放几何/材质/贴图/渲染器/上下文
}
```

`components/ModelStage.tsx` 负责所有 3D 展品共有的行为：

- three.js 与展品几何**动态 import**，首页不加载；
- 没有 WebGL → 显示 `fallback`（图文替代），不给黑屏；
- 全页**只有这里一个** `requestAnimationFrame`；标签页隐藏时不渲染；
- 卸载时取消帧循环、断开 ResizeObserver、`dispose()`、移除 canvas；
- canvas 由组件亲手创建：WebGL 上下文一旦丢失，同一块 canvas 不能复用，必须换新的；
- 上下文丢失/启动失败时提供「重新加载三维场景」按钮。

## 四、接入一件新展品

1. 建目录 `src/exhibits/<id>/`，按上面的四层写文件。
2. `model.ts` 先写：确定**唯一输入**（时间、行程、齿比…）与派生函数；
   若有锁止/历史，用 `createMachine` 写状态机，并配 `model.test.ts`。
3. `scene.ts` 导出工厂（**必须**用动态 import 包住 three.js 相关的几何）：

```ts
export const penSceneFactory: StageFactory<PenView> = async (canvas, hooks) => {
  const { createPenScene } = await import('./scene-impl')  // 或直接在这里 await import
  return createPenScene(canvas, hooks)
}
```

4. `index.tsx`（默认导出，类型 `ExhibitModuleProps`）里组合：
   - `useState(() => createStore(initial))` 建 store；
   - `ModelStage` 传 `factory` / `onFrame`（帧内 `clock.tick(dt)` 后 `runtime.update(view)`）；
   - 侧栏 `ControlPanel` + 各控制件，`onChange` 只写回 store；
   - `CameraBar` 的 `cameraMoved` 由 `onUserOrbit` 回调置真；
   - 模式切换用 `ModeSwitch` 的 `mode`，导览步骤用 `StepGuide`。
5. 在 `registry.ts` 里把该展品改成 `status: 'ready'`、`statusLabel: '已开放'`，
   并加上 `component: () => import('./<id>')`。
6. 加一个 `model.test.ts` 用例，跑 `npm test`。

## 五、需求 → 实现对照

| 要求 | 落点 |
| --- | --- |
| 中文界面 | 所有文案；`<html lang="zh-CN">` |
| 浅色科学展馆 + 工程图纸细节 | `styles/tokens.css`；`DrawingFrame`、`DimLine`、标题栏、四角刻度 |
| 模型是视觉中心 | `.workspace`：主列 `1fr` + 侧栏 344px |
| 首页五个问题 | `registry.ts` → `HomePage` 的问题列表 |
| 「带我看懂」/「自由探索」 | `ModeSwitch` + `StepGuide` + `ExhibitPage` 的 `mode` |
| 桌面模型+侧栏，移动上下排列 | `styles/pages.css` 的 `.workspace` 断点（960px） |
| 控制必须有文字标签 | `SliderControl` 标签/值/单位/量程；`ToggleControl` 写「开/关」；`SegmentedControl` ✓ + 下划线 + 加粗 |
| 未完成模块显示制作中 | `registry.status` → `UnderConstruction`（含计划内容与当前状态） |
| Vite + TypeScript + Three.js | `package.json` / `vite.config.ts` |
| GPA 主视图二维 | `registry` 里 `gpa.view = '2d'` |
| 每个实验独立加载 | `registry.component?` 懒加载 + `ModelStage` 动态 import three |
| 首页不启动五个 3D | 首页模块不 import three；构建产物 `three.module` 为独立 chunk |
| 不做账号/后端/导出 | 无相关代码 |
| 四层分离 | 本文件第一节 |
| 唯一事实来源 | `lib/store.ts`；`ModelStage.onFrame` 里从 store 派生 |
| 锁止/历史用状态机 | `lib/machine.ts` + 单测 |
| 不编造工程参数 | `lib/source.ts` 四级标签；未实现展品不显示任何数值 |
| 暂停 / 重置 / 观察速度 | `lib/clock.ts` + `TransportBar` |
| 用户操作后不抢镜头 | `stage3d` 的 `onControlStart` 只置标志；`resetView` 只由 `resetCameraNonce` 触发 |
| 离开模块停止动画并释放 | `ModelStage` 卸载清理 + `createStage3D().dispose()` |
| 不支持 3D 给图文替代 | `ModelStage` 的四种状态覆盖层 + `fallback` |

## 六、几个决定与理由

- **React + React Router（Hash 模式）**：维护成本低，代码分割成熟；
  Hash 路由让 `dist/` 可以直接静态托管，不需要服务器改写 URL。
- **不引入 UI 框架 / 状态库**：样式全在手写 CSS 变量里，状态只有 `store` 一个来源，
  依赖越少越好交代。
- **单一帧循环**：多个 rAF 会互相争用，也让「暂停」语义变模糊；现在只有 `ModelStage` 一处。
- **模型时间与真实时间分离**：观察速度只乘在时钟上，动画、读数、标签共用一个时间。
