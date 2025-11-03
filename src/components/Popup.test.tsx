/**
 * Popup 组件测试
 * Phase 2.7: 两阶段 UI 测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import IndexPopup from '../popup'
import * as db from '@/storage/db'

// Mock chrome API
global.chrome = {
  runtime: {
    openOptionsPage: vi.fn()
  },
  tabs: {
    create: vi.fn()
  }
} as any

// Mock i18n
vi.mock('@/i18n', () => ({
  default: {}
}))

vi.mock('@/i18n/helpers', () => ({
  useI18n: () => ({
    _: (key: string, params?: any) => {
      const translations: Record<string, string> = {
        'app.name': 'Feed AI Muter',
        'app.shortName': 'RSS 静音器',
        'popup.welcome': '欢迎使用智能 RSS 阅读器',
        'popup.learning': '正在学习你的兴趣...',
        'popup.progress': `${params?.current || 0}/${params?.total || 1000} 页`,
        'popup.stage.explorer': '探索者阶段',
        'popup.stage.learner': '学习者阶段',
        'popup.stage.grower': '成长者阶段',
        'popup.stage.master': '大师阶段',
        'popup.hint': '开始浏览，我会自动学习你的兴趣',
        'popup.settings': '设置',
        'popup.loading': '加载推荐中...',
        'popup.recommendations': '为你推荐',
        'popup.recommendationCount': `共 ${params?.count || 0} 条`,
        'popup.dismissAll': '这些我都不想读',
        'popup.noRecommendations': '暂无推荐',
        'popup.checkBackLater': '稍后回来查看新推荐'
      }
      return translations[key] || key
    }
  })
}))

// Mock RecommendationStore
vi.mock('@/stores/recommendationStore', () => ({
  useRecommendationStore: () => ({
    recommendations: [],
    isLoading: false,
    error: null,
    loadRecommendations: vi.fn(),
    markAsRead: vi.fn(),
    dismissAll: vi.fn()
  })
}))

describe('Popup - 两阶段 UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('冷启动阶段（0-1000 页）', () => {
    it('应该显示冷启动界面（0 页）', async () => {
      vi.spyOn(db, 'getPageCount').mockResolvedValue(0)

      render(<IndexPopup />)

      await waitFor(() => {
        expect(screen.getByText('Feed AI Muter')).toBeInTheDocument()
        expect(screen.getByText('0/1000 页')).toBeInTheDocument()
        expect(screen.getByText('探索者阶段')).toBeInTheDocument()
        expect(screen.getByText('🌱')).toBeInTheDocument()
      })
    })

    it('应该显示正确的成长阶段（300 页）', async () => {
      vi.spyOn(db, 'getPageCount').mockResolvedValue(300)

      render(<IndexPopup />)

      await waitFor(() => {
        expect(screen.getByText('300/1000 页')).toBeInTheDocument()
        expect(screen.getByText('学习者阶段')).toBeInTheDocument()
        expect(screen.getByText('🌿')).toBeInTheDocument()
      })
    })

    it('应该显示成长者阶段（700 页）', async () => {
      vi.spyOn(db, 'getPageCount').mockResolvedValue(700)

      render(<IndexPopup />)

      await waitFor(() => {
        expect(screen.getByText('700/1000 页')).toBeInTheDocument()
        expect(screen.getByText('成长者阶段')).toBeInTheDocument()
        expect(screen.getByText('🌳')).toBeInTheDocument()
      })
    })

    it('应该显示进度条', async () => {
      vi.spyOn(db, 'getPageCount').mockResolvedValue(500)

      render(<IndexPopup />)

      await waitFor(() => {
        const progressBar = document.querySelector('[style*="width: 50%"]')
        expect(progressBar).toBeInTheDocument()
      })
    })
  })

  describe('推荐阶段（1000+ 页）', () => {
    it('应该在达到 1000 页后切换到推荐界面', async () => {
      vi.spyOn(db, 'getPageCount').mockResolvedValue(1000)

      render(<IndexPopup />)

      await waitFor(() => {
        // 应该显示推荐界面而不是冷启动界面
        expect(screen.queryByText('探索者阶段')).not.toBeInTheDocument()
        expect(screen.queryByText('学习者阶段')).not.toBeInTheDocument()
        // 显示空推荐状态（因为没有推荐数据）
        expect(screen.getByText('暂无推荐')).toBeInTheDocument()
      })
    })

    it('应该显示空推荐状态', async () => {
      vi.spyOn(db, 'getPageCount').mockResolvedValue(1500)

      render(<IndexPopup />)

      await waitFor(() => {
        expect(screen.getByText('暂无推荐')).toBeInTheDocument()
        expect(screen.getByText('稍后回来查看新推荐')).toBeInTheDocument()
      })
    })
  })

  describe('设置按钮', () => {
    it('应该能打开设置页面', async () => {
      vi.spyOn(db, 'getPageCount').mockResolvedValue(0)
      const user = userEvent.setup()

      render(<IndexPopup />)

      await waitFor(() => {
        expect(screen.getByText('设置')).toBeInTheDocument()
      })

      await user.click(screen.getByText('设置'))

      expect(chrome.runtime.openOptionsPage).toHaveBeenCalled()
    })
  })

  describe('加载状态', () => {
    it('应该显示加载动画', () => {
      vi.spyOn(db, 'getPageCount').mockImplementation(
        () => new Promise(() => {}) // 永不 resolve
      )

      render(<IndexPopup />)

      expect(screen.getByText('⏳')).toBeInTheDocument()
    })

    it('应该处理加载错误', async () => {
      vi.spyOn(db, 'getPageCount').mockRejectedValue(new Error('数据库错误'))
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      render(<IndexPopup />)

      await waitFor(() => {
        // 应该显示冷启动界面（fallback 到 0 页）
        expect(screen.getByText('0/1000 页')).toBeInTheDocument()
      })

      consoleErrorSpy.mockRestore()
    })
  })
})
