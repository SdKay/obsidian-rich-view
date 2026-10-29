<div align="center">

<p>
  <b>🔍 缩放 &nbsp;·&nbsp; 🖱️ 平移 &nbsp;·&nbsp; 📄 多页 &nbsp;·&nbsp; 🎞️ 幻灯片 &nbsp;·&nbsp; 🗂️ 标签页打开 &nbsp;·&nbsp; 🔗 图形链接 &nbsp;·&nbsp; 🔎 放大镜 &nbsp;·&nbsp; ⤢ 全屏 &nbsp;·&nbsp; 📦 三方图形库 &nbsp;·&nbsp; 🖍️ 搜索高亮 &nbsp;·&nbsp; 🌙 深色模式</b>
</p>

<p>
  <a href="https://github.com/SdKay/obsidian-rich-view/releases/latest">
    <img src="https://img.shields.io/github/v/release/SdKay/obsidian-rich-view?style=flat-square&color=7c3aed" alt="最新版本" />
  </a>
  <a href="https://github.com/SdKay/obsidian-rich-view/releases">
    <img src="https://img.shields.io/github/downloads/SdKay/obsidian-rich-view/total?style=flat-square&color=brightgreen" alt="总下载量" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/github/license/SdKay/obsidian-rich-view?style=flat-square" alt="许可证" />
  </a>
  <a href="https://obsidian.md/plugins?id=rich-view">
    <img src="https://img.shields.io/badge/Obsidian-社区插件-7c3aed?style=flat-square&logo=obsidian&logoColor=white" alt="Obsidian 社区插件" />
  </a>
</p>

<p>
  <a href="#功能">功能</a> ·
  <a href="#演示">演示</a> ·
  <a href="#使用方法">使用方法</a> ·
  <a href="#在标签页中打开文件">标签页</a> ·
  <a href="#配合-rich-search-搜索">搜索</a> ·
  <a href="#三方图形库">三方图形库</a> ·
  <a href="#操作方式">操作方式</a> ·
  <a href="#设置项">设置项</a> ·
  <a href="#安装">安装</a> ·
  <a href="README.md">English</a>
</p>

<p>
  <img src="wechat.jpg" alt="微信公众号" width="120" />
  <br/><sub>关注微信公众号，获取更多 Obsidian 插件与工具</sub>
</p>

<table>
  <thead>
    <tr><th colspan="3">我的其他插件</th></tr>
    <tr><th>插件</th><th>简介</th><th>安装页</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><a href="https://github.com/SdKay/obsidian-rich-table"><b>Rich Table</b></a></td>
      <td>笔记里的类电子表格，外加 Excel 查看器；可被 Rich Search 搜索</td>
      <td><a href="obsidian://show-plugin?id=rich-table">在 Obsidian 中打开</a></td>
    </tr>
    <tr>
      <td><a href="https://github.com/SdKay/obsidian-rich-search"><b>Rich Search</b></a></td>
      <td>
        <b>搜索：</b>范围、正则、全词、历史记录<br/>
        <b>跨文件：</b>能搜 draw.io、Visio、PowerPoint 文件里的文字，打开时标出命中位置
      </td>
      <td><a href="obsidian://show-plugin?id=rich-search">在 Obsidian 中打开</a></td>
    </tr>
  </tbody>
</table>

</div>

---

在笔记里直接看 draw.io、Visio 和 PowerPoint 文件。能缩放、平移、翻页、点图形链接。Word、CAD 等格式后面再加。

## 功能

- **嵌进笔记**：用 `rich-view` 代码块。插入一个空块，点 **导入文件** 就行。
- **支持 draw.io、Visio、PowerPoint**：`.drawio`、`.vsdx`、`.pptx`。
- **缩放、平移、放大镜**。幻灯片一次一页，始终完整显示。
- **页面标签**：图表的各页、幻灯片都能切换。
- **单独标签页打开**：在文件列表里点一下就开，不用写代码块。
- **能被 Rich Search 搜到**。点结果就跳到对应的页或幻灯片，并标出命中位置。
- **图形链接**：给 draw.io 图形挂笔记或网址。
- **固定视图**：把页、缩放、位置存进代码块。
- **三方图形库**（AWS、Azure、GCP、Cisco 等）按需下载。
- **全屏**、可调高度、**深色模式**，手机上也能用。

---

## 演示

<!-- 添加演示：将 GIF 按下方各注释中的文件名保存到 docs/，删除“即将推出”一行以及图片行两侧的注释标记。 -->

### 嵌进笔记

插入一个空的 `rich-view` 块，点 **导入文件**，选个文件就完事。

