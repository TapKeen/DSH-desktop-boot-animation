# DSH Desktop 开机动画

给 **DSH Desktop / DSH Web** 加一段 **8 秒开机动画 + 开机音**。

它是一个标准的 **Cordis 客户端插件**，装在 DSH 的 `desktop` profile 里，
所以动画出现在你实际使用的那个窗口里——**不是另起一个客户端，也不是改 DSH 源码**。

```
                        DEEPSEEK  HARNESS
                             ▲
                    同心刻度环 / 内接三角徽章
                    竖向扫描线 / 进度条 / 两圈确认脉冲
                             ▼
                    0 ─────────── 5.4s ─────── 8.0s
                    舞台升起      锁入脉冲      淡出
```

---

## 它做什么

| 时间 | 画面 | 声音 |
|---|---|---|
| 0.0–1.0s | 舞台升起 | 开机音从头铺底 |
| 0.4–2.4s | 三角徽章描边绘制 | |
| 0.6s 起 | 扫描线（3s 一轮） | |
| 0.8–2.3s | `DEEPSEEK HARNESS` 逐字浮现 | |
| 2.1s | 副标题（带真实外壳版本号） | |
| 2.4–7.7s | 进度条填充 + 微光扫过 | |
| 3.2s | 跳过提示 | |
| 5.4–7.8s | 两圈「确认脉冲」 | |
| 8.0s | 淡出，露出真实界面 | 素材自然收尾 |

交互：**任意键 / 点击 / Esc 立即跳过**，**`M` 静音切换**（偏好持久化），
`prefers-reduced-motion` 时退化为静态帧，每个窗口会话只播一次。

## 它**不**做什么

这几条是刻意的设计约束，不是遗漏：

- **不谎报系统状态。** 画面里没有假的「正在鉴权」「正在加载 N 个技能」，也没有把百分比
  伪装成真实进度。**唯一展示的真实数据是外壳版本号**，取自 `window.__DSH_BOOT__`。
- **不碰任何宿主能力。** 主机半侧 `lib/index.js` 是一个空实现。
- **不依赖平台模块。** `dsh.client.inject` 为空，不 require React 或任何 `@deepseek-ai/*` 包。
- **不会把你的界面锁死。** 任何异常路径都会把覆盖层摘掉；就算动画崩了，也只是没有动画。

---

## 架构

### 它是一个 Cordis 客户端插件，不是一个注入脚本

DSH Desktop 本身就是架在官方 `@deepseek-ai/dsh` 之上的 Cordis 插件宿主。
DSH 有一套官方的**浏览器插件机制**：包的 `package.json` 里声明

```json
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": { "platform": "web", "inject": [] }
}
```

宿主半侧扫描已启用的 Loader 条目、组合启动图，把每个插件的 `exports["./client"]`
作为一个 bundle 经由 `/plugins` 发给浏览器，浏览器侧再惰性加载。

于是"装一个开机动画"就等于"加一个 profile 层的插件"，**不需要改 DSH 源码，也不需要
替换任何可执行文件**。

### 两半，其中一半是刻意的空实现

```
lib/index.js       主机半侧 —— 空实现，不注册任何东西
client/client.js   浏览器半侧 —— 全部功能都在这里
```

主机半侧完全可以什么都不做，因为动画是纯粹的浏览器侧关注点。**保持它是空的是一项
值得守的性质**：没有 HTTP 路由、没有文件读写、没有设置项、没有定时器、对模型完全不可见。

反面例子是为了伺服一个音频文件而引入一条宿主侧的本地路由——那会凭空多出一个需要
鉴权和路径遍历防护的端点。本项目为此付了包体膨胀的代价（见下）。

### 浏览器 bundle 是手写的，不经过任何打包器

DSH 的客户端模块系统只要求 bundle 是一段**同步注册 factory 的普通脚本**：

```js
window.__ModuleLoader__.load({
  id: 'dsh-startup-animation',          // 必须等于包名
  factory: (require) => {
    var module = { exports: {} }; var exports = module.exports;
    // …… Cordis 插件对象
    return module.exports;
  }
});
```

