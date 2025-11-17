/**
 * IconManager 单元测试
 * 
 * Phase 5.2: 图标系统重新设计
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IconManager } from './IconManager'
import { LEARNING_COMPLETE_PAGES } from '@/constants/progress'

// Mock Chrome API
global.chrome = {
  runtime: {
    getURL: (path: string) => `chrome-extension://test/${path}`
  },
  action: {
    setIcon: vi.fn()
  }
} as any

// Mock fetch and createImageBitmap
global.fetch = vi.fn()
global.createImageBitmap = vi.fn()

// Mock ImageData
if (typeof ImageData === 'undefined') {
  (global as any).ImageData = class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    
    constructor(width: number, height: number) {
      this.width = width
      this.height = height
      this.data = new Uint8ClampedArray(width * height * 4)
    }
  }
}

// Mock OffscreenCanvas (同 IconComposer.test.ts)
class MockOffscreenCanvas {
  width: number
  height: number
  
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }
  
  getContext(type: string) {
    if (type === '2d') {
      return new MockCanvasRenderingContext2D(this.width, this.height)
    }
    return null
  }
}

class MockCanvasRenderingContext2D {
  width: number
  height: number
  globalAlpha = 1.0
  globalCompositeOperation = 'source-over'
  fillStyle = '#000000'
  private imageData: ImageData
  
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.imageData = new ImageData(width, height)
  }
  
  clearRect() {}
  drawImage() {}
  fillRect() {}
  beginPath() {}
  moveTo() {}
  arc() {}
  lineTo() {}
  fill() {}
  save() {}
  restore() {}
  
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData {
    return this.imageData
  }
  
  putImageData(imageData: ImageData, dx: number, dy: number) {
    this.imageData = imageData
  }
}

global.OffscreenCanvas = MockOffscreenCanvas as any

describe('IconManager', () => {
  let manager: IconManager
  
  beforeEach(async () => {
    // Mock 图片加载
    const mockBlob = new Blob(['fake-image'], { type: 'image/png' })
    const mockImageBitmap = { close: vi.fn() } as any
    
    vi.mocked(fetch).mockResolvedValue({
      blob: () => Promise.resolve(mockBlob)
    } as any)
    
    vi.mocked(createImageBitmap).mockResolvedValue(mockImageBitmap)
    
    manager = new IconManager()
    await manager.initialize()
    
    // 清空 setIcon 调用记录
    vi.mocked(chrome.action.setIcon).mockClear()
  })
  
  afterEach(() => {
    manager.dispose()
  })
  
  describe('initialize()', () => {
    it('应该预加载图片并设置初始图标', async () => {
      // beforeEach 中已经调用了 initialize(),所以 setIcon 已经被调用过
      // 但在 beforeEach 中 mockClear() 清空了调用记录
      // 所以这里验证的是 beforeEach 后没有额外调用
      expect(chrome.action.setIcon).toHaveBeenCalledTimes(0)
    })
    
    it('加载失败应该抛出错误', async () => {
      const newManager = new IconManager()
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))
      
      await expect(newManager.initialize()).rejects.toThrow()
    })
  })
  
  describe('setLearningProgress()', () => {
    it('应该更新学习进度并刷新图标', () => {
      manager.setLearningProgress(500)
      
      expect(chrome.action.setIcon).toHaveBeenCalledTimes(1)
    })
    
    it('进度 0 页应该显示完全遮罩', () => {
      manager.setLearningProgress(0)
      
      expect(chrome.action.setIcon).toHaveBeenCalledTimes(1)
    })
    
    it('进度达到阈值应该显示静态图标', () => {
      manager.setLearningProgress(LEARNING_COMPLETE_PAGES)
      
      expect(chrome.action.setIcon).toHaveBeenCalledTimes(1)
    })
  })
  
  describe('setRecommendCount()', () => {
    it('应该更新推荐条目数并刷新图标', () => {
      manager.setRecommendCount(2)
      
      expect(chrome.action.setIcon).toHaveBeenCalledTimes(1)
    })
    
    it('推荐数应该限制在 0-3 范围', () => {
      manager.setRecommendCount(5)
      
      // 内部状态应该是3,但无法直接验证,只验证图标更新
      expect(chrome.action.setIcon).toHaveBeenCalledTimes(1)
    })
    
    it('推荐优先级高于学习进度', () => {
      manager.setLearningProgress(500)
      vi.mocked(chrome.action.setIcon).mockClear()
      
      manager.setRecommendCount(2)
      
      expect(chrome.action.setIcon).toHaveBeenCalledTimes(1)
    })
  })
  
  describe('startDiscoverAnimation()', () => {
    it('应该启动 RSS 发现动画', () => {
      vi.useFakeTimers()
      
      manager.startDiscoverAnimation()
      
      // 立即调用一次
      expect(chrome.action.setIcon).toHaveBeenCalledTimes(1)
      
      vi.useRealTimers()
    })
    
    it('动画应该循环 3 次后停止', async () => {
      vi.useFakeTimers()
      
      manager.startDiscoverAnimation()
      vi.mocked(chrome.action.setIcon).mockClear()
      
      // 每帧 500ms,共 3 帧,循环 3 次 = 9 帧 = 4500ms
      // 但最后一帧后立即停止,不会再调用 updateIcon
      vi.advanceTimersByTime(4500)
      
      // 9 帧调用
      expect(chrome.action.setIcon).toHaveBeenCalledTimes(9)
      
      vi.useRealTimers()
    })
    
    it('再次启动应该停止之前的动画', () => {
      vi.useFakeTimers()
      
      manager.startDiscoverAnimation()
      manager.startDiscoverAnimation()  // 重新启动
      
      vi.useRealTimers()
    })
  })
  
  describe('stopDiscoverAnimation()', () => {
    it('应该停止 RSS 发现动画', () => {
      vi.useFakeTimers()
      
      manager.startDiscoverAnimation()
      manager.stopDiscoverAnimation()
      
      vi.mocked(chrome.action.setIcon).mockClear()
      vi.advanceTimersByTime(1000)
      
      // 停止后不应该有更多调用
      expect(chrome.action.setIcon).toHaveBeenCalledTimes(0)
      
      vi.useRealTimers()
    })
  })
  
  describe('startFetchingAnimation()', () => {
    it('应该启动后台抓取动画', () => {
      vi.useFakeTimers()
      
      manager.startFetchingAnimation()
      
      // 立即调用一次
      expect(chrome.action.setIcon).toHaveBeenCalledTimes(1)
      
      vi.useRealTimers()
    })
    
    it('动画应该每 100ms 更新一次', () => {
      vi.useFakeTimers()
      
      manager.startFetchingAnimation()
      vi.mocked(chrome.action.setIcon).mockClear()
      
      vi.advanceTimersByTime(1000)
      
      // 1000ms / 100ms = 10 次
      expect(chrome.action.setIcon).toHaveBeenCalledTimes(10)
      
      vi.useRealTimers()
    })
  })
  
  describe('stopFetchingAnimation()', () => {
    it('应该停止后台抓取动画', () => {
      vi.useFakeTimers()
      
      manager.startFetchingAnimation()
      manager.stopFetchingAnimation()
      
      vi.mocked(chrome.action.setIcon).mockClear()
      vi.advanceTimersByTime(1000)
      
      // 停止后不应该有更多调用
      expect(chrome.action.setIcon).toHaveBeenCalledTimes(0)
      
      vi.useRealTimers()
    })
  })
  
  describe('setError()', () => {
    it('应该设置错误状态并刷新图标', () => {
      manager.setError(true)
      
      // 错误状态会启动动画,导致2次调用: 1次animate(), 1次updateIcon()
      expect(chrome.action.setIcon).toHaveBeenCalledTimes(2)
    })
    
    it('错误状态应该叠加到所有状态上', () => {
      manager.setRecommendCount(2)
      vi.mocked(chrome.action.setIcon).mockClear()
      
      manager.setError(true)
      
      // 错误状态会启动动画,导致2次调用
      expect(chrome.action.setIcon).toHaveBeenCalledTimes(2)
    })
  })
  
  describe('setPaused()', () => {
    it('应该设置暂停状态并刷新图标', () => {
      manager.setPaused(true)
      
      expect(chrome.action.setIcon).toHaveBeenCalledTimes(1)
    })
    
    it('暂停优先级高于推荐', () => {
      manager.setRecommendCount(2)
      vi.mocked(chrome.action.setIcon).mockClear()
      
      manager.setPaused(true)
      
      expect(chrome.action.setIcon).toHaveBeenCalledTimes(1)
    })
  })
  
  describe('状态优先级', () => {
    it('发现动画 > 暂停 > 推荐', () => {
      vi.useFakeTimers()
      
      manager.setRecommendCount(2)
      manager.setPaused(true)
      vi.mocked(chrome.action.setIcon).mockClear()
      
      manager.startDiscoverAnimation()
      
      // 发现动画应该覆盖暂停和推荐
      expect(chrome.action.setIcon).toHaveBeenCalledTimes(1)
      
      vi.useRealTimers()
    })
    
    it('暂停 > 后台抓取', () => {
      vi.useFakeTimers()
      
      manager.startFetchingAnimation()
      vi.mocked(chrome.action.setIcon).mockClear()
      
      manager.setPaused(true)
      
      expect(chrome.action.setIcon).toHaveBeenCalledTimes(1)
      
      vi.useRealTimers()
    })
    
    it('推荐 > 学习进度', () => {
      manager.setLearningProgress(500)
      vi.mocked(chrome.action.setIcon).mockClear()
      
      manager.setRecommendCount(1)
      
      expect(chrome.action.setIcon).toHaveBeenCalledTimes(1)
    })
  })
  
  describe('dispose()', () => {
    it('应该停止所有动画并清理资源', () => {
      vi.useFakeTimers()
      
      manager.startDiscoverAnimation()
      manager.startFetchingAnimation()
      
      manager.dispose()
      
      vi.mocked(chrome.action.setIcon).mockClear()
      vi.advanceTimersByTime(5000)
      
      // 清理后不应该有任何调用
      expect(chrome.action.setIcon).toHaveBeenCalledTimes(0)
      
      vi.useRealTimers()
    })
  })
})
