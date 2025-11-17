/**
 * ErrorBoundary 组件测试
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from './ErrorBoundary'

// 会抛出错误的测试组件
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('测试错误')
  }
  return <div>正常渲染</div>
}

describe('ErrorBoundary', () => {
  // 抑制 console.error，因为 React 会在错误边界捕获错误时输出
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  describe('正常渲染', () => {
    test('应该正常渲染子组件', () => {
      render(
        <ErrorBoundary>
          <div>测试内容</div>
        </ErrorBoundary>
      )

      expect(screen.getByText('测试内容')).toBeInTheDocument()
    })

    test('应该在子组件不抛错时正常显示', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      )

      expect(screen.getByText('正常渲染')).toBeInTheDocument()
    })
  })

  describe('错误捕获', () => {
    test('应该捕获子组件的错误', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      // 应该显示降级 UI
      expect(screen.getByText(/出错了/i)).toBeInTheDocument()
    })

    test('应该显示默认降级 UI', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      expect(screen.getByText(/出错了/i)).toBeInTheDocument()
      expect(screen.getByText(/应用遇到了一个错误/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /重试/i })).toBeInTheDocument()
    })

    test('应该在开发环境显示错误详情', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      // 应该有错误详情折叠区域
      expect(screen.getByText('错误详情')).toBeInTheDocument()

      process.env.NODE_ENV = originalEnv
    })
  })

  describe('自定义降级 UI', () => {
    test('应该使用自定义降级 UI', () => {
      const customFallback = (error: Error) => (
        <div>自定义错误: {error.message}</div>
      )

      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      expect(screen.getByText(/自定义错误: 测试错误/i)).toBeInTheDocument()
    })

    test('自定义降级 UI 应该接收重试函数', () => {
      const customFallback = (_error: Error, retry: () => void) => (
        <button onClick={retry}>自定义重试</button>
      )

      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      expect(screen.getByRole('button', { name: '自定义重试' })).toBeInTheDocument()
    })
  })

  describe('重试功能', () => {
    test('点击重试应该重新渲染子组件', async () => {
      const user = userEvent.setup()
      let shouldThrow = true

      const DynamicThrowError = () => {
        if (shouldThrow) {
          throw new Error('测试错误')
        }
        return <div>重试成功</div>
      }

      const { rerender } = render(
        <ErrorBoundary>
          <DynamicThrowError />
        </ErrorBoundary>
      )

      // 初始状态：显示错误
      expect(screen.getByText(/出错了/i)).toBeInTheDocument()

      // 修复错误条件
      shouldThrow = false

      // 点击重试
      const retryButton = screen.getByRole('button', { name: /重试/i })
      await user.click(retryButton)

      // 应该重新渲染并显示正常内容
      // 注意：需要 rerender 来触发重新渲染
      rerender(
        <ErrorBoundary>
          <DynamicThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByText('重试成功')).toBeInTheDocument()
    })
  })

  describe('错误回调', () => {
    test('应该调用 onError 回调', () => {
      const onError = vi.fn()

      render(
        <ErrorBoundary onError={onError}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      // onError 应该被调用
      expect(onError).toHaveBeenCalled()
      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          componentStack: expect.any(String)
        })
      )
    })

    test('onError 应该接收正确的错误对象', () => {
      const onError = vi.fn()

      render(
        <ErrorBoundary onError={onError}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      const [error] = onError.mock.calls[0]
      expect(error.message).toBe('测试错误')
    })
  })

  describe('边界情况', () => {
    test('应该处理没有子组件的情况', () => {
      render(<ErrorBoundary>{null}</ErrorBoundary>)
      // 不应该崩溃
      expect(true).toBe(true)
    })

    test('应该处理多个子组件', () => {
      render(
        <ErrorBoundary>
          <div>子组件1</div>
          <div>子组件2</div>
          <div>子组件3</div>
        </ErrorBoundary>
      )

      expect(screen.getByText('子组件1')).toBeInTheDocument()
      expect(screen.getByText('子组件2')).toBeInTheDocument()
      expect(screen.getByText('子组件3')).toBeInTheDocument()
    })

    test('应该只捕获子组件树的错误', () => {
      render(
        <div>
          <div>外部内容</div>
          <ErrorBoundary>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        </div>
      )

      // 外部内容应该仍然显示
      expect(screen.getByText('外部内容')).toBeInTheDocument()
      // ErrorBoundary 内部显示降级 UI
      expect(screen.getByText(/出错了/i)).toBeInTheDocument()
    })
  })
})