**宿主从不对这个产物做解析、转译或类型检查**，它只把字节拼进 combo 脚本发出去。
所以这里没有 tsdown / vite / rollup，也没有构建产物与源码的分离——`client/client.js`
就是源码本身，255 KB 有 220 KB 是内嵌音频的 base64。

因此它**不能写 JSX 或 TypeScript**（浏览器按普通脚本解析）。本项目也刻意不用 React：
`inject` 为空，一个平台模块都不 require。

### 为什么不走官方的 `shell.overlay` 插槽

DSH 的 UI 插槽系统里有一个看起来正合适的 `shell.overlay`。**本项目没有用它**，原因是
一个具体的层叠上下文陷阱：

```css
/* dsh-client-ui-layout 里的 shell.overlay 容器 */
.overlayLayer { position: absolute; inset: 0; z-index: 20; pointer-events: none; }
```

`position: absolute` + `z-index: 20` **会创建层叠上下文**，子元素的 `z-index` 再大也
无法超出它。而开机动画必须盖住**一切**——包括任何 z-index 更高的对话框和浮层。

所以覆盖层直接挂到 `document.body`，并给 `z-index: 2147483647`：

```js
document.body.appendChild(overlay);
```

代价是不走 React 生命周期，收益是**真正全屏覆盖且不依赖 React**。对一段开机动画来说
这笔交易是划算的。

### 音频为什么内嵌成 base64

音频由使用者提供，最终以 **base64 内嵌进 `client/client.js`**，而不是作为 `.mp3` 放在包里。

原因还是那个空实现的主机半侧：**没有宿主路由，浏览器就没有 URL 可以去拉这个文件。**
可行路径只有两条：

| 方案 | 代价 |
|---|---|
| **base64 内嵌**（本项目采用） | 包体膨胀约 33%；生成的 blob 不可读 |
| 加一条宿主侧伺服路由 | 主机半侧从"零暴露面"变成"多一个需要防护的本地端点" |

选了前者。构建由 [`scripts/embed-audio.mjs`](scripts/embed-audio.mjs) 完成，它替换
`client/client.js` 里的 `__DSH_AUDIO_B64__` 占位符。

---

## 关键工程决策（以及踩过的坑）

### 1. 分镜时序必须由常量统一推导，不能散落硬编码

一开始把总时长从 3.6 秒改成 8 秒时，**进度条会在动画淡出之后才填满**——因为填充时长
是独立硬编码的。

修法是把所有分镜收进一个 `T` 对象，并让进度条时长**由总时长反推**：

```js
const SEQUENCE_MS = 8000;
const T = { barInDelay: 2400, barFillPad: 300, /* … */ };
// 填充在淡出前 barFillPad 毫秒结束，所以进度条一定填得满
const BAR_FILL_MS = SEQUENCE_MS - T.barInDelay - T.barFillPad;   // 5300
```

### 2. 关闭 AudioContext 时若有音符在响，会变成爆音

这是本项目最值得记下来的一个坑。

覆盖层在 8.0 秒结束时 `finish()` 会关闭 AudioContext。而最初的和弦尾音一直拖到
**8.5 秒**——于是**在还在响的时候硬切**，产生可听见的爆音。当时排的 master 淡出在
8.1–8.16s，**根本没机会执行**。

修法是两条：

- 所有声部必须在 `AUDIO_END_MS` 前归零；
- **延迟关闭上下文**——跳过时留 320ms 让静音斜坡走完，自然结束时留 700ms 让尾音收完。

```js
if (reason === 'timer') {
  window.setTimeout(() => snd.dispose(), 700);   // 让尾音走完
} else {
  snd.setMuted(true);                            // 斜坡静音
  window.setTimeout(() => snd.dispose(), 320);
}
```

### 3. 自适应淡出：只在需要时才淡

素材比窗口长时，必须淡出，否则就是上面那个爆音。素材本来就短时，**不该淡**——
那会白白削掉它自己的收尾。

```js
if (AUDIO_START_MS / 1000 + buffer.duration > AUDIO_END_MS / 1000) {
  g.gain.setValueAtTime(1, Math.max(t0 + 0.05, t0 + endSec - 0.8));
  g.gain.linearRampToValueAtTime(0.0001, t0 + endSec);
}
```

