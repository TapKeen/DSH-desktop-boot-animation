# dsh-startup-animation

给 **DSH Desktop / DSH Web** 外壳加一个装饰性开机动画。它是一个标准的 Cordis
客户端插件，装在 `~/.dsh/profiles/desktop/` 这个 profile 里，因此动画出现在你
实际使用的那个窗口，而不是另起一个第三方客户端。

## 它做什么

启动时铺一层全屏覆盖层，**播放 8 秒**后淡出，露出真实界面。

配色为**浅色系（近白底）**：深色覆盖层盖在浅色外壳上会闪一下，所以整个表面改用
近白，颜色由徽章承担。值得留意的是，深色上好看的手法在白色上会失效，因此做了替换：

| 深色版的写法 | 浅色版换成 |
|---|---|
| 加色发光（bloom） | 淡蓝色晕 + 柔和投影 |
| 亮蓝强调色 `#6fb6ff` | 饱和深蓝 `#2563d6`（白底才够对比） |
| 深色暗角 | 极浅的冷灰边缘压暗 |
| 亮色文字 | 深蓝墨色 `#10243d` |

配色集中在一个具名常量 `P` 里（`client/client.js` 顶部），换主题是一处改动。

分镜时序：

| 时间 | 内容 |
|---|---|
| 0.0–1.0s | 舞台升起 |
| 0.4–2.4s | 三角徽章描边绘制 |
| 0.6s 起 | 扫描线（3s 一轮，序列内约 2.5 次） |
| 0.8–2.3s | `DEEPSEEK HARNESS` 逐字浮现 |
| 2.1s | 副标题（带真实版本号） |
| 2.4–7.7s | 进度条填充 + 微光扫过 |
| 3.2s | 跳过提示 |
| 5.4–7.8s | 两圈「确认脉冲」（避免中段发闷） |
| 8.0s | 淡出 |

时序同样集中推导：分镜常量在 `T` 里，**进度条填充时长由总时长反推**
（`BAR_FILL_MS = SEQUENCE_MS - barInDelay - barFillPad`），避免出现「进度条还没填满
覆盖层就开始淡出」这类错位。

其余演出细节展开：

- 同心刻度环（外环 / 反向虚线内环）+ 自绘三角形徽章 + 中心脉冲
- 竖向扫描线扫过徽章
- `DEEPSEEK HARNESS` 逐字呈现
- 进度条填充 + 微光扫过
- **合成开机音**（见下节）
- 点击 / 任意键 / Esc 立即跳过
- `M` 静音 / 恢复（偏好持久化）
- `prefers-reduced-motion` 时退化为静态帧（1.1 秒）
- 每个窗口会话只播一次

## 声音

音频是**由使用者提供的 MP3，base64 内嵌在 `client/client.js` 里**，不是外部文件。

为什么不直接放一个 `.mp3` 进包里：**本插件没有宿主侧 HTTP 路由**（主机半侧是刻意留空的），
所以浏览器根本没有 URL 可以从包里拉音频。可行路径只有两条——base64 内嵌，或者给主机半侧加一条
伺服路由。选了内嵌，代价是包体膨胀约 33%，换来主机半侧保持零暴露面。

**素材规格**（已在构建时验证，见下）：

| 项 | 值 |
|---|---|
| 格式 | MPEG1 Layer III，44.1 kHz，立体声，192 kbps CBR |
| 时长 | **270 帧 = 7.053 秒** |
| 完整性 | 音频字节全部消费，尾部 0 字节残留 |
| 原始体积 | 165.4 KB → base64 后 220 KB |

**播放行为**：

- 从 **0 秒**起全程铺底，与 8 秒分镜同步
- **起始 20ms 淡入**，消除第 0 个采样点的直流跳变
- **自适应淡出**：只有当素材长于 7.65 秒窗口时才会触发，避免覆盖层结束时
  关闭 AudioContext 把尾音硬切成爆音。**本例素材 7.053 秒，短于窗口，所以不淡出**——
  它自己的尾音自然收完
- 按 **`M`** 静音 / 恢复，偏好持久化在 `localStorage['dsa:sound']`
- 音频起不来时（自动播放策略、无输出设备、解码失败）**动画照常静音播放**，不会卡住

**怎么替换素材**：把新文件放到包目录，然后

```powershell
$env:ELECTRON_RUN_AS_NODE=1
& "DSH Desktop.exe" scripts/embed-audio.mjs . "新文件路径"
```

脚本会校验容器类型、做 base64 往返比对，并保留一份 `client/client.js.pre-embed` 备份。
脚本本身**不随包发布**（`files` 白名单不含 `scripts/`）。

**排查**：开发者工具里执行 `__dshStartupAnimation.audioError` 看最后一次失败原因；
`__dshStartupAnimation.soundActive` 看音频上下文是否真的起来了。

## 它**不**做什么

这一条是刻意的设计约束，不是遗漏：

- **不谎报系统状态。** 画面里没有假的「正在鉴权」「正在加载 N 个技能」，
  也没有把百分比伪装成真实进度。唯一展示的真实数据是外壳版本号，
  取自 `window.__DSH_BOOT__`。
- **不碰任何宿主能力。** 主机半侧 `lib/index.js` 是空实现：没有 HTTP 路由、
  没有文件读写、没有设置项、没有定时器、对模型完全不可见。
- **不依赖平台模块。** 动画是纯 DOM + CSS，`dsh.client.inject` 为空，
  不 require React 或任何 `@deepseek-ai/*` 包，因此不会因上游版本漂移而崩。
