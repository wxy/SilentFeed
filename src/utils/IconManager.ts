/**
 * IconManager - 扩展图标状态管理器
 * 
 * 职责:
 * - 管理图标状态优先级
 * - 控制动画循环(RSS 发现、圆点呼吸)
 * - 与 chrome.action API 集成
 * - 响应各种事件更新图标
 * 
 * 状态优先级(从高到低):
 * 1. 错误 (hasError: true, 最高优先级)
 * 2. RSS 发现动画 (discover, 3秒临时)
 * 3. 推荐阅读 (recommend, 1-3条)
 * 4. 后台抓取 (fetching, 圆点呼吸)
 * 5. 学习进度 (learning, 垂直遮罩)
 * 6. 暂停 (paused, 灰度)
 * 7. 静态 (static, 默认)
 * 
 * Phase 5.2: 图标系统重新设计
 */

import { IconComposer, type IconState } from './IconComposer'
import { LEARNING_COMPLETE_PAGES } from '@/constants/progress'

/**
 * 图标状态管理器
 */
export class IconManager {
  private composer: IconComposer
  
  // 当前状态
  private currentState: IconState = { type: 'static' }
  
  // 动画控制 (Service Worker 中 setTimeout 返回 number)
  private discoverAnimationTimer: ReturnType<typeof setTimeout> | null = null
  private fetchingAnimationTimer: ReturnType<typeof setTimeout> | null = null
  private errorAnimationTimer: ReturnType<typeof setTimeout> | null = null
  
  // 学习进度
  private learningProgress = 0
  
  // 推荐条目数
  private recommendCount = 0
  
  // 错误状态
  private hasError = false
  
  // 暂停状态
  private isPaused = false
  
  constructor() {
    this.composer = new IconComposer(128)  // 使用128×128以支持高DPI屏幕
  }
  
  /**
   * 初始化(预加载图片)
   * @param force 强制重新加载(用于开发调试,防止缓存)
   */
  async initialize(force: boolean = false): Promise<void> {
    try {
      await this.composer.preload(force)
      
      // 设置初始图标
      this.updateIcon()
    } catch (error) {
      console.error('[IconManager] 初始化失败:', error)
      throw error
    }
  }
  
  /**
   * 更新学习进度
   */
  setLearningProgress(pages: number): void {
    this.learningProgress = Math.max(0, Math.min(pages, LEARNING_COMPLETE_PAGES))
    this.updateIcon()
  }
  
  /**
   * 设置推荐条目数(1-3)
   */
  setRecommendCount(count: number): void {
    this.recommendCount = Math.min(Math.max(count, 0), 3)
    this.updateIcon()
  }
  
  /**
   * 开始 RSS 发现动画
   * 动画: 0帧(无波纹) → 1帧(1条) → 2帧(2条) → 3帧(3条)
   * 每帧 500ms, 循环 3 次, 总时长 6 秒
   */
  startDiscoverAnimation(): void {
    // 停止之前的动画
    this.stopDiscoverAnimation()
    
    let frame = 0  // 从0开始: 0波纹
    let cycle = 0
    const maxCycles = 3
    const frameDuration = 500 // 500ms
    
    const animate = () => {
      // 更新图标
      this.currentState = {
        type: 'discover',
        discoverFrame: frame,
        hasError: this.hasError
      }
      this.updateIcon()
      
      // 下一帧
      frame++
      if (frame > 3) {  // 0,1,2,3 共4帧
        frame = 0
        cycle++
      }
      
      // 循环3次后停止
      if (cycle >= maxCycles) {
        this.stopDiscoverAnimation()
        this.updateIcon()  // 恢复正常状态
        return
      }
      
      // Service Worker 环境使用 self.setTimeout
      const globalObj = typeof window !== 'undefined' ? window : self
      this.discoverAnimationTimer = globalObj.setTimeout(animate, frameDuration) as any
    }
    
    animate()
  }
  
  /**
   * 停止 RSS 发现动画
   */
  stopDiscoverAnimation(): void {
    if (this.discoverAnimationTimer !== null) {
      clearTimeout(this.discoverAnimationTimer)
      this.discoverAnimationTimer = null
      // 重置状态，以便恢复到正常显示逻辑（学习进度/推荐/静态）
      this.currentState = { type: 'static' }
    }
  }
  
