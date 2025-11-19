# 🧪 如何测试手绘风格 UI

## 📋 快速测试步骤

### 1. 加载扩展
```bash
# 确保已构建
npm run build

# Chrome 浏览器:
# 1. 打开 chrome://extensions/
# 2. 启用"开发者模式"
# 3. 点击"加载已解压的扩展程序"
# 4. 选择项目的 build/chrome-mv3-prod 文件夹
```

### 2. 查看弹窗效果
1. 点击浏览器工具栏的扩展图标
2. 观察手绘风格的弹窗界面：
   - ✨ 手写字体标题 "Silent Feed"
   - 🎨 手绘风格的分割线
   - 🌱 放大的成长阶段 emoji（带动画）
   - 📊 手绘进度条（虚线边框、斜纹填充）
   - 🏷️ 手绘徽章（旋转效果）
   - 🗂️ 手绘卡片（提示信息）
   - ⚙️ 手绘按钮（悬停抬起、点击下沉）

### 3. 测试交互效果
- **悬停按钮**: 应该看到轻微抬起和阴影增强
- **点击按钮**: 应该看到下沉效果
- **悬停 emoji**: 应该看到放大和反向旋转

### 4. 测试暗色模式
```javascript
// 在浏览器控制台执行
document.documentElement.classList.toggle('dark')
```
观察颜色是否正确切换（纸张→暗色背景，墨水→浅色文字）

## 🎨 视觉检查清单

### ✅ 应该看到的效果
- [ ] 标题使用手写字体（英文部分）
- [ ] 中文使用系统字体（清晰可读）
- [ ] 按钮有手绘边框和轻微旋转
- [ ] 进度条有虚线边框和斜纹填充
- [ ] 徽章有旋转和阴影效果
- [ ] 卡片有手绘边框和不规则旋转
- [ ] 分割线有不完美的手绘感
- [ ] emoji 可以交互（悬停放大旋转）

### ❌ 不应该出现的问题
- [ ] 字体加载失败（显示为系统字体）
- [ ] 中文显示为手写字体（应该是系统字体）
- [ ] 布局错乱或重叠
- [ ] 动画卡顿
- [ ] 暗色模式下颜色不可读

## 📸 对比测试

### 切换分支对比

**查看原版 UI**:
```bash
git checkout master
npm run build
# 重新加载扩展
```

**查看手绘 UI**:
```bash
git checkout experiment/sketchy-ui
npm run build
# 重新加载扩展
```

### 对比要点
1. **视觉温度**: 手绘版应该更温暖、亲和
2. **可读性**: 中文内容应该同样清晰
3. **性能**: 加载速度应该基本一致
4. **交互**: 手绘版有更多微交互细节

## 🐛 已知限制

### 字体加载
- **首次加载**: 可能看到短暂的字体闪烁（系统字体→手写字体）
- **离线环境**: 如果无法访问 Google Fonts，会降级到系统字体
- **解决方案**: 正常，`display=swap` 的预期行为

### 浏览器兼容性
- **Chrome/Edge**: 完全支持 ✅
- **Firefox**: 需要测试（应该支持）
- **Safari**: 需要测试（部分 CSS 效果可能不同）

## 💡 定制实验

### 调整手绘强度
编辑 `src/styles/sketchy.css`:

```css
/* 更明显的手绘效果 */
.sketchy-button {
  transform: rotate(-2deg);  /* 从 -0.5deg 增加到 -2deg */
  border: 3px solid;         /* 从 2px 增加到 3px */
}

/* 更柔和的手绘效果 */
.sketchy-button {
  transform: rotate(-0.2deg); /* 从 -0.5deg 减少到 -0.2deg */
  border: 1px solid;          /* 从 2px 减少到 1px */
}
```

### 切换字体
编辑 `src/styles/sketchy.css`:

```css
/* 使用 Indie Flower 代替 Caveat */
:root {
  --sketchy-font-en: 'Indie Flower', cursive;
}

/* 或使用其他 Google Fonts 手写字体 */
@import url('https://fonts.googleapis.com/css2?family=Patrick+Hand&display=swap');
:root {
  --sketchy-font-en: 'Patrick Hand', cursive;
}
```

### 禁用某个效果
移除对应的 class:

```tsx
// 移除旋转效果
<div className="sketchy-card"> → <div className="sketchy-card" style={{ transform: 'none' }}>

// 移除纸张纹理
<div className="sketchy-container sketchy-paper-texture"> → <div className="sketchy-container">
```

## 📊 性能测试

### 加载时间对比
1. 打开 Chrome DevTools (F12)
2. 切换到 Network 面板
3. 刷新扩展弹窗
4. 查看字体文件加载时间：
   - Caveat (4 字重): ~50KB, <100ms
   - Indie Flower: ~20KB, <50ms

### 渲染性能
1. 打开 DevTools → Performance
2. 点击 Record
3. 与弹窗交互（悬停、点击）
4. 停止录制
5. 检查 FPS 是否保持 60fps

## 🎯 反馈收集

测试后请反馈：

1. **视觉效果** (1-5分):
   - 手绘感是否自然？
   - 是否过于花哨或过于朴素？
   - 颜色搭配是否舒适？

2. **可用性** (1-5分):
   - 文字是否清晰可读？
   - 交互是否流畅？
   - 是否容易找到功能？

3. **性能** (1-5分):
   - 加载速度是否可接受？
   - 动画是否流畅？
   - 是否出现卡顿？

4. **建议**:
   - 哪些元素需要调整？
   - 是否应该应用到其他页面？
   - 是否应该作为可选主题？

---

**测试分支**: `experiment/sketchy-ui`  
**对比分支**: `master`  
**构建命令**: `npm run build`  
**文档**: `docs/SKETCHY_UI.md`
