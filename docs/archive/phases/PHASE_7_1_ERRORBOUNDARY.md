# Phase 7.1 - ErrorBoundary 错误边界组件

## 功能目标

创建 React ErrorBoundary 组件，防止组件错误导致整个应用白屏崩溃。

## 实现内容

### 1. ErrorBoundary 组件 (`src/components/ErrorBoundary.tsx`)

**核心特性**:

- **错误捕获**: 使用 `getDerivedStateFromError` 捕获子组件树的错误
- **错误日志**: 使用 `componentDidCatch` 记录错误详情到 logger 系统
- **降级 UI**: 显示友好的错误提示界面，避免白屏
- **重试机制**: 提供重试按钮，允许用户尝试恢复
- **开发模式**: 在开发环境显示详细错误堆栈信息
- **自定义降级**: 支持通过 `fallback` prop 自定义错误 UI

**Props 接口**:

```typescript
interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: (error: Error, retry: () => void) => ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}
```

**使用示例**:

```tsx
// 基础用法 - 使用默认降级 UI
<ErrorBoundary>
  <YourComponent />
</ErrorBoundary>

// 自定义降级 UI
<ErrorBoundary fallback={(error, retry) => (
  <div>
    <p>错误: {error.message}</p>
    <button onClick={retry}>重试</button>
  </div>
)}>
  <YourComponent />
</ErrorBoundary>

// 监听错误事件
<ErrorBoundary onError={(error, errorInfo) => {
  // 自定义错误处理，如上报到错误监控服务
  console.error('Component error:', error, errorInfo)
}}>
  <YourComponent />
</ErrorBoundary>
```

### 2. 测试覆盖 (`src/components/ErrorBoundary.test.tsx`)

**测试用例** (13 个测试):

1. **正常渲染** (2 个测试)
   - 正常渲染子组件
   - 不抛错时正常显示

2. **错误捕获** (3 个测试)
   - 捕获子组件的错误
   - 显示默认降级 UI
   - 开发环境显示错误详情

3. **自定义降级 UI** (2 个测试)
   - 使用自定义降级 UI
   - 传递重试函数

4. **重试功能** (1 个测试)
   - 点击重试后重新渲染子组件

5. **错误回调** (2 个测试)
   - 调用 onError 回调
   - 传递正确的错误对象

6. **边界情况** (3 个测试)
   - 处理无子组件
   - 处理多个子组件
   - 只捕获子组件树的错误

**测试结果**: ✅ 13/13 测试通过

### 3. 应用集成

已集成到主要入口文件:

- **popup.tsx**: 包裹整个弹窗应用
- **options.tsx**: 包裹整个设置页面

**集成方式**:

```tsx
// popup.tsx
import { ErrorBoundary } from "@/components/ErrorBoundary"

function IndexPopup() {
  return (
    <ErrorBoundary>
      <div className={containerClass}>
        {/* 应用内容 */}
      </div>
    </ErrorBoundary>
  )
}

// options.tsx  
import { ErrorBoundary } from "@/components/ErrorBoundary"

function IndexOptions() {
  return (
    <ErrorBoundary>
      <div className={containerClass}>
        {/* 应用内容 */}
      </div>
    </ErrorBoundary>
  )
}
```

## 技术细节

### 1. 类组件实现

ErrorBoundary **必须**使用类组件，因为 React Hooks 不支持错误边界：

```typescript
class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  // getDerivedStateFromError: 捕获错误，更新状态
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  // componentDidCatch: 记录错误详情
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    errorLogger.error('组件错误:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }
}
```

### 2. 类型安全

使用 TypeScript 的 `verbatimModuleSyntax` 特性，分离类型导入：

```typescript
import React, { Component } from 'react'
import type { ReactNode } from 'react'  // 类型单独导入
```

### 3. 日志集成

使用统一 logger 系统记录错误：

```typescript
import { logger } from '@/utils/logger'
const errorLogger = logger.withTag('ErrorBoundary')

componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
  errorLogger.error('组件错误:', error, errorInfo)
}
```

### 4. 环境感知

开发模式显示详细错误信息：

```typescript
{process.env.NODE_ENV === 'development' && (
  <details className="mt-4">
    <summary>错误详情</summary>
    <pre>{error.stack}</pre>
  </details>
)}
```

## 验收标准

✅ **功能完整性**:
- [x] 捕获并显示错误
- [x] 提供重试功能
- [x] 支持自定义降级 UI
- [x] 记录错误日志
- [x] 开发模式显示详情

✅ **测试覆盖**:
- [x] 13/13 测试通过
- [x] 覆盖所有核心功能
- [x] 边界情况测试

✅ **应用集成**:
- [x] 已集成到 popup.tsx
- [x] 已集成到 options.tsx
- [x] 全部 847 测试通过

✅ **代码质量**:
- [x] TypeScript 类型完整
- [x] 符合 Copilot 指南
- [x] 日志系统集成
- [x] 无 ESLint 错误

## 后续优化建议

1. **错误上报**: 集成第三方错误监控服务（如 Sentry）
2. **错误分类**: 根据错误类型显示不同的降级 UI
3. **自动重试**: 某些错误自动重试（如网络错误）
4. **用户反馈**: 添加错误反馈按钮，收集用户遇到的问题
5. **错误统计**: 记录错误频率，用于问题排查

## 使用注意事项

⚠️ **ErrorBoundary 的限制**:

ErrorBoundary **无法捕获**以下错误:
- 事件处理器中的错误（需要使用 try-catch）
- 异步代码（setTimeout、Promise）
- 服务端渲染（SSR）
- ErrorBoundary 自身的错误

**正确处理事件错误**:

```typescript
// ❌ 错误 - ErrorBoundary 无法捕获
<button onClick={() => {
  throw new Error('事件错误')
}}>点击</button>

// ✅ 正确 - 手动捕获事件错误
<button onClick={() => {
  try {
    // 可能出错的代码
  } catch (error) {
    logger.error('事件处理错误:', error)
  }
}}>点击</button>
```

**正确处理异步错误**:

```typescript
// ❌ 错误 - ErrorBoundary 无法捕获
useEffect(() => {
  fetch('/api/data').then(res => res.json())
}, [])

// ✅ 正确 - 手动捕获异步错误
useEffect(() => {
  const fetchData = async () => {
    try {
      const res = await fetch('/api/data')
      const data = await res.json()
    } catch (error) {
      logger.error('数据加载错误:', error)
      // 更新状态显示错误 UI
    }
  }
  fetchData()
}, [])
```

## 时间记录

- **开始时间**: 2025-01-17 14:00
- **完成时间**: 2025-01-17 14:06
- **实际耗时**: 6 分钟
- **预计耗时**: 2 小时

**效率说明**: 由于组件结构简单、测试策略清晰，实际开发远快于预期。

## 参考资料

- [React Error Boundaries 官方文档](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- [TypeScript 类组件类型定义](https://react-typescript-cheatsheet.netlify.app/docs/basic/getting-started/class_components/)
- [项目测试指南](./TESTING.md)
