/**
 * IconContainer 组件测试
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IconContainer } from './IconContainer'

describe('IconContainer', () => {
  describe('基本渲染', () => {
    it('应该渲染图标', () => {
      const { container } = render(<IconContainer icon="📚" />)
      expect(container.textContent).toContain('📚')
    })

    it('应该应用默认中等尺寸', () => {
      const { container } = render(<IconContainer icon="🎨" />)
      const iconElement = container.querySelector('.w-24.h-24')
      expect(iconElement).toBeInTheDocument()
    })
  })

  describe('尺寸变体', () => {
    it('应该渲染小尺寸', () => {
      const { container } = render(<IconContainer icon="📖" size="sm" />)
      const iconElement = container.querySelector('.w-16.h-16')
      expect(iconElement).toBeInTheDocument()
    })

    it('应该渲染中等尺寸', () => {
      const { container } = render(<IconContainer icon="📖" size="md" />)
      const iconElement = container.querySelector('.w-24.h-24')
      expect(iconElement).toBeInTheDocument()
    })

    it('应该渲染大尺寸', () => {
      const { container } = render(<IconContainer icon="📖" size="lg" />)
      const iconElement = container.querySelector('.w-32.h-32')
      expect(iconElement).toBeInTheDocument()
    })
  })

  describe('脉冲动画', () => {
    it('应该在 pulse=true 时显示脉冲动画', () => {
      const { container } = render(<IconContainer icon="📡" pulse={true} />)
      const pulseElement = container.querySelector('.animate-pulse-glow')
      expect(pulseElement).toBeInTheDocument()
      
      const pingElement = container.querySelector('.animate-ping')
      expect(pingElement).toBeInTheDocument()
    })

    it('应该在 pulse=false 时不显示脉冲动画', () => {
      const { container } = render(<IconContainer icon="📡" pulse={false} />)
      const pulseElement = container.querySelector('.animate-pulse-glow')
      expect(pulseElement).not.toBeInTheDocument()
      
      const pingElement = container.querySelector('.animate-ping')
      expect(pingElement).not.toBeInTheDocument()
    })

    it('应该在未指定 pulse 时不显示脉冲动画（默认行为）', () => {
      const { container } = render(<IconContainer icon="📡" />)
      const pulseElement = container.querySelector('.animate-pulse-glow')
      expect(pulseElement).not.toBeInTheDocument()
    })
  })

  describe('点击交互', () => {
    it('应该在有 onClick 时添加可点击样式', () => {
      const handleClick = vi.fn()
      const { container } = render(
        <IconContainer icon="🔔" onClick={handleClick} />
      )
      const iconElement = container.querySelector('.cursor-pointer')
      expect(iconElement).toBeInTheDocument()
    })

    it('应该在没有 onClick 时不添加可点击样式', () => {
      const { container } = render(<IconContainer icon="🔔" />)
      const iconElement = container.querySelector('.cursor-pointer')
      expect(iconElement).not.toBeInTheDocument()
    })

    it('应该触发点击事件', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()
      const { container } = render(
        <IconContainer icon="🎯" onClick={handleClick} />
      )
      
      const clickableElement = container.querySelector('.cursor-pointer')
      if (clickableElement) {
        await user.click(clickableElement)
        expect(handleClick).toHaveBeenCalledTimes(1)
      }
    })
  })

  describe('自定义类名', () => {
    it('应该接受自定义类名', () => {
      const { container } = render(
        <IconContainer icon="⭐" className="custom-icon" />
      )
      expect(container.querySelector('.custom-icon')).toBeInTheDocument()
    })

    it('应该在没有自定义类名时正常工作', () => {
      const { container } = render(<IconContainer icon="⭐" />)
      const relativeDiv = container.querySelector('.relative')
      expect(relativeDiv).toBeInTheDocument()
    })
  })

  describe('组合场景', () => {
    it('应该支持所有 props 组合', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()
      const { container } = render(
        <IconContainer
          icon="🚀"
          size="lg"
          pulse={true}
          onClick={handleClick}
          className="my-icon"
        />
      )

      // 验证图标渲染
      expect(container.textContent).toContain('🚀')
      
      // 验证尺寸
      expect(container.querySelector('.w-32.h-32')).toBeInTheDocument()
      
      // 验证脉冲动画
      expect(container.querySelector('.animate-pulse-glow')).toBeInTheDocument()
      
      // 验证自定义类名
      expect(container.querySelector('.my-icon')).toBeInTheDocument()
      
      // 验证点击
      const clickableElement = container.querySelector('.cursor-pointer')
      if (clickableElement) {
        await user.click(clickableElement)
        expect(handleClick).toHaveBeenCalled()
      }
    })
  })
})