> 🎬 *演示 GIF 即将推出*
<!-- ![内嵌文件演示](docs/demo-01-embed.gif) -->

### 缩放、平移与固定视图

滚轮缩放，拖动平移，小字用放大镜看。固定一下，视图就存住了。

> 🎬 *演示 GIF 即将推出*
<!-- ![缩放平移与固定视图演示](docs/demo-02-zoom-pin.gif) -->

### 幻灯片与多页

幻灯片和图表的页面都用标签切换。

> 🎬 *演示 GIF 即将推出*
<!-- ![幻灯片与多页演示](docs/demo-03-pages.gif) -->

### 标签页打开

在文件列表里点一下文件，就全尺寸打开。

> 🎬 *演示 GIF 即将推出*
<!-- ![标签页打开演示](docs/demo-04-tab.gif) -->

### 搜图表和幻灯片里的字

在 Rich Search 里搜个词，点结果。文件会打开到对应页、自动放大，命中位置会被标出来。

> 🎬 *演示 GIF 即将推出*
<!-- ![搜索演示](docs/demo-05-search.gif) -->

### 图形链接与图形库

悬停在图形上点 ✎ 加链接。缺图形库时，一键下载。

> 🎬 *演示 GIF 即将推出*
<!-- ![图形链接与图形库演示](docs/demo-06-links-libraries.gif) -->

---

## 使用方法

文件放仓库里哪都行，用 `rich-view` 代码块嵌进来。最省事：插入一个**空**块，点 **导入文件**。

也可以自己写：

````markdown
```rich-view
file=my-diagram.drawio
```
````

其他参数都是 `key=value`，用 `|` 隔开，顺序随意：

````markdown
```rich-view
file=my-diagram.drawio|page=my_page|height=600|zoom=80|offset=190,34
```
````

| 键 | 示例 | 作用 |
|----|------|------|
| `file` | `file=my-diagram.drawio` | 必填。仓库路径或文件名。 |
| `page` | `page=my_page` | 按页名指定页（图表）。默认第一页。 |
| `page-index` | `page-index=2` | 按位置指定页或幻灯片，从 1 数。设了 `page=` 就忽略它。 |
| `height` | `height=600` | 高度，单位像素。默认 400。 |
| `zoom` | `zoom=80` | 初始缩放（%）。默认自动适配。 |
| `offset` | `offset=190,34` | 初始平移位置（图表）。默认居中。 |

---

## 在标签页中打开文件

在文件列表里点 `.drawio`、`.vsdx` 或 `.pptx`，它会在普通标签页里打开，缩放、平移、分页和内嵌时一样。

不想用？在 **设置 → Rich View → File tabs** 里关掉对应格式，比如想让别的插件打开 `.drawio`。改完要重载插件才生效。

---

## 配合 Rich Search 搜索

