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

  constructor() {
    this.isDev = isDevelopment()
  }

  /**
   * 调试日志（仅开发环境）
   */
  debug(message: string, data?: any): void {
    if (this.isDev) {
      console.log(message, data || '')
    }
  }

  /**
   * 信息日志（仅开发环境）
   */
  info(message: string, data?: any): void {
    if (this.isDev) {
      console.log(message, data || '')
    }
  }

  /**
   * 警告日志（总是显示）
   */
  warn(message: string, data?: any): void {
    console.warn(message, data || '')
  }

  /**
   * 错误日志（总是显示）
   */
  error(message: string, error?: any): void {
    console.error(message, error || '')
  }
}

/**
 * 导出单例
 */
export const logger = new Logger()
