import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { AIConfigPanel } from './AIConfigPanel'

// Mock i18n with actual translations for testing
vi.mock('@/i18n/helpers', () => ({
  useI18n: () => ({
    _: (key: string) => {
      const translations: Record<string, string> = {
        "options.aiConfig.providerPanel.title": "AI 提供商状态",
        "options.aiConfig.providerPanel.checkAll": "检测全部",
        "options.aiConfig.providerPanel.checking": "检测中...",
        "options.aiConfig.card.statusAvailable": "可用",
        "options.aiConfig.card.statusUnavailable": "不可用",
        "options.aiConfig.card.statusNotConfigured": "未配置",
        "options.aiConfig.card.typeLocal": "本地",
        "options.aiConfig.card.typeRemote": "远程",
        "options.aiConfig.card.active": "在用",
        "options.aiConfig.card.supportsReasoning": "支持推理能力",
        "options.aiConfig.card.preferredRemote": "首选远程 AI",
        "options.aiConfig.card.preferredLocal": "首选本地 AI",
        "options.aiConfig.card.latency": "延迟: {{value}}",
        "options.aiConfig.card.lastChecked": "检测: {{time}}",
        "options.aiConfig.card.check": "检测",
        "options.aiConfig.card.checking": "检测中...",
        "options.aiConfig.card.configure": "配置",
        "options.aiConfig.card.budget": "月度预算"
      }
      return translations[key] || key
    }
  })
}))

vi.mock('@/storage/ai-config', () => ({
  getAIConfig: vi.fn(async () => ({
    providers: {},
    monthlyBudget: 5,
    local: {
      enabled: false,
      provider: 'ollama',
      endpoint: 'http://localhost:11434/v1',
      model: '',
      apiKey: 'ollama'
    },
    engineAssignment: {
      pageAnalysis: { provider: 'deepseek', useReasoning: false },
      feedAnalysis: { provider: 'deepseek', useReasoning: false },
      profileGeneration: { provider: 'deepseek', useReasoning: false }
    }
  })),
}))

describe('AIConfigPanel 条件渲染', () => {
  it('应显示 Provider 面板标题与未配置状态', async () => {
    render(<AIConfigPanel />)
    // 使用部分文本匹配，因为 emoji 和文本可能被分开渲染
    expect(screen.getByText(/AI 提供商状态/)).toBeDefined()
    // 未配置状态现在用 emoji ⚪ 显示
    expect(screen.getAllByText('⚪').length).toBeGreaterThan(0)
  })

  it('应渲染检查与配置按钮', async () => {
    render(<AIConfigPanel />)
    expect(screen.getAllByText('检测').length).toBeGreaterThan(0)
    expect(screen.getAllByText('配置').length).toBeGreaterThan(0)
  })
})
