# MarkBuddy 浏览器插件 — 对抗性审查与安全审计报告

本报告记录了对 MarkBuddy Chrome 插件（Manifest V3）代码库的深度对抗性审计结果。我们已针对发现的 DOM 稳定性、Range 序列化、错误处理、CSS 隔离性等重大问题实施了修复，并已直接应用至项目代码中。

---

## 审计摘要

| 编号 | 严重程度 | 分类 | 影响位置 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| **[Bug 1：删除或规范 DOM 导致高亮恢复失效](#bug-1删除或规范-dom-导致高亮恢复失效)** | **Critical** | DOM & 序列化 | `content/content.js` | **已修复** |
| **[Bug 2：重叠/嵌套高亮的序列化路径失效](#bug-2重叠嵌套高亮的序列化路径失效)** | **Critical** | DOM & 序列化 | `content/content.js` | **已修复** |
| **[Bug 3：侧边栏点击划线定位无响应](#bug-3侧边栏点击划线定位无响应)** | **Major** | 消息通信 / UX | `content/content.js`, `side-panel/panel.js` | **已修复** |
| **[Bug 4：特殊标签页右键引发未捕获的异常](#bug-4特殊标签页右键引发未捕获的异常)** | **Major** | 稳定性 | `service-worker.js` | **已修复** |
| **[Bug 5：宿主网页 CSS 污染插件 UI](#bug-5宿主网页-css-污染插件-ui)** | **Major** | 样式隔离 / UX | `content/content.css` | **已修复** |
| **[Bug 6：标签页内高亮预设颜色未实时同步](#bug-6标签页内高亮预设颜色未实时同步)** | **Minor** | 数据同步 / UX | `content/content.js` | **已修复** |
| **[Bug 7：Manifest 过度索取主机权限](#bug-7manifest-过度索取主机权限)** | **Major** | 商店审核风险 | `manifest.json` | **建议评审** |

---

## 详细发现与修复方案

### Bug 1：删除或规范 DOM 导致高亮恢复失效
* **严重程度**：**Critical**（导致核心功能失效）
* **定位**：`content/content.js`
* **问题描述**：
  原有高亮序列化方案直接依赖文本节点在父元素中的相对索引 `/text()[N]`。当应用高亮时，文本节点会被分割。
  一旦页面刷新，恢复高亮的顺序可能打乱；或者当用户删除某个高亮时，DOM 会执行 `parent.normalize()` 合并相邻文本节点。此时剩下的高亮在 storage 中保存的索引仍为 `text()[N]（N > 1）`，由于文本节点已被重新合并为一个，XPath 解析会直接返回 `null`，导致该区域后续的所有高亮全部失效消失。
* **复现步骤**：
  1. 在段落中高亮单词 "quick"（保存为 `text()[1]`，节点被分割为两个）。
  2. 在同段落中高亮单词 "fox"（保存为 `text()[2]`）。
  3. 刷新页面，此时如果用户删除 "quick" 高亮，DOM 被规范化还原。
  4. "fox" 的高亮仍然尝试寻找 `/text()[2]`，但目前只有一个文本节点，导致 "fox" 恢复失败。
* **修复方案**：
  放弃使用不稳定的 `/text()[N]` 绝对路径，改用**稳定祖先元素**（绝不会被划线破坏的元素节点，如 `p`、`div` 等）的 XPath，配合文本在祖先节点内的**累积字符偏移量**（计算时排除删除按钮的文本内容）进行精确定位。同时保留了对旧格式的向后兼容，确保历史数据不丢失。

---

### Bug 2：重叠/嵌套高亮的序列化路径失效
* **严重程度**：**Critical**
* **定位**：`content/content.js`
* **问题描述**：
  当用户选取的范围包围或重合了已有的高亮时，XPath 路径会包含动态插入的 `<mark>` 标签（例如 `/html/body/p/mark/text()[1]`）。
  在重新加载页面时，原始 DOM 并没有这些 `<mark>` 标签（它们是通过 JS 动态创建的），这导致 XPath 无法解析，重叠部分的高亮无法被还原。
* **复现步骤**：
  1. 高亮单词 "fox"。
  2. 随后高亮包含该词的短语 "brown fox jumps"。
  3. 刷新页面，第二个长划线因路径中包含第一个划线产生的 `<mark>` 节点而无法解析。
* **修复方案**：
  通过 Bug 1 引入的「稳定祖先元素 + 文本偏移量」定位法，寻找节点时会自动向上溯源并避开所有 `.markbuddy-highlight` 元素，生成的 XPath 绝对不包含动态高亮标签，彻底解决了重叠划线问题。

---

### Bug 3：侧边栏点击划线定位无响应
* **严重程度**：**Major**
* **定位**：`content/content.js` / `side-panel/panel.js`
* **问题描述**：
  侧边栏点击某条划线时，会调用 `chrome.tabs.sendMessage` 发送 `SCROLL_TO_HIGHLIGHT` 消息通知页面滚动。但内容脚本中没有注册对应的消息监听器，导致点击毫无反应，同时在侧边栏控制台抛出未捕获的 Connection 异常。
* **修复方案**：
  1. 在 `content.js` 中添加消息监听器，收到 `SCROLL_TO_HIGHLIGHT` 后，执行 `scrollIntoView({ behavior: 'smooth', block: 'center' })`，并让高亮区域背景色临时闪烁红光（1秒后恢复原高亮色），给用户强烈的视觉指引。
  2. 在 `panel.js` 的 `sendMessage` 回调中，检查并拦截 `chrome.runtime.lastError`，消除在未注入内容脚本页面上的报错红线。

---

### Bug 4：特殊标签页右键引发未捕获的异常
* **严重程度**：**Major**
* **定位**：`service-worker.js`
* **问题描述**：
  在系统页面（如 `chrome://extensions`）或 Chrome 应用商店中右键点击 MarkBuddy 菜单时，Service Worker 会尝试在当前 Tab 注入执行脚本。然而，谷歌出于安全考虑限制了这些特殊页面上的脚本注入，导致抛出未捕获的 Promise 异常。
* **修复方案**：
  在 `service-worker.js` 的菜单点击监听器中增加 `try/catch` 保护，捕获并静默记录此类不可达页面的注入异常。

---

### Bug 5：宿主网页 CSS 污染插件 UI
* **严重程度**：**Major**
* **定位**：`content/content.css`
* **问题描述**：
  插件的浮动工具栏和 Toast 通知被直接挂载在宿主页面的 DOM 下。如果目标网站编写了非常激进的全局重置样式（例如 `button { padding: 30px !important; }`），工具栏’的布局就会完全变形扭曲。
* **修复方案**：
  在 `content.css` 中为 `#markbuddy-toolbar` 和 `#markbuddy-toast` 添加了极强烈的防御性重置 CSS 规则，对所有子元素强制清空 margin、padding、background 并强制设为 `box-sizing: border-box !important`，确保在任何混乱的宿主网页中均能完美展现 UI。

---

### Bug 6：标签页内高亮预设颜色未实时同步
* **严重程度**：**Minor**
* **定位**：`content/content.js`
* **问题描述**：
  用户在侧边栏的设置中修改默认高亮颜色后，虽然修改已写入 `chrome.storage.local`，但已打开的网页缓存的是初始化时的颜色设置，导致用户必须刷新页面，新划线才会采用新的高亮颜色。
* **修复方案**：
  在内容脚本中增加 `chrome.storage.onChanged` 监听器，捕获 `settings` 的变更，实时同步当前标签页的默认颜色，并即时重新渲染已打开的悬浮工具栏。

---

### Bug 7：Manifest 过度索取主机权限
* **严重程度**：**Major**
* **定位**：`manifest.json`
* **问题描述**：
  在 `host_permissions` 中声明了 `<all_urls>`。虽然我们要对所有网页进行高亮，但目前在 `content_scripts` 节点中已经配置了 `<all_urls>` 用于内容脚本注入。此时在 `host_permissions` 中再次重复索取可能会引发 Chrome 应用商店安全审核部门的严格人工排查，拉长审核周期。
* **修改建议**：
  如果不涉及跨域背景 Fetch 请求，建议在最终打包提交商店前，从 `host_permissions` 字段中移除 `<all_urls>`，仅保留 `content_scripts` 中的声明。

---

## 结论
通过本次对抗性审计与重构，MarkBuddy 浏览器插件的关键交互和定位机制已得到极大的稳固，解决了复杂 DOM 结构上的定位 Fragility。项目已具备发布的基础稳定性。
