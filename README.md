# Ladelo Website

Ladelo 的官网。Vite + three.js，没有框架。

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 输出到 dist/，静态文件，任何静态托管都能放
```

## 结构

| 文件 | 内容 |
|---|---|
| `index.html` | 首页：首屏 3D 演示、怎么用、为什么、休息眼睛、功能、价格、FAQ |
| `terms.html` / `privacy.html` / `refund.html` | Paddle 审核要求的三份政策页 |
| `src/hero.js` | 首屏：菜单栏被消防员整理，点消防帽放下云梯，点 App 放回菜单栏 |
| `src/wash.js` | 休息眼睛演示，按 App 的 `BreakShow.swift` 走：冲水 7.5 秒、毛玻璃、玻璃上挂水珠、20 秒卡片、刮水器一行行刮干净 |
| `src/model.js` | 加载真实消防员模型 `public/models/firefighter.glb`，把各段动作对到场景用的姿势上 |
| `src/firefighter.js` | 用代码拼的备用消防员（模型加载失败时用）、消防帽、水枪 |
| `src/appwater.js` | 照搬 App 的水（`Sources/LadderbarStage/Water.swift`）：同样的粒子模拟、半分辨率密度图 + metaball 着色、水雾、玻璃上的水珠 |
| `src/icons.js` | 虚构的菜单栏 App 图标（单色版 + 彩色梯子版） |

消防员用的是 App 同一个模型：`public/models/firefighter.glb` 来自 Perch 仓库的 `art/firefighter.glb`，贴图从 4096 缩到 1024（3.5 MB → 1.4 MB）。它放在网站上谁都能直接下载，App 里的加密对这份没有作用。模型加载失败时自动换回代码拼的版本。

换模型后重新生成：用 Python 把 glb 里的贴图取出来，`sips -Z 1024` 缩小后写回（见提交记录），或者用 gltf-transform 的 `resize`。

## 上线前要补的

- [ ] 政策页里的 `[SELLER LEGAL NAME]` 换成你的真实姓名或公司名（要和 Paddle 账户一致）
- [ ] 联系邮箱 `hello@ladelo.app` 换成真实可收信的地址
- [ ] `src/main.js` 里接 Paddle Checkout（`data-buy` 按钮）和下载地址 `DOWNLOAD_URL`
- [ ] 核对页面上的承诺和 App 一致：3 台 Mac、1.x 免费更新、14 天试用、30 天退款、支持的 macOS 版本
- [ ] 隐私政策里写了「激活时发送 license key 和匿名设备标识」，以 license 服务的实际实现为准