  /**
   * 开始后台抓取动画(圆点呼吸)
   */
  startFetchingAnimation(): void {
    // 停止之前的动画
    this.stopFetchingAnimation()
    
    const startTime = Date.now()
    
    const animate = () => {
      // 更新图标
      this.currentState = {
        type: 'fetching',
        fetchingTimestamp: startTime,
        hasError: this.hasError
      }
      this.updateIcon()
      
      // 每100ms更新一次(流畅呼吸效果)
      // Service Worker 环境使用 self.setTimeout
      const globalObj = typeof window !== 'undefined' ? window : self
      this.fetchingAnimationTimer = globalObj.setTimeout(animate, 100) as any
    }
    
    animate()
  }
  
  /**
   * 停止后台抓取动画
   */
  stopFetchingAnimation(): void {
    if (this.fetchingAnimationTimer !== null) {
      clearTimeout(this.fetchingAnimationTimer)
      this.fetchingAnimationTimer = null
      // 重置状态，以便恢复到正常显示逻辑（学习进度/推荐/静态）
      this.currentState = { type: 'static' }
    }
  }
  
  /**
   * 设置错误状态
   */
  setError(hasError: boolean): void {
    this.hasError = hasError
    
    if (hasError) {
      // 启动错误闪动动画
      this.startErrorAnimation()
    } else {
      // 停止错误动画
      this.stopErrorAnimation()
    }
    
    this.updateIcon()
  }
  
  /**
   * 开始错误闪动动画
   */
  private startErrorAnimation(): void {
    this.stopErrorAnimation()
    
    const animate = () => {
      // 每500ms触发一次重绘(配合IconComposer中的闪动逻辑)
      this.updateIcon()
      
      if (this.hasError) {
        const globalObj = typeof window !== 'undefined' ? window : self
        this.errorAnimationTimer = globalObj.setTimeout(animate, 500) as any
      }
    }
    
    animate()
  }
  
  /**
   * 停止错误闪动动画
   */
  private stopErrorAnimation(): void {
    if (this.errorAnimationTimer !== null) {
      clearTimeout(this.errorAnimationTimer)
      this.errorAnimationTimer = null
    }
  }
  
  /**
   * 设置暂停状态
   */
  setPaused(isPaused: boolean): void {
    this.isPaused = isPaused
    this.updateIcon()
  }
  
  /**
   * 暂停(便捷方法)
   */
  pause(): void {
    this.setPaused(true)
  }
  
  /**
   * 恢复(便捷方法)
   */
  resume(): void {
    this.setPaused(false)
  }
  
  /**
   * 清除错误(便捷方法)
   */
  clearError(): void {
    this.setError(false)
  }
  
  /**
   * 更新图标(根据优先级决定显示哪个状态)
   */
  private updateIcon(): void {
    let state: IconState
    
    // 优先级 1: 错误状态(叠加到任何状态上)
    const errorOverlay = this.hasError
    
    // 优先级 2: RSS 发现动画(临时)
    if (this.currentState.type === 'discover') {
      state = {
        type: 'discover',
        discoverFrame: this.currentState.discoverFrame,
        hasError: errorOverlay
      }
    }
    // 优先级 3: 暂停状态
    else if (this.isPaused) {
      state = {
        type: 'paused',
        hasError: errorOverlay
      }
    }
    // 优先级 4: 后台抓取动画
    else if (this.currentState.type === 'fetching') {
      state = {
        type: 'fetching',
        fetchingTimestamp: this.currentState.fetchingTimestamp,
        hasError: errorOverlay
      }
    }
    // 优先级 5: 推荐阅读
    else if (this.recommendCount > 0) {
      state = {
        type: 'recommend',
        recommendCount: this.recommendCount,
        hasError: errorOverlay
      }
    }
    // 优先级 6: 学习进度
    else if (this.learningProgress < LEARNING_COMPLETE_PAGES) {
      state = {
        type: 'learning',
        learningProgress: this.learningProgress,
        hasError: errorOverlay
      }
    }
    // 默认: 静态
    else {
      state = {
        type: 'static',
        hasError: errorOverlay
      }
    }
    
    // 组合图标
    const imageData = this.composer.compose(state)
    
    
    // 更新 Chrome 扩展图标
    // 使用128×128以支持高DPI屏幕(Retina等)
    // Chrome会根据设备像素比自动缩放
    chrome.action.setIcon({ 
      imageData: {
        128: imageData
      }
    })
  }
  
  /**
   * 清理资源
   */
  dispose(): void {
    this.stopDiscoverAnimation()
    this.stopFetchingAnimation()
    this.stopErrorAnimation()
    this.composer.dispose()
  }
}
