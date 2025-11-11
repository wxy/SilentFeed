/**
 * IconComposer 单元测试
 * 
 * Phase 5.2: 图标系统重新设计
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IconComposer, type IconState } from './IconComposer'

// Mock Chrome API
global.chrome = {
  runtime: {
    getURL: (path: string) => `chrome-extension://test/${path}`
  }
} as any

// Mock fetch and createImageBitmap
global.fetch = vi.fn()
global.createImageBitmap = vi.fn()

// Mock ImageData (Node.js 环境不支持)
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

// Mock OffscreenCanvas
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

describe('IconComposer', () => {
  let composer: IconComposer
  
  beforeEach(async () => {
    composer = new IconComposer(128)
    
    // Mock 图片加载
    const mockBlob = new Blob(['fake-image'], { type: 'image/png' })
    const mockImageBitmap = { 
      close: vi.fn(),
      width: 128,
      height: 128
    } as any
    
    vi.mocked(fetch).mockResolvedValue({
      blob: () => Promise.resolve(mockBlob)
    } as any)
    
    vi.mocked(createImageBitmap).mockResolvedValue(mockImageBitmap)
    
    await composer.preload()
  })
  
  describe('preload()', () => {
    it('应该加载所有 PNG 图片', async () => {
      expect(fetch).toHaveBeenCalledTimes(5)
      expect(fetch).toHaveBeenCalledWith('chrome-extension://test/assets/icons/128/base-static.png')
      expect(fetch).toHaveBeenCalledWith('chrome-extension://test/assets/icons/128/overlays/wave-1-lit.png')
      expect(fetch).toHaveBeenCalledWith('chrome-extension://test/assets/icons/128/overlays/wave-2-lit.png')
      expect(fetch).toHaveBeenCalledWith('chrome-extension://test/assets/icons/128/overlays/wave-3-lit.png')
      expect(fetch).toHaveBeenCalledWith('chrome-extension://test/assets/icons/128/overlays/learning-mask.png')
    })
    
    it('多次调用 preload() 应该只加载一次', async () => {
      const callCount = vi.mocked(fetch).mock.calls.length
      await composer.preload()
      expect(vi.mocked(fetch).mock.calls.length).toBe(callCount)
    })
    
    it('加载失败应该抛出错误', async () => {
      const newComposer = new IconComposer(128)
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))
      
      await expect(newComposer.preload()).rejects.toThrow()
    })
  })
  
  describe('compose()', () => {
    it('未预加载时应该抛出错误', () => {
      const newComposer = new IconComposer(128)
      const state: IconState = { type: 'static' }
      
      expect(() => newComposer.compose(state)).toThrow('[IconComposer] 请先调用 preload() 加载图片')
    })
    
    it('应该返回 ImageData', () => {
      const state: IconState = { type: 'static' }
      const result = composer.compose(state)
      
      expect(result).toBeInstanceOf(ImageData)
      expect(result.width).toBe(128)
      expect(result.height).toBe(128)
    })
    
    it('静态状态应该只绘制基础背景', () => {
      const state: IconState = { type: 'static' }
      const spy = vi.spyOn(composer as any, 'drawRecommendWaves')
      
      composer.compose(state)
      
      expect(spy).not.toHaveBeenCalled()
    })
    
    it('推荐状态应该叠加波纹', () => {
      const state: IconState = { 
        type: 'recommend', 
        recommendCount: 2 
      }
      const spy = vi.spyOn(composer as any, 'drawRecommendWaves')
      
      composer.compose(state)
      
      expect(spy).toHaveBeenCalledWith(2)
    })
    
    it('学习状态应该绘制垂直遮罩', () => {
      const state: IconState = { 
        type: 'learning', 
        learningProgress: 500 
      }
      const spy = vi.spyOn(composer as any, 'drawLearningMask')
      
      composer.compose(state)
      
      expect(spy).toHaveBeenCalledWith(500)
    })
    
    it('后台抓取状态应该绘制三波纹呼吸', () => {
      const state: IconState = { 
        type: 'fetching', 
        fetchingTimestamp: Date.now() 
      }
      const spy = vi.spyOn(composer as any, 'drawFetchingPulse')
      
      composer.compose(state)
      
      expect(spy).toHaveBeenCalledWith(state.fetchingTimestamp)
    })
    
    it('暂停状态应该应用灰度滤镜', () => {
      const state: IconState = { type: 'paused' }
      const spy = vi.spyOn(composer as any, 'applyGrayscaleFilter')
      
      composer.compose(state)
      
      expect(spy).toHaveBeenCalled()
    })
    
    it('错误状态应该叠加红色闪动', () => {
      const state: IconState = { 
        type: 'static', 
        hasError: true 
      }
      const ctx = (composer as any).ctx
      const saveSpy = vi.spyOn(ctx, 'save')
      const restoreSpy = vi.spyOn(ctx, 'restore')
      
      composer.compose(state)
      
      // 验证 save/restore 被调用(错误状态需要保存/恢复上下文)
      expect(saveSpy).toHaveBeenCalled()
      expect(restoreSpy).toHaveBeenCalled()
    })
  })
  
  describe('drawRecommendWaves()', () => {
    it('recommendCount=1 应该只绘制第1条波纹', () => {
      const method = (composer as any).drawRecommendWaves.bind(composer)
      const ctx = (composer as any).ctx
      const spy = vi.spyOn(ctx, 'drawImage')
      
      method(1)
      
      expect(spy).toHaveBeenCalledTimes(1)
    })
    
    it('recommendCount=3 应该绘制3条波纹', () => {
      const method = (composer as any).drawRecommendWaves.bind(composer)
      const ctx = (composer as any).ctx
      const spy = vi.spyOn(ctx, 'drawImage')
      
      method(3)
      
      expect(spy).toHaveBeenCalledTimes(3)
    })
  })
  
  describe('drawDiscoverWaves()', () => {
    it('frame=0 应该不绘制波纹', () => {
      const spy = vi.spyOn(composer as any, 'drawRecommendWaves')
      const method = (composer as any).drawDiscoverWaves.bind(composer)
      
      method(0)
      
      expect(spy).toHaveBeenCalledWith(0)
    })
    
    it('frame=2 应该绘制2条波纹', () => {
      const spy = vi.spyOn(composer as any, 'drawRecommendWaves')
      const method = (composer as any).drawDiscoverWaves.bind(composer)
      
      method(2)
      
      expect(spy).toHaveBeenCalledWith(2)
    })
    
    it('frame=3 应该绘制3条波纹', () => {
      const spy = vi.spyOn(composer as any, 'drawRecommendWaves')
      const method = (composer as any).drawDiscoverWaves.bind(composer)
      
      method(3)
      
      expect(spy).toHaveBeenCalledWith(3)
    })
  })
  
  describe('drawFetchingPulse()', () => {
    it('应该设置透明度并绘制三波纹', () => {
      const ctx = (composer as any).ctx
      const method = (composer as any).drawFetchingPulse.bind(composer)
      const timestamp = Date.now() - 1000 // 1秒前
      
      method(timestamp)
      
      // 验证透明度被修改
      expect(ctx.globalAlpha).toBeGreaterThanOrEqual(0.2)
      expect(ctx.globalAlpha).toBeLessThanOrEqual(1.0)
    })
    
    it('呼吸透明度应该在 0.2-1.0 范围内', () => {
      const method = (composer as any).drawFetchingPulse.bind(composer)
      const ctx = (composer as any).ctx
      
      // 测试不同时间点
      for (let i = 0; i < 10; i++) {
        const timestamp = Date.now() - i * 200
        method(timestamp)
        
        expect(ctx.globalAlpha).toBeGreaterThanOrEqual(0.2)
        expect(ctx.globalAlpha).toBeLessThanOrEqual(1.0)
      }
    })
  })
  
  describe('drawLearningMask()', () => {
    it('0页应该绘制全遮罩', () => {
      const ctx = (composer as any).ctx
      const spy = vi.spyOn(ctx, 'drawImage')
      const method = (composer as any).drawLearningMask.bind(composer)
      
      method(0)
      
      // 应该绘制学习遮罩图层(128×128)
      expect(spy).toHaveBeenCalled()
    })
    
    it('500页应该绘制半高遮罩', () => {
      const ctx = (composer as any).ctx
      const spy = vi.spyOn(ctx, 'drawImage')
      const method = (composer as any).drawLearningMask.bind(composer)
      
      method(500)
      
      // 应该绘制学习遮罩图层(裁剪到一半高度)
      expect(spy).toHaveBeenCalled()
    })
    
    it('1000页应该不绘制遮罩', () => {
      const ctx = (composer as any).ctx
      const spy = vi.spyOn(ctx, 'drawImage')
      const method = (composer as any).drawLearningMask.bind(composer)
      
      method(1000)
      
      // 不应该调用 drawImage(不绘制遮罩)
      expect(spy).not.toHaveBeenCalled()
    })
    
    it('超过1000页应该不绘制遮罩', () => {
      const ctx = (composer as any).ctx
      const spy = vi.spyOn(ctx, 'drawImage')
      const method = (composer as any).drawLearningMask.bind(composer)
      
      method(1500)
      
      expect(spy).not.toHaveBeenCalled()
    })
  })
  
  describe('applyGrayscaleFilter()', () => {
    it('应该将彩色图像转换为灰度', () => {
      const ctx = (composer as any).ctx
      const method = (composer as any).applyGrayscaleFilter.bind(composer)
      
      // 创建测试用的彩色 ImageData
      const imageData = new ImageData(2, 2)
      imageData.data[0] = 255  // R
      imageData.data[1] = 0    // G
      imageData.data[2] = 0    // B
      imageData.data[3] = 255  // A
      
      vi.spyOn(ctx, 'getImageData').mockReturnValue(imageData)
      const putSpy = vi.spyOn(ctx, 'putImageData')
      
      method()
      
      // 验证 putImageData 被调用
      expect(putSpy).toHaveBeenCalled()
      
      // 验证灰度转换公式: Gray = 0.299*R + 0.587*G + 0.114*B
      const expectedGray = Math.floor(255 * 0.299)
      const resultData = putSpy.mock.calls[0][0] as ImageData
      expect(resultData.data[0]).toBe(expectedGray)
      expect(resultData.data[1]).toBe(expectedGray)
      expect(resultData.data[2]).toBe(expectedGray)
      expect(resultData.data[3]).toBe(255)  // Alpha 不变
    })
  })
  
  describe('dispose()', () => {
    it('应该释放所有 ImageBitmap 资源', () => {
      const baseImage = (composer as any).baseImage
      const overlayImages = (composer as any).overlayImages
      
      composer.dispose()
      
      // 验证所有 close() 被调用
      expect(baseImage.close).toHaveBeenCalled()
      expect(overlayImages.wave1.close).toHaveBeenCalled()
      expect(overlayImages.wave2.close).toHaveBeenCalled()
      expect(overlayImages.wave3.close).toHaveBeenCalled()
      expect(overlayImages.learningMask.close).toHaveBeenCalled()
    })
    
    it('dispose 后应该重置 loaded 状态', () => {
      composer.dispose()
      
      const state: IconState = { type: 'static' }
      expect(() => composer.compose(state)).toThrow('[IconComposer] 请先调用 preload() 加载图片')
    })
  })
})