装上 [Rich Search](https://github.com/SdKay/obsidian-rich-search)，文件里的字就能像笔记一样被搜到：

| 格式 | 搜什么 | 点结果后 |
|---|---|---|
| draw.io | 所有页上每个图形的标签 | 跳到该页，标出图形 |
| Visio | 所有页上每个图形的文字 | 跳到该页，标出图形 |
| PowerPoint | 每个文本框和表格单元格 | 跳到该幻灯片，标出关键词 |

- 搜索面板开着时，打开的文件里所有命中都会标出来。你点的那条更亮、带边框。颜色用的是你在 Rich Search 里设的。
- 标记跟随搜索范围。不在你限定的文件夹或文件类型里的文件不会被标记，哪怕它开在另一个标签页；改了范围，标记会立刻出现或消失。（需要发布了搜索范围的 Rich Search 版本；旧版本下所有打开的文件都会标记。）
- 图表太小看不清时，会自动放大到字和笔记正文差不多大。
- PowerPoint 能量出文字位置时标关键词本身，量不出就标整个文本框。draw.io 和 Visio 标整个图形。
- 没装 Rich Search 也行，文件照常打开，只是没有标记。

---

## 三方图形库

图表用到了额外的图形库（AWS、Azure、GCP、Cisco、IBM 等），第一次打开会弹出一个横幅。点 **Download**，库会从 draw.io 官方仓库下载到本地，以后直接用。

**设置 → Rich View → Shape libraries** 里可以：
- 按类别浏览、下载官方库
- **Auto-detect from vault**：自动找出你的图表都需要哪些库
- 设**自定义文件夹**放自己的图形

---

## 操作方式

查看器下方是状态栏：左边是页面标签，然后是缩放比例，右边是一排图标按钮。

| 图标（悬停看提示） | 作用 |
|------|------|
| 🔍 **放大镜** | 开关放大镜（图表） |
| **自动适配查看器大小** | 整页适配当前查看器 |
| 📌 **将当前视图…固定到代码块** | 把页、缩放、位置存进代码块 |
| 📂 **切换到其他文件** | 让这个代码块指向别的文件 |
| ↗ **用系统默认程序打开** | 用系统默认应用打开 |
| ⤢ **全屏** | 铺满屏幕（Esc 退出） |
| **拖动底边** | 调整高度 |

| 手势 | 图表 | 幻灯片 |
|------|------|--------|
| **滚轮** | 缩放（或 Ctrl+滚轮，见设置） | 滚动 |
| **Ctrl + 滚轮** | 缩放 | 缩放 |
| **拖动** | 平移 | 放大后用滚动条 |
| **双指捏合** | 缩放（触屏） | — |
| **双击** | 回到初始视图 | — |

**小技巧：** 调到想要的视图，点图钉图标。代码块会自动更新，以后每次打开笔记都是这个视图。固定之后双击会回到固定的视图；想重新自动适配，点“自动适配查看器大小”，再固定一次。

### 幻灯片

一次一页，用编号标签切换。幻灯片始终完整显示，高度缩小它会重新适配。Ctrl+滚轮放大，再用滚动条移动。没有动画和切换效果。

### 图形链接

悬停在 draw.io 图形上点 **✎**，可以链接到笔记或网址。点图形就跳转（用哪种点击看 **Click behavior**）。

### 放大镜

点 🔍，一个放大镜会跟着光标走。**+ / -** 调大小，滚轮照常缩放。按 **Esc** 或点别处退出。

---

## 深色模式

跟着 Obsidian 主题走，不用设置。

---

## 设置项

| 设置 | 作用 |
|------|------|
| **Zoom modifier key** | 滚轮直接缩放，还是 Ctrl+滚轮缩放。 |
| **Click behavior** | 直接点击还是 Ctrl+点击来跳转图形链接。 |
| **File tabs** | 按格式设置是否用 Rich View 标签页打开文件。改完重载插件生效。 |
| **Custom library folder** | 放你自己图形的仓库文件夹。 |
| **Shape libraries** | 下载官方库，或从仓库自动检测。 |

设置页目前只有英文。

---

## 安装

**社区插件市场（推荐）：** 设置 → 第三方插件 → 浏览 → 搜 **Rich View** → 安装 → 启用。

**手动：** 从[最新发布](https://github.com/SdKay/obsidian-rich-view/releases/latest)下载 `main.js`、`manifest.json`、`styles.css`，放到 `<仓库>/.obsidian/plugins/rich-view/`。

需要 Obsidian 1.8.7 或更高版本。

---

## 已知限制

- draw.io 的表格和扩展图形集里，有些图形渲染得不完美。
- Visio：箭头统一画成一种三角形；填充和线型是近似的；椭圆弧会画成直线；不读图形上的超链接；没有轮廓的文本框不会画出来（所以也搜不到）。不支持旧版 `.vsd`。
- Visio 里指定的字体，你电脑上装了才会用，没装就用系统字体。
- PowerPoint：没有动画和切换效果；SmartArt、图表、内嵌字体只能尽力渲染；不支持旧版 `.ppt`。
- 不支持 `![[file.drawio]]` 这种嵌入写法，请用代码块。
- 实时预览里退出代码块编辑时，页面可能会轻微跳一下。

---

## 开发

```bash
npm install
npm run dev     # 监听构建
npm test        # 单元测试
npm run lint
npm run build   # 类型检查 + 生产构建
```

先看 [CLAUDE.md](CLAUDE.md)：架构、测试怎么写、怎么发版。

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=SdKay/obsidian-rich-view&type=Date)](https://star-history.com/#SdKay/obsidian-rich-view&Date)

---

## 许可证

[MIT](LICENSE) © 2026 [sdking.xing](https://github.com/SdKay)

---

## 支持项目

Rich View 免费开源。如果它帮你省了时间，欢迎捐赠，让它继续更新。

### 💳 PayPal
[![Donate via PayPal](https://img.shields.io/badge/Donate-PayPal-003087?style=flat-square&logo=paypal&logoColor=white)](https://paypal.me/ssdking)

### 🧧 微信支付 / 支付宝

| 微信支付 | 支付宝 |
|:---:|:---:|
| <img src="docs/wechat-donate.jpg" width="120" alt="微信支付捐赠二维码" /> | <img src="alipay.jpg" width="120" alt="支付宝捐赠二维码" /> |

谢谢！🙏

---

## 反馈

问题和建议：[GitHub Issues](https://github.com/SdKay/obsidian-rich-view/issues)
