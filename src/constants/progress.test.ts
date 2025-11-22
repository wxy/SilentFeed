/**
 * 进度计算测试
 */

import { describe, it, expect } from 'vitest'
import { LEARNING_COMPLETE_PAGES, getLearningProgressRatio } from './progress'

describe('progress constants', () => {
  describe('LEARNING_COMPLETE_PAGES', () => {
    it('应该是 100', () => {
      expect(LEARNING_COMPLETE_PAGES).toBe(100)
    })
  })

  describe('getLearningProgressRatio', () => {
    it('应该在 0 页时返回 0', () => {
      expect(getLearningProgressRatio(0)).toBe(0)
    })

    it('应该在 50 页时返回 0.5', () => {
      expect(getLearningProgressRatio(50)).toBe(0.5)
    })

    it('应该在 100 页时返回 1', () => {
      expect(getLearningProgressRatio(100)).toBe(1)
    })

    it('应该在超过 100 页时返回 1（上限）', () => {
      expect(getLearningProgressRatio(150)).toBe(1)
      expect(getLearningProgressRatio(200)).toBe(1)
    })

    it('应该在负数页面时返回 0（下限）', () => {
      expect(getLearningProgressRatio(-10)).toBe(0)
      expect(getLearningProgressRatio(-50)).toBe(0)
    })

    it('应该处理 Infinity', () => {
      expect(getLearningProgressRatio(Infinity)).toBe(0)
    })

    it('应该处理 -Infinity', () => {
      expect(getLearningProgressRatio(-Infinity)).toBe(0)
    })

    it('应该处理 NaN', () => {
      expect(getLearningProgressRatio(NaN)).toBe(0)
    })

    it('应该正确计算中间值', () => {
      expect(getLearningProgressRatio(25)).toBe(0.25)
      expect(getLearningProgressRatio(75)).toBe(0.75)
      expect(getLearningProgressRatio(33)).toBe(0.33)
    })
  })
})
