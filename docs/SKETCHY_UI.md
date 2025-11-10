# 🎨 Sketchy UI - 手绘风格设计系统

## 概述

Sketchy UI 是一个轻量级的手绘风格设计系统，为 FeedAIMuter 提供更温暖、更有亲和力的视觉体验。

## 设计理念

### ✨ 核心特点
- **手绘感**: 不完美的线条、轻微的旋转，模拟手绘笔触
- **温暖色调**: 纸张般的背景色，墨水般的文字色
- **克制使用**: 保持可读性，手绘效果用于点缀而非喧宾夺主
- **性能优先**: 纯 CSS 实现，无 JavaScript 依赖

### 🎯 设计原则
1. **可读性第一**: 中文使用系统字体，确保清晰易读
2. **性能优化**: 英文手写字体来自 Google Fonts CDN，按需加载
3. **响应式**: 支持明暗模式，适配不同环境
4. **渐进增强**: 在不支持的浏览器中优雅降级

## 字体方案

### 英文手写字体
- **主字体**: [Caveat](https://fonts.google.com/specimen/Caveat) (400, 500, 600, 700)
  - Google Fonts 免费授权
  - 自然、流畅的手写风格
  - 文件大小: ~50KB (4 字重)

- **备用字体**: [Indie Flower](https://fonts.google.com/specimen/Indie+Flower)
  - Google Fonts 免费授权
  - 更轻松、活泼的笔迹
  - 文件大小: ~20KB

### 中文字体
保持系统默认字体，确保可读性和性能：
```css
font-family: var(--sketchy-font-en), -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif
```

**为什么不使用中文手写字体？**
- 中文手写字体文件通常 10-20MB，严重影响加载速度
- 在浏览器扩展中，大字体文件会拖慢启动时间
- 系统字体已经足够清晰，手绘效果主要靠 UI 元素体现

## 组件库

### 📦 可用组件

#### 1. 容器 (Container)
```tsx
<div className="sketchy-container sketchy-paper-texture">
  {/* 内容 */}
</div>
```
- `sketchy-container`: 基础容器，带纸张背景色
- `sketchy-paper-texture`: 可选的纸张纹理效果

#### 2. 标题 (Title)
```tsx
<h1 className="sketchy-title">Feed AI Muter</h1>
```
- 手写字体（仅英文）
- 下划线装饰效果
- 支持明暗模式

#### 3. 文本 (Text)
```tsx
<p className="sketchy-text">这是一段描述文字</p>
```
- 混合字体（英文手写 + 中文系统）
- 舒适的行高

#### 4. 按钮 (Button)
```tsx
<button className="sketchy-button">
  ⚙️ 设置
</button>
```
- 手绘边框效果
- 悬停时轻微抬起
- 点击时轻微下沉

#### 5. 卡片 (Card)
```tsx
<div className="sketchy-card">
  {/* 卡片内容 */}
</div>
```
- 手绘边框和阴影
- 轻微旋转（奇偶交替方向）

#### 6. 进度条 (Progress)
```tsx
<div className="sketchy-progress">
  <div className="sketchy-progress-bar" style={{ width: '60%' }} />
</div>
```
- 手绘边框
- 虚线分隔
- 斜纹填充

#### 7. 徽章 (Badge)
```tsx
<span className="sketchy-badge">Explorer</span>
```
- 数字或短文本标签
- 旋转效果
- 强调色背景

#### 8. 分割线 (Divider)
```tsx
<div className="sketchy-divider"></div>
```
- 不完美的手绘线条
- 双层效果

#### 9. 列表项 (List Item)
```tsx
<div className="sketchy-list-item">
  列表内容
</div>
```
- 箭头前缀
- 手绘风格标记

#### 10. Emoji 增强
```tsx
<span className="sketchy-emoji">🌱</span>
```
- 轻微旋转
- 悬停时放大和反向旋转

## 颜色系统

### 浅色模式
```css
--sketchy-ink: #2c3e50           /* 墨水黑 */
--sketchy-ink-light: #34495e     /* 浅墨水 */
--sketchy-paper: #fffef9         /* 纸张白 */
--sketchy-paper-dark: #f8f7f2    /* 深纸张 */
--sketchy-accent: #e74c3c        /* 强调红 */
--sketchy-accent-light: #ff6b6b  /* 浅强调红 */
```

### 暗色模式
```css
--sketchy-ink-dark: #ecf0f1           /* 浅墨水 */
--sketchy-paper-night: #2c3e50        /* 夜间纸张 */
--sketchy-paper-dark-night: #34495e   /* 深夜间纸张 */
```

## 使用指南

### 快速开始

1. **导入样式**:
```tsx
import "@/styles/sketchy.css"
```

2. **应用到组件**:
```tsx
function MyComponent() {
  return (
    <div className="sketchy-container">
      <h1 className="sketchy-title">标题</h1>
      <p className="sketchy-text">描述文字</p>
      <button className="sketchy-button">按钮</button>
    </div>
  )
}
```

### 最佳实践

#### ✅ 推荐
- 在标题和强调元素上使用手写字体
- 保持中文内容使用系统字体
- 适度使用旋转效果（不超过 ±3度）
- 组合多个组件类创造丰富效果

#### ❌ 避免
- 不要在长段落中使用手写字体（难以阅读）
- 不要过度使用旋转（影响排版）
- 不要在表单输入时使用过多装饰（影响用户操作）

## 性能考虑

### 字体加载策略
```css
@import url('...&display=swap');
```
- 使用 `display=swap` 避免文字闪烁
- 浏览器会先显示系统字体，然后替换为手写字体

### CSS 优化
- 所有效果通过 CSS 实现，无 JavaScript 运行时开销
- 使用 `transform` 而非 `position` 实现动画（GPU 加速）
- 合理使用 `transition` 而非 `animation`（按需触发）

## 已应用页面

- ✅ **Popup 主界面** (`src/popup.tsx`)
  - 头部标题和分割线
  - 设置按钮
  - 加载状态 emoji

- ✅ **冷启动视图** (`src/components/ColdStartView.tsx`)
  - 成长阶段图标
  - 欢迎标题
  - 进度条
  - 提示卡片

## 待扩展

可以应用手绘风格的其他区域：

- [ ] Options 设置页面
- [ ] RecommendationView 推荐列表
- [ ] 通知弹窗
- [ ] 错误/成功提示
- [ ] New Tab 页面

## 授权信息

### 字体授权
- **Caveat**: SIL Open Font License 1.1
- **Indie Flower**: SIL Open Font License 1.1
- 可自由用于商业和非商业项目

### CSS 代码
- 项目自定义代码，遵循项目许可证

## 调试和定制

### 调整手绘程度
修改 `sketchy.css` 中的关键参数：

```css
/* 旋转角度 (0-3deg 建议) */
transform: rotate(-0.5deg);

/* 边框粗细 (1-3px 建议) */
border: 2px solid;

/* 阴影强度 */
box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.1);
```

### 禁用手绘效果
只需移除对应的 class 即可：
```tsx
// 从这个
<button className="sketchy-button">按钮</button>
// 改为这个
<button className="regular-button">按钮</button>
```

## 反馈和改进

这是一个**实验性功能**，在 `experiment/sketchy-ui` 分支中测试。

**欢迎反馈**:
- 🎨 视觉效果是否自然？
- 📱 是否影响可读性？
- ⚡ 性能是否可接受？
- 🌍 在不同设备/浏览器上表现如何？

---

*最后更新: 2025-01-10*  
*版本: v0.1.0-experimental*