仓库内素材 7.053 秒 < 7.65 秒窗口，**所以不淡出**，由它自己收尾。这个行为有测试卡住
（见"验证方法"）。

起始另有 **20ms 淡入**，消除第 0 个采样点的直流跳变。

### 4. 失败必须可诊断，不能静默

音频起不来时必须**静音降级**（这是对的——装饰性动画绝不能挡住启动），但**静默失败会
让一个"永远不响的开机音"完全无法排查**。

所以：`console.warn` 给出原因，且暴露 `__dshStartupAnimation.audioError` 供查询。

这个决定是被测试逼出来的：桩里少一个 `window.setTimeout` 就让整条音频链路静默死掉，
而当时没有任何输出能说明发生了什么。

### 5. 打包白名单防止构建产物泄漏

`package.json` 的 `files` **显式列出每个文件**，而不是用 `["client"]` 这样的目录：

```json
"files": ["lib/index.js", "client/client.js", "cordis.patch.yml", "README.md", "preview.html"]
```

原因：注入脚本会在 `client/client.js.pre-embed` 留一份 29 KB 的备份，而目录通配
会把它**一起打进发布包**。这个问题是实测发现的。

### 6. 浅色主题不是"把白色填进去"

深色主题上好看的手法搬到白底会**全部失效**，必须逐项替换：

| 深色写法 | 浅色替代 |
|---|---|
| 加色发光（bloom） | 淡蓝晕 + 柔和投影——白底上 bloom 会糊成一坨 |
| 亮蓝强调 `#6fb6ff` | 饱和深蓝 `#2563d6`（白底才够对比） |
| 深色暗角 | 极浅冷灰边缘压暗 |
| 亮白文字 | 深蓝墨色 `#10243d` |
| 2px 进度条 | 3px——细条在浅底上更容易糊 |

配色集中在 `client/client.js` 顶部一个具名常量 `P`，换主题是一处改动。

### 7. 音频合成链路

```
BufferSource → 片段增益 → 低通 16 kHz → 压缩器 → 主增益(0.85) → destination
```

低通把音色压暖，压缩器兜住峰值，主增益承载音量与静音。

---

## 验证方法

这个项目没有一行单元测试代码，但它的关键行为**都是实测过的**——方法是把**真实的
bundle 跑在桩实现上**。

### 为什么能这么测

`client/client.js` 在 factory 内部只依赖 `window`、`document` 和 Web Audio。所以在 Node 里
提供一个最小的 `window` / `document` / `AudioContext` 桩，就能把**未经修改的产物**
真正执行一遍，而不是读代码猜。

### 桩不是走过场，它带规范不变量

例如 `exponentialRampToValueAtTime` 在起始值为 0 时**会直接抛异常**，所以桩主动拒绝
这种调用：

```js
exponentialRampToValueAtTime(v, t) {
  if (v <= 0) errors.push('exponentialRamp target must be > 0');
  if (this.lastValue <= 0) errors.push('exponentialRamp from non-positive value');
  ...
}
```

### 这套方法实际抓到的东西

| 抓到的 | 性质 |
|---|---|
| 和弦尾音超出 8.5s，关闭上下文时会被硬切 | **真实缺陷**，已修 |
| 铺底第二声部因 120ms 错拍超线 180ms | **真实缺陷**，已修（并把错拍量提成常量，使其可被检查覆盖） |
| 调度异常被 catch 静默吞掉 | **真实缺陷**，已加告警 |
| `client.js.pre-embed` 会被打进发布包 | **真实缺陷**，已加白名单 |
| 桩缺 `window.setTimeout` | 测试桩的问题 |
| 桩缺 `overlay.getAttribute` | 测试桩的问题 |
| 取错了 `createGain` 的顺序（player 而非 master） | 测试桩的问题 |

后三行的共同点是：**每次都被那个 fail-closed 的 catch 吞掉**，表现为"音频没起来"而
毫无线索。这既说明桩必须忠于是必要的，也反过来验证了那层清理逻辑是对的。

