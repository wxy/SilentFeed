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
 * 导出单例
 */
export const logger = new Logger()
