import { getLearningProgressRatio } from '@/constants/progress'

/**
 * IconComposer - 扩展图标组合引擎
 * 
 * 职责:
 * - 预加载 PNG 图片组件(6个文件)
 * - 按状态智能叠加图片
 * - 应用 Canvas 特效(灰度滤镜、透明度、垂直遮罩)
 * 
 * PNG 组件:
 * - base-static.png: 橙色背景 + 白色圆点 + 3条灰白波纹
 * - wave-1-lit.png: 第1条波纹点亮(透明叠加层)
 * - wave-2-lit.png: 第2条波纹点亮(透明叠加层)
 * - wave-3-lit.png: 第3条波纹点亮(透明叠加层)
 * - dot-pulse.png: 圆点高亮(灰色,用于呼吸动画)
 * - error-badge.png: 红色错误徽章(右上角)
 * 
 * 波纹使用逻辑:
 * - RSS 发现动画: 0→1→2→3 波纹循环（6秒临时）
 * - 后台抓取动画: 1→2→3→2→1 双向流动（持续循环）
 * - 推荐状态: 仅显示右上角数字徽章（不使用波纹）
 * 
 * Phase 5.2: 图标系统重新设计
 */

/**
 * 图标状态定义
 */
export interface IconState {
  /** 状态类型 */
  type: 'static' | 'learning' | 'recommend' | 'fetching' | 'discover' | 'error' | 'paused'
  
  /** 学习进度(0-100页) */
  learningProgress?: number
  
  /** 推荐条目数(1-3) */
  recommendCount?: number
  
  /** RSS 发现动画帧(0-2,循环3次) */
  discoverFrame?: number
  
  /** 后台抓取呼吸时间戳 */
  fetchingTimestamp?: number
  
  /** 是否有错误 */
  hasError?: boolean
}

/**
 * 图标组合引擎
 */
export class IconComposer {
  private canvas: OffscreenCanvas
  private ctx: OffscreenCanvasRenderingContext2D
  
  // 基础背景
  private baseImage: ImageBitmap | null = null
  
  // 透明叠加层
  private overlayImages: {
    wave1: ImageBitmap | null
    wave2: ImageBitmap | null
    wave3: ImageBitmap | null
    learningMask: ImageBitmap | null  // 学习进度圆角遮罩
  } = {
    wave1: null,
    wave2: null,
    wave3: null,
    learningMask: null
  }
  
  /** 是否已预加载 */
  private loaded = false
  
  constructor(size: number = 128) {
    this.canvas = new OffscreenCanvas(size, size)
    // 设置 willReadFrequently 优化频繁的 getImageData 调用
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
  }
  
  /**
   * 预加载所有 PNG 图片
   * @param force 强制重新加载(用于开发调试)
   */
  async preload(force: boolean = false): Promise<void> {
    if (this.loaded && !force) return
    
    // 如果强制重新加载,先释放旧资源
    if (force && this.loaded) {
      this.dispose()
      this.loaded = false
    }
    
    try {
      const basePath = chrome.runtime.getURL('assets/icons/128')
      
      // 并行加载所有图片(添加时间戳防止缓存)
      const timestamp = force ? `?t=${Date.now()}` : ''
      const [base, wave1, wave2, wave3, learningMask] = await Promise.all([
        this.loadImage(`${basePath}/base-static.png${timestamp}`),
        this.loadImage(`${basePath}/overlays/wave-1-lit.png${timestamp}`),
        this.loadImage(`${basePath}/overlays/wave-2-lit.png${timestamp}`),
        this.loadImage(`${basePath}/overlays/wave-3-lit.png${timestamp}`),
        this.loadImage(`${basePath}/overlays/learning-mask.png${timestamp}`)
      ])
      
      
      this.baseImage = base
      this.overlayImages.wave1 = wave1
      this.overlayImages.wave2 = wave2
      this.overlayImages.wave3 = wave3
      this.overlayImages.learningMask = learningMask
      
      this.loaded = true
    } catch (error) {
      console.error('[IconComposer] 图片预加载失败:', error)
      throw error
    }
  }
  
  /**
   * 加载单个图片并转换为 ImageBitmap
   */
  private async loadImage(url: string): Promise<ImageBitmap> {
    const response = await fetch(url)
    const blob = await response.blob()
    return await createImageBitmap(blob)
  }
  
