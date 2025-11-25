/**
 * TitleStateManager 单元测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// 模拟 document.title
let mockTitle = 'Test Page Title'

Object.defineProperty(document, 'title', {
  get: () => mockTitle,
  set: (value: string) => {
    mockTitle = value
  },
  configurable: true
})

// 简化版的 TitleStateManager（用于测试）
class TitleStateManager {
  private originalTitle: string = document.title
  private currentEmoji: string = ''
  
  private readonly EMOJIS = {
    LEARNING: '⏱️',
    LEARNED: '✅',
  }
  
  startLearning(): void {
    this.originalTitle = this.getCleanTitle()
    this.currentEmoji = this.EMOJIS.LEARNING
    this.updateTitle()
  }
  
  completeLearning(): void {
    this.currentEmoji = this.EMOJIS.LEARNED
    this.updateTitle()
  }
  
  clearLearning(): void {
    this.currentEmoji = ''
    this.updateTitle()
  }
  
  reset(): void {
    this.clearLearning()
    this.originalTitle = document.title
  }
  
  private getCleanTitle(): string {
    let title = document.title
    Object.values(this.EMOJIS).forEach(emoji => {
      title = title.replace(emoji + ' ', '')
    })
    return title
  }
  
  private updateTitle(): void {
    const cleanTitle = this.getCleanTitle()
    document.title = this.currentEmoji ? `${this.currentEmoji} ${cleanTitle}` : cleanTitle
  }
}

describe('TitleStateManager', () => {
  let manager: TitleStateManager
  
  beforeEach(() => {
    // 重置标题
    document.title = 'Test Page Title'
    manager = new TitleStateManager()
  })
  
  afterEach(() => {
    vi.clearAllTimers()
  })
  
  describe('startLearning', () => {
    it('应该在标题前添加学习中 emoji', () => {
      manager.startLearning()
      expect(document.title).toBe('⏱️ Test Page Title')
    })
    
    it('应该保存原始标题', () => {
      manager.startLearning()
      manager.clearLearning()
      expect(document.title).toBe('Test Page Title')
    })
    
    it('应该移除已存在的 emoji 后再添加', () => {
      document.title = '✅ Test Page Title'
      manager.startLearning()
      expect(document.title).toBe('⏱️ Test Page Title')
    })
  })
  
  describe('completeLearning', () => {
    it('应该将学习中 emoji 替换为完成 emoji', () => {
      manager.startLearning()
      expect(document.title).toBe('⏱️ Test Page Title')
      
      manager.completeLearning()
      expect(document.title).toBe('✅ Test Page Title')
    })
    
    it('应该直接添加完成 emoji（即使没有先调用 startLearning）', () => {
      manager.completeLearning()
      expect(document.title).toBe('✅ Test Page Title')
    })
  })
  
  describe('clearLearning', () => {
    it('应该移除学习中 emoji', () => {
      manager.startLearning()
      manager.clearLearning()
      expect(document.title).toBe('Test Page Title')
    })
    
    it('应该移除完成 emoji', () => {
      manager.completeLearning()
      manager.clearLearning()
      expect(document.title).toBe('Test Page Title')
    })
    
    it('对于没有 emoji 的标题应该保持不变', () => {
      manager.clearLearning()
      expect(document.title).toBe('Test Page Title')
    })
  })
  
  describe('reset', () => {
    it('应该清除 emoji 并更新原始标题', () => {
      manager.startLearning()
      expect(document.title).toBe('⏱️ Test Page Title')
      
      // 模拟标题被其他代码修改
      document.title = 'New Page Title'
      
      manager.reset()
      expect(document.title).toBe('New Page Title')
      
      // 再次开始学习应该使用新标题
      manager.startLearning()
      expect(document.title).toBe('⏱️ New Page Title')
    })
  })
  
  describe('多次调用', () => {
    it('应该正确处理多次状态切换', () => {
      manager.startLearning()
      expect(document.title).toBe('⏱️ Test Page Title')
      
      manager.completeLearning()
      expect(document.title).toBe('✅ Test Page Title')
      
      manager.clearLearning()
      expect(document.title).toBe('Test Page Title')
      
      manager.startLearning()
      expect(document.title).toBe('⏱️ Test Page Title')
    })
    
    it('应该避免重复添加 emoji', () => {
      manager.startLearning()
      manager.startLearning()
      expect(document.title).toBe('⏱️ Test Page Title')
      expect(document.title).not.toBe('⏱️ ⏱️ Test Page Title')
    })
  })
  
  describe('特殊字符处理', () => {
    it('应该正确处理包含特殊字符的标题', () => {
      document.title = 'Test - Page & Title (2024)'
      manager = new TitleStateManager()
      
      manager.startLearning()
      expect(document.title).toBe('⏱️ Test - Page & Title (2024)')
      
      manager.clearLearning()
      expect(document.title).toBe('Test - Page & Title (2024)')
    })
    
    it('应该正确处理空标题', () => {
      document.title = ''
      manager = new TitleStateManager()
      
      manager.startLearning()
      expect(document.title).toBe('⏱️ ')
      
      manager.clearLearning()
      expect(document.title).toBe('')
    })
  })
})
