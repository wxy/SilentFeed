/**
 * 日志工具
 * 
 * 开发环境: 显示所有日志
 * 生产环境: 只显示错误日志
 */

/**
 * 检测是否为开发环境
 */
function isDevelopment(): boolean {
  // Plasmo 在开发模式下会设置 process.env.NODE_ENV
  return process.env.NODE_ENV === 'development'
}

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

/**
 * 日志工具类
 */
class Logger {
  private isDev: boolean
  private tag: string

  constructor(tag: string = '') {
    this.isDev = isDevelopment()
    this.tag = tag
  }

  /**
   * 格式化日志消息（添加标签前缀）
   */
  private formatMessage(level: string, message: string): string {
    if (this.tag) {
      return `[${this.tag}] ${message}`
    }
    return message
  }

  /**
   * 调试日志（仅开发环境）
   */
  debug(message: string, data?: any): void {
    if (this.isDev) {
      console.log(this.formatMessage('DEBUG', message), data || '')
    }
  }

  /**
   * 信息日志（仅开发环境）
   */
  info(message: string, data?: any): void {
    if (this.isDev) {
      console.log(this.formatMessage('INFO', message), data || '')
    }
  }

  /**
   * 警告日志（总是显示）
   */
  warn(message: string, data?: any): void {
    console.warn(this.formatMessage('WARN', message), data || '')
  }

  /**
   * 错误日志（总是显示）
   */
  error(message: string, error?: any): void {
    console.error(this.formatMessage('ERROR', message), error || '')
  }

  /**
   * 创建带特定标签的 logger 实例
   * 
   * @example
   * const moduleLogger = logger.withTag('ProfileBuilder')
   * moduleLogger.info('开始构建画像')  // 输出: [ProfileBuilder] 开始构建画像
   */
  withTag(tag: string): Logger {
    return new Logger(tag)
  }
}

/**
 * 判断是否为网络相关错误
 * 
 * 网络错误通常是临时性的，不应该作为严重错误处理
 * 包括：网络中断、超时、DNS 解析失败、服务不可用等
 */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false
  
  const errorStr = String(error)
  const message = error instanceof Error ? error.message : errorStr
  
  // 常见网络错误特征
  const networkErrorPatterns = [
    'Failed to fetch',           // Fetch API 网络错误
    'Network request failed',    // React Native 等
    'NetworkError',              // 通用网络错误
    'net::ERR_',                 // Chrome 网络错误
    'ECONNREFUSED',              // 连接被拒绝
    'ENOTFOUND',                 // DNS 解析失败
    'ETIMEDOUT',                 // 超时
    'ECONNRESET',                // 连接重置
    'socket hang up',            // Socket 挂起
    'Request timeout',           // 请求超时
    'Service Unavailable',       // 服务不可用 (503)
    'Gateway Timeout',           // 网关超时 (504)
    'Too Many Requests',         // 请求过多 (429)
  ]
  
  return networkErrorPatterns.some(pattern => 
    message.includes(pattern) || errorStr.includes(pattern)
  )
}

/**
 * 导出单例
 */
export const logger = new Logger()