### 材料本身的验证

上传的 MP3 在嵌入前被完整解析过：ID3v2.3 标签、**逐帧走完 270 帧**、
MPEG1 Layer III / 44.1 kHz / 立体声 / 192 kbps CBR、**精确时长 7.053 秒**、
音频字节全部消费且**尾部 0 字节残留**。

嵌入后再做 **base64 往返比对**，确认解出的字节与源文件完全一致。

---

## 安装

需要 **DSH Desktop**（或官方 DSH + 可用的 `web` 承载）。

```powershell
dsh plugin add "E:\path\to\DSH-desktop-boot-animation"
```

装完**完整退出并重启 DSH Desktop**——profile 组合每个 Host generation 只计算一次，
运行中的实例看不到新 bundle。

### 卸载 / 禁用

```powershell
dsh plugin remove dsh-startup-animation
```

或临时关掉而不卸载，在 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` 追加：

```yaml
- id: startup-animation
  name: dsh-startup-animation
  disabled: true
```

### 排查

开发者工具里执行：

```js
__dshStartupAnimation.play()                   // 强制重放
__dshStartupAnimation.audioError               // 最后一次音频失败的原因
__dshStartupAnimation.soundActive              // 音频上下文是否真的起来了
__dshStartupAnimation.timeline                 // 分镜常量
```

---

## 替换开机音

替换成你自己的音频：

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& "DSH Desktop.exe" scripts/embed-audio.mjs . "你的音频.mp3"
```

用 `dsh plugin add <目录>` 装这种源码形态时，插件是 `link:` 到该目录的，
所以**改完直接生效**，无需重新安装。

脚本会校验容器类型（MP3 / WAV / Ogg）、做 base64 往返比对，并保留一份
`client/client.js.pre-embed` 备份（该备份不会进入发布包）。

素材建议：**1–8 秒**，MP3 或 WAV。WAV 的好处是它是裸 PCM，**可以直接裁剪**；
MP3 要做帧精确裁剪就麻烦得多。

---

## 借鉴与致谢

### [Ar1haraNaN7mI/deepseek-harness-rust-optimize](https://github.com/Ar1haraNaN7mI/deepseek-harness-rust-optimize) —— 本项目的起点

说清楚具体借鉴了什么，免得含糊：

1. **方向。** 它的 `integrations/native-startup/` 证明了"把启动动画注入官方 DSH 的
   网页表面"这条路走得通。在此之前，"给自己的 DSH Desktop 加开机动画"看起来并不像
   一件能做成的事。
2. **插件契约。** 它的 `plugin.mjs` 是宿主侧 Cordis 插件的参考实现
   （`ctx.webServer.register` + `webserver/index-inject`）。本项目最终走了另一条路
   （`dsh.client` 浏览器插件），但读它的代码是理解这套机制的入口。
3. **视觉语汇。** 它的 README 描述自己的徽章"以三角形为主体……三层扫描线"。
   本项目的徽章——内接三角形 + 48 道刻度环 + 竖向扫描线——属于**同一视觉家族**。

**没有拿的**：一行代码、一个图形、一个字体、一段音频。本仓库的 `client/client.js`、
CSS、SVG 全部独立手写；音频由使用者提供。

它的演出是三个确认节点 + 焦点切换 + 英文旁白的**交互式 PV**；本项目是
**被动播放 + 可跳过**的简化版。这是有意的取舍，不是能力差距。

### 其他

- **DeepSeek 官方 DSH** —— 提供了 `dsh.client` / `window.__ModuleLoader__` 这套
  浏览器插件机制，本项目只是它的一个使用者。
- **anywhere-labs/deepseek-harness-desktop** —— DSH Desktop 外壳。
- 客户端 bundle 的格式（`window.__ModuleLoader__.load({ id, factory })`、factory 形式的
  CJS、平台种子模块表）是通过**逆向一个已安装的第三方插件** `dshmarket` 确定的，
  而不是靠文档。

## 许可

MIT，见 [LICENSE](LICENSE)。

`client/client.js` 内嵌的音频由本仓库使用者提供，**不在 MIT 授权范围内**，
其权利归提供者所有。
