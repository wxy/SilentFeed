# 如何加载和测试扩展

## 当前状态

✅ 扩展已经可以构建  
✅ 有基础的 Popup、Options、NewTab 页面  
✅ Plasmo 自动生成了图标和 manifest.json

---

## 在 Chrome 中加载扩展

### 方法 1: 加载开发版本（推荐开发时使用）

1. **构建开发版本**
   ```bash
   npm run dev
   ```
   这会启动监听模式，代码变化时自动重新构建

2. **打开 Chrome 扩展管理页面**
   - 地址栏输入: `chrome://extensions/`
   - 或点击 菜单 → 更多工具 → 扩展程序

3. **开启开发者模式**
   - 点击右上角的"开发者模式"开关

4. **加载扩展**
   - 点击"加载已解压的扩展程序"
   - 选择项目中的 `build/chrome-mv3-dev` 目录
   - 点击"选择"

5. **验证安装成功**
   - 扩展列表中出现 "SilentFeed"
   - 工具栏出现扩展图标（Plasmo 默认图标）
   - 点击图标能看到 Popup 弹窗

### 方法 2: 加载生产版本（用于测试最终效果）

1. **构建生产版本**
   ```bash
   npm run build
   ```

2. **加载扩展**
   - 同上，但选择 `build/chrome-mv3-prod` 目录

---

## 当前可用功能

### Popup 页面
- 点击工具栏图标打开
- 显示默认的 Plasmo 欢迎页面
- **路径**: `src/popup.tsx` (需要我们自定义)

### Options 页面
- 在扩展管理页面点击"详情" → "扩展程序选项"
- 或右键图标 → "选项"
- 显示默认的 Plasmo 设置页面
- **路径**: `src/options.tsx` (需要我们自定义)

### NewTab 页面
- 打开新标签页时显示
- 显示默认的 Plasmo 新标签页
- **路径**: `src/newtab.tsx` (可选功能)

---

## 开发工作流

### 实时预览

```bash
# 启动开发模式
npm run dev

# 扩展会自动重新加载（需要手动刷新扩展页面）
```

每次代码修改后：
1. Plasmo 自动重新构建
2. 在 `chrome://extensions/` 点击刷新按钮 🔄
3. 或使用快捷键重新加载扩展

### 调试技巧

#### 调试 Popup
1. 打开 Popup
2. 右键点击 Popup 内容 → "检查"
3. 打开 DevTools 调试

#### 调试 Background Script
1. 在 `chrome://extensions/` 找到扩展
2. 点击 "service worker" 链接
3. 打开 DevTools 查看日志

#### 调试 Content Script
1. 打开任意网页
2. F12 打开 DevTools
3. 在 Console 可以看到 content script 的日志

---

## 验证清单

在开始开发前，请确认：

- [ ] `npm run dev` 可以成功运行
- [ ] 扩展可以在 Chrome 中加载
- [ ] 点击图标能看到 Popup
- [ ] 可以打开 Options 页面
- [ ] DevTools 没有错误

---

## 常见问题

### Q: 扩展加载后图标不显示？
A: 这是正常的，Plasmo 使用默认图标。在阶段 1 我们会添加自定义图标。

### Q: 修改代码后没有生效？
A: 
1. 确认 `npm run dev` 正在运行
2. 查看终端是否有构建成功消息
3. 在 `chrome://extensions/` 手动刷新扩展

### Q: Popup 打开后立即关闭？
A: 检查浏览器控制台是否有 JavaScript 错误

### Q: 如何卸载扩展？
A: 在 `chrome://extensions/` 点击"移除"按钮

---

## 下一步

现在扩展骨架已经可以运行，我们准备开始：

**阶段 1: Hello World 扩展**
- 自定义 Popup 界面
- 自定义 Options 页面  
- 添加自定义图标

准备好开始了吗？🚀