  /**
   * 组合图标(主入口)
   */
  compose(state: IconState): ImageData {
    if (!this.loaded) {
      throw new Error('[IconComposer] 请先调用 preload() 加载图片')
    }
    
    
    // 清空画布
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    
    // 1. 绘制基础背景
    
    if (this.baseImage) {
      // 图标已预先缩放到32×32,直接绘制无需缩放参数
      this.ctx.drawImage(this.baseImage, 0, 0)
      
      // 验证绘制结果
      const testData = this.ctx.getImageData(0, 0, 1, 1)
    }
    
    
    // 2. 绘制推荐数字徽章（右上角）
    // 注意：推荐状态不再使用波纹，波纹专门用于表示后台活动
    if (state.type === 'recommend' && state.recommendCount) {
      this.drawRecommendBadge(state.recommendCount)
    }
    
    // 3. 叠加 RSS 发现动画波纹(仅发现状态)
    if (state.type === 'discover' && state.discoverFrame !== undefined) {
      this.drawDiscoverWaves(state.discoverFrame)
    }
    
    // 4. 叠加后台抓取呼吸效果(仅后台抓取状态)
    if (state.type === 'fetching' && state.fetchingTimestamp) {
      this.drawFetchingPulse(state.fetchingTimestamp)
    }
    
    // 5. 应用暂停灰度滤镜(仅暂停状态)
    if (state.type === 'paused') {
      this.applyGrayscaleFilter()
    }
    
    // 6. 绘制学习进度垂直遮罩(学习状态)
    if (state.type === 'learning' && state.learningProgress !== undefined) {
      this.drawLearningMask(state.learningProgress)
    }
    
    // 7. 叠加错误状态(红色背景闪动)
    if (state.hasError) {
      // 整个图标背景闪动红色
      const now = Date.now()
      const elapsed = now % 1000  // 1秒周期
      const opacity = elapsed < 500 ? 0.6 : 0.2  // 前半秒亮,后半秒暗
      
      // 保存当前状态
      this.ctx.save()
      
      // 红色叠加到整个图标
      this.ctx.globalAlpha = opacity
      this.ctx.globalCompositeOperation = 'source-atop'
      this.ctx.fillStyle = '#ff0000'  // 红色
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
      
      // 恢复状态
      this.ctx.restore()
      
    }
    
    // 返回 ImageData
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)
    
    // 调试: 检查 ImageData 的前几个像素
    