- **不会把你的界面锁死。** 任何异常路径都会把覆盖层摘掉；就算动画崩了，
  也就是没有动画而已。

## 结构

```
package.json          声明 dsh.client.platform = "web"，导出 ./client
cordis.patch.yml      把本插件插入 profile 的 layer stack
lib/index.js          主机半侧：空实现（Cordis 需要它作为合法条目）
client/client.js      浏览器半侧：手写的 __ModuleLoader__ factory + 动画 + Web Audio 合成
```

`client/client.js` 是**手写**的，不经任何打包器。DSH 的客户端模块系统只要求
这个文件调用 `window.__ModuleLoader__.load({ id, factory })`，并让 factory 返回
一个 Cordis 插件对象；bundle 里每个模块的副作用都放在 factory 闭包中，首次
物化时才运行。

## 安装

正规入口就一条命令（PATH 上的 `dsh` 是 Desktop 自己的 shim，会自动带上
`--profile desktop`）：

```powershell
dsh plugin add "E:\ds Work area\dsh-startup-animation"
```

它由 `@deepseek-ai/dsh-plugin-manager` 驱动，会：

1. 对 `<profile>/package.json` 加文件锁后调用 Desktop 自带的 pnpm；
2. 对本地路径做兼容性预检；
3. 装完 `reconcile` —— 因为本包声明了 `dsh.bundle.patch`，
   **自动把 `dsh-startup-animation` 追加进 `dsh.profile.bundles`**；
4. 失败则自动还原 `package.json` + `pnpm-lock.yaml` 并重装。

本地路径必须是**绝对路径**；相对路径会被拒绝。

`<profile>` 为 `%USERPROFILE%\.dsh\profiles\desktop`。

### 装完必须重启

profile 组合（`dsh.profile.bundles` 与 patch 层）**每个 Host generation 只计算
一次**，所以运行中的实例看不到新 bundle。注意 profile `package.json` 里的
`"patchReload": "live"` 是**死配置**——已安装的任何 `@deepseek-ai/*` 包和
`app/lib/*.js` 都不读取它。**不要指望热加载，请完整退出并重新启动 DSH Desktop。**

> 本机 `node` / `npm` / `pnpm` 都不在 PATH 上，但 DSH Desktop 自带
> node v24.18.1（`DSH Desktop.exe` 配 `ELECTRON_RUN_AS_NODE=1`）
> 和 pnpm 11.8.0（`resources/app/node_modules/pnpm/bin/pnpm.cjs`），
> `dsh plugin` 走的就是这套。

## 验证

重启后动画应自动播放。想手动重放，在 DSH Desktop 里打开开发者工具，执行：

```js
__dshStartupAnimation.play()          // 强制重放（带声音）
__dshStartupAnimation.play({ silent: true })  // 强制重放，本次静音
__dshStartupAnimation.reset()         // 清掉「本会话已播放」标记
__dshStartupAnimation.active          // 当前是否有覆盖层
__dshStartupAnimation.soundActive     // 音频上下文是否真的起来了
__dshStartupAnimation.muted           // 当前是否静音
__dshStartupAnimation.sound(false)    // 关掉声音并持久化
__dshStartupAnimation.timeline        // 分镜常量（含 BAR_FILL_MS）
__dshStartupAnimation.audio           // 音频调度常量
```

## 卸载 / 回滚

**先说明一个坑**：DSH Desktop 那套私有「禁用账本」（`DesktopPluginsService` /
`readDesktopDisabledBundles`，状态在 `%APPDATA%\DSH Desktop\plugin-management\state.json`）
**只在 community-market 模式下才会注册**。本机 `desktop-market\state.json` 记录的是
`"requested":"dsh-market"`，即 `effectiveMarket === "dsh-market"`，**所以那套账本
在此机器上并未生效**，别指望它。

真正可用的三条路：

**A. 用 loader 层的 `disabled` 关掉（最快，不卸载）。** 在
`<profile>/cordis.patch.yml` 追加：

```yaml
- id: startup-animation
  name: dsh-startup-animation
  disabled: true
```

这是 loader 原生支持的机制（`cordis-plugin-loader` 的 `disabledOf`），
dshmarket 的热禁用走的也是它。改完仍需重启。

**B. 正常卸载：**

```powershell
dsh plugin remove dsh-startup-animation
```

pnpm 会重写 `package.json` / 锁文件 / `node_modules`，随后 `reconcile` 会把
已不再是直接依赖的名字从 `dsh.profile.bundles` 里剔除。

**C. 用系统健康快照回滚（启动界面被搞挂时用）。**
`%APPDATA%\DSH Desktop\health-snapshots\a2c6cd4a6da89d37d344023a081271b2f9407f6bdce0f93cd49aae55f03db29e\slot-{1,2,3}\`
里各有 `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`cordis.patch.yml`，
`manifest.json` 记着 `"reason":"healthy-startup"` 与每文件的 sha256。
这是 DSH Desktop 自己维护的，不是我加的。

> 安装本身也自带兜底：`dsh plugin add` 在兼容性预检失败时会自动还原
> `package.json` 与 `pnpm-lock.yaml` 并重装。

## 已知边界

- 只覆盖 `platform: "web"` 的客户端半侧；不涉及终端 TUI。
- 动画时长、配色、文案目前是写死的常量，集中在 `client/client.js` 顶部的
  `SEQUENCE_MS` / `REDUCED_MS` 和 `CSS` 字符串里。
- 未在 DSH 0.2.0-rc.2 之外的版本上验证。
