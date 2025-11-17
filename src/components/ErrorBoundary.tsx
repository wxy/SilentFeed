/**
 * React 错误边界组件
 * 
 * 功能：
 * - 捕获子组件树中的 JavaScript 错误
 * - 显示降级 UI 而不是白屏
 * - 记录错误信息用于调试
 * - 提供重试机制
 */

import React, { Component } from 'react'
import type { ReactNode } from 'react'
import { logger } from '../utils/logger'

// 创建带标签的 logger
const errorLogger = logger.withTag('ErrorBoundary')

/**
 * ErrorBoundary Props
 */
interface ErrorBoundaryProps {
  /** 子组件 */
  children: ReactNode
  /** 自定义降级 UI（可选） */
  fallback?: (error: Error, retry: () => void) => ReactNode
  /** 错误回调（可选） */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

/**
 * ErrorBoundary State
 */
interface ErrorBoundaryState {
  /** 是否发生错误 */
  hasError: boolean
  /** 错误对象 */
  error: Error | null
  /** 错误信息 */
  errorInfo: React.ErrorInfo | null
}

/**
 * React 错误边界组件
 * 
 * 用法：
 * ```tsx
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 * 
 * 自定义降级 UI：
 * ```tsx
 * <ErrorBoundary fallback={(error, retry) => (
 *   <div>
 *     <h2>出错了: {error.message}</h2>
 *     <button onClick={retry}>重试</button>
 *   </div>
 * )}>
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    }
  }

  /**
   * 捕获错误时更新 state
   */
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error
    }
  }

  /**
   * 错误被捕获后的处理
   */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // 记录错误日志
    errorLogger.error('React 组件错误', {
      error: error.message,
      componentStack: errorInfo.componentStack
    })

    // 更新 state
    this.setState({
      errorInfo
    })

    // 调用外部错误回调
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }
  }

  /**
   * 重试：重置错误状态
   */
  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    })
  }

  /**
   * 默认降级 UI
   */
  renderDefaultFallback(): ReactNode {
    const { error } = this.state

    return (
      <div
        style={{
          padding: '20px',
          margin: '20px',
          border: '2px solid #ff6b6b',
          borderRadius: '8px',
          backgroundColor: '#ffe0e0',
          color: '#333'
        }}
      >
        <h2 style={{ margin: '0 0 10px 0', color: '#d63031' }}>
          ⚠️ 出错了
        </h2>
        <p style={{ margin: '0 0 10px 0' }}>
          应用遇到了一个错误，但不用担心，您的数据是安全的。
        </p>
        {error && process.env.NODE_ENV === 'development' && (
          <details style={{ marginTop: '10px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
              错误详情
            </summary>
            <pre
              style={{
                marginTop: '10px',
                padding: '10px',
                backgroundColor: '#f5f5f5',
                borderRadius: '4px',
                overflow: 'auto',
                fontSize: '12px'
              }}
            >
              {error.message}
              {'\n\n'}
              {error.stack}
            </pre>
          </details>
        )}
        <button
          onClick={this.handleRetry}
          style={{
            marginTop: '15px',
            padding: '8px 16px',
            backgroundColor: '#0984e3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          🔄 重试
        </button>
      </div>
    )
  }

  render(): ReactNode {
    const { hasError, error } = this.state
    const { children, fallback } = this.props

    if (hasError && error) {
      // 使用自定义降级 UI 或默认 UI
      if (fallback) {
        return fallback(error, this.handleRetry)
      }
      return this.renderDefaultFallback()
    }

    return children
  }
}