    return imageData
  }
  
  /**
   * 绘制推荐波纹(1-3条)
   */
  private drawRecommendWaves(count: number): void {
    // 图标已预先缩放到32×32,直接绘制
    if (count >= 1 && this.overlayImages.wave1) {
      this.ctx.drawImage(this.overlayImages.wave1, 0, 0)
    }
    if (count >= 2 && this.overlayImages.wave2) {
      this.ctx.drawImage(this.overlayImages.wave2, 0, 0)
    }
    if (count >= 3 && this.overlayImages.wave3) {
      this.ctx.drawImage(this.overlayImages.wave3, 0, 0)
    }
  }
  
  /**
   * 绘制推荐数字徽章（右上角）
   * 
   * 样式：
   * - 背景：黑色圆形 (#000000)
   * - 文字：白色，加粗
   * - 位置：右上角，留 2px 边距
   * - 大小：自适应数字宽度，直径 42%
   */
  private drawRecommendBadge(count: number): void {
    const size = this.canvas.width  // 128px
    const badgeSize = size * 0.42    // 徽章直径 53.76px (增大到 42%)
    const padding = size * 0.02      // 边距 2.56px (减少边距，向右上偏移)
    const centerX = size - padding - badgeSize / 2
    const centerY = padding + badgeSize / 2  // 右上角：top = padding + radius
    
    // 保存当前状态
    this.ctx.save()
    
    // 绘制圆形背景（黑色，完全不透明）
    this.ctx.fillStyle = '#000000'  // 黑色背景，最显眼
    this.ctx.beginPath()
    this.ctx.arc(centerX, centerY, badgeSize / 2, 0, Math.PI * 2)
    this.ctx.fill()
    
    // 绘制白色描边（增强边界）
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'  // 白色描边
    this.ctx.lineWidth = size * 0.02  // 2.56px 更粗的描边
    this.ctx.beginPath()
    this.ctx.arc(centerX, centerY, badgeSize / 2, 0, Math.PI * 2)
    this.ctx.stroke()
    
    // 绘制数字文本（白色）
    const fontSize = badgeSize * 0.65  // 29.12px
    this.ctx.fillStyle = '#ffffff'  // 白色文字，最清晰
    this.ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    this.ctx.fillText(count.toString(), centerX, centerY)
    
    // 恢复状态
    this.ctx.restore()
  }
  
  /**
   * 绘制 RSS 发现动画波纹
   * 动画: 0帧(无波纹) → 1帧(1条) → 2帧(2条) → 3帧(3条)
   */
  private drawDiscoverWaves(frame: number): void {
    const count = Math.min(frame, 3)  // 0→0, 1→1, 2→2, 3→3
    this.drawRecommendWaves(count)
  }
  
  /**
   * 绘制后台抓取动画效果
   * 方案：双向流动的波纹效果
   * - 0.8秒周期：1→2→3→2→1（来回流动）
   * - 高对比度：0.3-1.0 透明度
   * - 视觉效果：类似雷达扫描或脉冲波扩散
   * - 与 RSS 发现动画（单向 0→1→2→3）区分明显
   */
  private drawFetchingPulse(timestamp: number): void {
    if (!this.overlayImages.wave1 || !this.overlayImages.wave2 || !this.overlayImages.wave3) return
    
    const now = Date.now()
    const elapsed = now - timestamp
    
    // 0.8秒完成一个来回（比 RSS 发现的 0.5秒/帧 更快）
    const cycle = (elapsed % 800) / 800  // 0.0 - 1.0
    
    // 双向流动：0 → 1 → 2 → 1 → 0
    // 将周期分成 4 段：0-0.25(1亮), 0.25-0.5(2亮), 0.5-0.75(3亮), 0.75-1.0(2亮)
    let stage: number
    let stageProgress: number
    
    if (cycle < 0.25) {
      stage = 0  // 第1条
      stageProgress = cycle / 0.25
    } else if (cycle < 0.5) {
      stage = 1  // 第2条
      stageProgress = (cycle - 0.25) / 0.25
    } else if (cycle < 0.75) {
      stage = 2  // 第3条
      stageProgress = (cycle - 0.5) / 0.25
    } else {
      stage = 1  // 第2条（返回）
      stageProgress = (cycle - 0.75) / 0.25
    }
    
    // 高对比度的淡入淡出（0.3-1.0）
    const opacity = 0.3 + 0.7 * Math.sin(stageProgress * Math.PI)
    
    this.ctx.globalAlpha = opacity
    
    switch(stage) {
      case 0:  // 第1条波纹（内圈）
        this.ctx.drawImage(this.overlayImages.wave1, 0, 0)
        break
      case 1:  // 第2条波纹（中圈）
        this.ctx.drawImage(this.overlayImages.wave2, 0, 0)
        break
      case 2:  // 第3条波纹（外圈）
        this.ctx.drawImage(this.overlayImages.wave3, 0, 0)
        break
    }
    
    this.ctx.globalAlpha = 1.0
  }
  
  /**
   * 绘制学习进度垂直遮罩
  * 进度: 0页(全遮蔽) → 100页(完全清晰)
   * 方向: 从底部向上逐渐揭开
   * 
   * 使用圆角遮罩 PNG(32×32),裁剪上半部分来实现进度
   */
  private drawLearningMask(pages: number): void {
  const progress = getLearningProgressRatio(pages)
    const maskHeight = this.canvas.height * (1 - progress)  // 32px → 0px
    
    if (maskHeight <= 0) return  // 学习完成,无需遮罩
    
    if (!this.overlayImages.learningMask) {
      console.warn('[IconComposer] 学习遮罩图片未加载,使用矩形遮罩')
      // 降级到矩形遮罩
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
      this.ctx.fillRect(0, 0, this.canvas.width, maskHeight)
      return
    }
    
    // 使用圆角遮罩 PNG (已预先缩放到32×32)
    // 从遮罩图片的顶部裁剪,只绘制上半部分
    const sourceHeightToDraw = this.canvas.height * (1 - progress)  // 裁剪高度
    
    // 绘制遮罩的上半部分(从顶部开始,无需缩放)
    this.ctx.drawImage(
      this.overlayImages.learningMask,
      0, 0,                              // 源图起点(左上角)
      this.canvas.width, sourceHeightToDraw,  // 源图裁剪尺寸
      0, 0,                              // 目标画布起点
      this.canvas.width, maskHeight      // 目标画布尺寸
    )
  }
  
  /**
   * 应用灰度滤镜(暂停状态)
   */
  private applyGrayscaleFilter(): void {
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)
    const data = imageData.data
    
    // 灰度转换: Gray = 0.299*R + 0.587*G + 0.114*B
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
      data[i] = data[i + 1] = data[i + 2] = gray
    }
    
    this.ctx.putImageData(imageData, 0, 0)
  }
  
  /**
   * 清理资源
   */
  dispose(): void {
    this.baseImage?.close()
    this.overlayImages.wave1?.close()
    this.overlayImages.wave2?.close()
    this.overlayImages.wave3?.close()
    this.overlayImages.learningMask?.close()
    
    this.loaded = false
  }
}
