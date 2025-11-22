/**
 * GlassCard 组件测试
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GlassCard } from './GlassCard'

describe('GlassCard', () => {
  describe('基本渲染', () => {
    it('应该渲染子元素', () => {
      render(<GlassCard>测试内容</GlassCard>)
      expect(screen.getByText('测试内容')).toBeInTheDocument()
    })

    it('应该应用默认样式', () => {
      const { container } = render(<GlassCard>内容</GlassCard>)
      const card = container.querySelector('.relative.group')
      expect(card).toBeInTheDocument()
    })
  })

  describe('变体样式', () => {
    it('应该渲染 primary 变体', () => {
      const { container } = render(
        <GlassCard variant="primary">Primary</GlassCard>
      )
      expect(container.querySelector('.from-indigo-50\\/90')).toBeInTheDocument()
    })

    it('应该渲染 secondary 变体', () => {
      const { container } = render(
        <GlassCard variant="secondary">Secondary</GlassCard>
      )
      expect(container.querySelector('.from-green-50\\/90')).toBeInTheDocument()
    })

    it('应该渲染 info 变体', () => {
      const { container } = render(
        <GlassCard variant="info">Info</GlassCard>
      )
      expect(container.querySelector('.from-blue-50\\/90')).toBeInTheDocument()
    })
  })

  describe('Hover 效果', () => {
    it('应该在 hover=true 时渲染光晕', () => {
      const { container } = render(
        <GlassCard hover={true}>Hover Card</GlassCard>
      )
      const glow = container.querySelector('.group-hover\\:opacity-100')
      expect(glow).toBeInTheDocument()
    })

    it('应该在 hover=false 时不渲染光晕', () => {
      const { container } = render(
        <GlassCard hover={false}>No Hover</GlassCard>
      )
      const glow = container.querySelector('.group-hover\\:opacity-100')
      expect(glow).not.toBeInTheDocument()
    })

    it('应该在未指定 hover 时不渲染光晕（默认行为）', () => {
      const { container } = render(
        <GlassCard>Default</GlassCard>
      )
      const glow = container.querySelector('.group-hover\\:opacity-100')
      expect(glow).not.toBeInTheDocument()
    })
  })

  describe('自定义类名', () => {
    it('应该接受自定义类名', () => {
      const { container } = render(
        <GlassCard className="custom-class">Custom</GlassCard>
      )
      expect(container.querySelector('.custom-class')).toBeInTheDocument()
    })

    it('应该在没有自定义类名时正常工作', () => {
      const { container } = render(
        <GlassCard>No Custom Class</GlassCard>
      )
      const card = container.querySelector('.relative.group')
      expect(card).toBeInTheDocument()
    })
  })

  describe('组合场景', () => {
    it('应该支持所有 props 组合', () => {
      render(
        <GlassCard 
          variant="secondary" 
          hover={true} 
          className="my-custom-card"
        >
          完整配置
        </GlassCard>
      )
      expect(screen.getByText('完整配置')).toBeInTheDocument()
    })
  })
})
