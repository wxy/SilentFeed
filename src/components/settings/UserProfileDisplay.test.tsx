/**
 * UserProfileDisplay 组件测试
 */

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { UserProfileDisplay } from "./UserProfileDisplay"

// Mock i18n
vi.mock("@/i18n/helpers", () => ({
  useI18n: () => ({
    _: (key: string) => key,
  }),
}))

// Mock storage
const mockGetUserProfile = vi.fn()
vi.mock("@/storage/db", () => ({
  getUserProfile: () => mockGetUserProfile(),
}))

// Mock ProfileManager
vi.mock("@/core/profile/ProfileManager", () => ({
  profileManager: {
    rebuildProfile: vi.fn(),
  },
}))

describe("UserProfileDisplay 组件", () => {
  it("应该在加载时显示加载状态", () => {
    mockGetUserProfile.mockImplementation(() => new Promise(() => {}))

    render(<UserProfileDisplay />)

    const skeleton = document.querySelector(".animate-pulse")
    expect(skeleton).toBeInTheDocument()
  })

  it("应该在没有数据时显示空状态提示", async () => {
    mockGetUserProfile.mockResolvedValue(null)

    render(<UserProfileDisplay />)

    await screen.findByText(/还没有足够的浏览数据/)
    expect(screen.getByText(/还没有足够的浏览数据/)).toBeInTheDocument()
  })

  it("应该渲染重建画像按钮", async () => {
    mockGetUserProfile.mockResolvedValue(null)

    render(<UserProfileDisplay />)

    await screen.findByText(/重建画像/)
    expect(screen.getByText(/重建画像/)).toBeInTheDocument()
  })
})