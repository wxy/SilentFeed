import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { AIConfigPanel } from './AIConfigPanel'

vi.mock('@/i18n/helpers', () => ({
  useI18n: () => ({ _: (k: string) => k })
}))

vi.mock('@/storage/ai-config', () => ({
  getAIConfig: vi.fn(async () => ({
    enabled: false,
    provider: null,
    apiKeys: {},
    model: '',
  })),
}))

describe('AIConfigPanel 条件渲染', () => {
  it('应显示 Provider 面板标题与未配置状态', async () => {
    render(<AIConfigPanel />)
    expect(screen.getByText('options.aiConfig.providerPanel.title')).toBeDefined()
    expect(screen.getAllByText('options.aiConfig.card.statusNotConfigured').length).toBeGreaterThan(0)
  })

  it('应渲染检查与配置按钮', async () => {
    render(<AIConfigPanel />)
    expect(screen.getAllByText('options.aiConfig.card.check').length).toBeGreaterThan(0)
    expect(screen.getAllByText('options.aiConfig.card.configure').length).toBeGreaterThan(0)
  })
})
