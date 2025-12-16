/**
 * NotificationSettings 组件测试
 * 测试通知设置组件
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NotificationSettings } from "./NotificationSettings"

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  initReactI18next: {
    type: "3rdParty",
    init: vi.fn(),
  },
}))

// Mock chrome storage
global.chrome = {
  storage: {
    sync: {
      get: vi.fn().mockImplementation(() => Promise.resolve({})),
      set: vi.fn().mockImplementation(() => Promise.resolve()),
    },
    local: {
      get: vi.fn().mockImplementation(() => Promise.resolve({})),
      set: vi.fn().mockImplementation(() => Promise.resolve()),
    },
  },
} as any

describe("NotificationSettings 组件", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("基本渲染", () => {
    it("应该正确渲染通知设置界面", () => {
      render(<NotificationSettings />)
      
      // 检查组件是否渲染
      expect(screen.getByText(/options.general.enableNotifications/)).toBeInTheDocument()
    })
  })

  describe("通知开关", () => {
    it("应该显示通知开关", () => {
      render(<NotificationSettings />)
      
      // 查找 checkbox 输入
      const checkbox = screen.getByRole("checkbox")
      expect(checkbox).toBeInTheDocument()
    })

    it("应该能够切换通知状态", async () => {
      const user = userEvent.setup()
      render(<NotificationSettings />)
      
      const checkbox = screen.getByRole("checkbox")
      
      // 点击切换
      await user.click(checkbox)
      
      // 验证 chrome.storage.sync.set 被调用（notification-config 现在在 sync）
      expect(chrome.storage.sync.set).toHaveBeenCalled()
    })
  })
})
