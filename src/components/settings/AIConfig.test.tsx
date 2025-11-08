import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { AIConfig } from "./AIConfig"

// Mock chrome.storage.sync
const mockChromeStorage = {
  sync: {
    get: vi.fn(),
    set: vi.fn()
  }
}

global.chrome = {
  storage: mockChromeStorage
} as any

describe("AIConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChromeStorage.sync.get.mockResolvedValue({})
    mockChromeStorage.sync.set.mockResolvedValue(undefined)
  })
  
  describe("渲染", () => {
    it("应该渲染 AI 配置界面", () => {
      render(<AIConfig />)
      
      expect(screen.getByText(/AI 配置/)).toBeInTheDocument()
      expect(screen.getByLabelText("AI 提供商")).toBeInTheDocument()
    })
    
    it("应该显示所有提供商选项", () => {
      render(<AIConfig />)
      
      const select = screen.getByLabelText("AI 提供商")
      expect(select).toBeInTheDocument()
      
      // 检查选项
      expect(screen.getByRole("option", { name: /未配置/ })).toBeInTheDocument()
      expect(screen.getByRole("option", { name: /OpenAI/ })).toBeInTheDocument()
      expect(screen.getByRole("option", { name: /Anthropic/ })).toBeInTheDocument()
      expect(screen.getByRole("option", { name: /DeepSeek/ })).toBeInTheDocument()
    })
  })
  
  describe("Provider 选择", () => {
    it("选择 Provider 后应该显示 API Key 输入框", async () => {
      render(<AIConfig />)
      
      const select = screen.getByLabelText("AI 提供商")
      
      // 初始状态：不显示 API Key 输入
      expect(screen.queryByLabelText("API Key")).not.toBeInTheDocument()
      
      // 选择 OpenAI
      fireEvent.change(select, { target: { value: "openai" } })
      
      // 应该显示 API Key 输入框
      expect(screen.getByLabelText("API Key")).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/OpenAI/)).toBeInTheDocument()
    })
    
    it("选择 Provider 后应该显示提供商说明", () => {
      render(<AIConfig />)
      
      const select = screen.getByLabelText("AI 提供商")
      
      // 选择 OpenAI
      fireEvent.change(select, { target: { value: "openai" } })
      
      expect(screen.getByText(/快速、准确/)).toBeInTheDocument()
    })
    
    it("选择 Provider 后应该显示预算控制", () => {
      render(<AIConfig />)
      
      const select = screen.getByLabelText("AI 提供商")
      
      // 选择 OpenAI
      fireEvent.change(select, { target: { value: "openai" } })
      
      expect(screen.getByLabelText(/月度预算/)).toBeInTheDocument()
    })
  })
  
  describe("配置保存", () => {
    it("应该保存配置到 chrome.storage.sync", async () => {
      render(<AIConfig />)
      
      // 选择 OpenAI
      const select = screen.getByLabelText("AI 提供商")
      fireEvent.change(select, { target: { value: "openai" } })
      
      // 输入 API Key
      const apiKeyInput = screen.getByLabelText("API Key")
      fireEvent.change(apiKeyInput, { target: { value: "sk-test-123456" } })
      
      // 点击保存
      const saveButton = screen.getByText("保存配置")
      fireEvent.click(saveButton)
      
      // 等待保存完成
      await waitFor(() => {
        expect(mockChromeStorage.sync.set).toHaveBeenCalledWith({
          aiConfig: {
            provider: "openai",
            apiKey: "sk-test-123456",
            enabled: true,
            monthlyBudget: 5
          }
        })
      })
      
      // 应该显示成功消息
      expect(screen.getByText(/配置保存成功/)).toBeInTheDocument()
    })
    
    it("API Key 为空时保存按钮应该被禁用", async () => {
      render(<AIConfig />)
      
      // 选择 OpenAI
      const select = screen.getByLabelText("AI 提供商")
      fireEvent.change(select, { target: { value: "openai" } })
      
      // 不输入 API Key
      const saveButton = screen.getByText("保存配置")
      
      // 保存按钮应该被禁用
      expect(saveButton).toBeDisabled()
      
      // 点击不应该有反应
      fireEvent.click(saveButton)
      expect(mockChromeStorage.sync.set).not.toHaveBeenCalled()
    })
  })
  
  describe("测试连接", () => {
    it("应该验证 OpenAI API Key 格式", async () => {
      render(<AIConfig />)
      
      // 选择 OpenAI
      const select = screen.getByLabelText("AI 提供商")
      fireEvent.change(select, { target: { value: "openai" } })
      
      // 输入正确格式的 API Key
      const apiKeyInput = screen.getByLabelText("API Key")
      fireEvent.change(apiKeyInput, { target: { value: "sk-test-123456" } })
      
      // 点击测试连接
      const testButton = screen.getByText("测试连接")
      fireEvent.click(testButton)
      
      // 应该显示格式正确
      await waitFor(() => {
        expect(screen.getByText(/API Key 格式正确/)).toBeInTheDocument()
      })
    })
    
    it("应该验证 Anthropic API Key 格式", async () => {
      render(<AIConfig />)
      
      // 选择 Anthropic
      const select = screen.getByLabelText("AI 提供商")
      fireEvent.change(select, { target: { value: "anthropic" } })
      
      // 输入正确格式的 API Key
      const apiKeyInput = screen.getByLabelText("API Key")
      fireEvent.change(apiKeyInput, { target: { value: "sk-ant-test-123456" } })
      
      // 点击测试连接
      const testButton = screen.getByText("测试连接")
      fireEvent.click(testButton)
      
      // 应该显示格式正确
      await waitFor(() => {
        expect(screen.getByText(/API Key 格式正确/)).toBeInTheDocument()
      })
    })
    
    it("API Key 格式错误时应该提示", async () => {
      render(<AIConfig />)
      
      // 选择 OpenAI
      const select = screen.getByLabelText("AI 提供商")
      fireEvent.change(select, { target: { value: "openai" } })
      
      // 输入错误格式的 API Key（不以 sk- 开头）
      const apiKeyInput = screen.getByLabelText("API Key")
      fireEvent.change(apiKeyInput, { target: { value: "wrong-key" } })
      
      // 点击测试连接
      const testButton = screen.getByText("测试连接")
      fireEvent.click(testButton)
      
      // 应该显示格式错误
      await waitFor(() => {
        expect(screen.getByText(/API Key 格式不正确/)).toBeInTheDocument()
      })
    })
  })
  
  describe("加载配置", () => {
    it("应该从 chrome.storage.sync 加载已保存的配置", async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        aiConfig: {
          provider: "openai",
          apiKey: "sk-saved-key",
          enabled: true,
          monthlyBudget: 10
        }
      })
      
      render(<AIConfig />)
      
      // 等待配置加载
      await waitFor(() => {
        const select = screen.getByLabelText("AI 提供商") as HTMLSelectElement
        expect(select.value).toBe("openai")
      })
      
      // 检查 API Key（password 类型看不到值，但输入框应该存在）
      expect(screen.getByLabelText("API Key")).toBeInTheDocument()
      
      // 检查预算
      const budgetInput = screen.getByLabelText(/月度预算/) as HTMLInputElement
      expect(budgetInput.value).toBe("10")
    })
  })
  
  describe("禁用 AI", () => {
    it("应该清除配置并禁用 AI", async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        aiConfig: {
          provider: "openai",
          apiKey: "sk-saved-key",
          enabled: true
        }
      })
      
      render(<AIConfig />)
      
      // 等待配置加载
      await waitFor(() => {
        const select = screen.getByLabelText("AI 提供商") as HTMLSelectElement
        expect(select.value).toBe("openai")
      })
      
      // 点击禁用 AI
      const disableButton = screen.getByText("禁用 AI")
      fireEvent.click(disableButton)
      
      // 应该清除配置
      await waitFor(() => {
        expect(mockChromeStorage.sync.set).toHaveBeenCalledWith({
          aiConfig: {
            provider: null,
            apiKey: "",
            enabled: false
          }
        })
      })
      
      // 应该显示成功消息
      expect(screen.getByText(/已禁用 AI/)).toBeInTheDocument()
    })
  })
  
  describe("UI 提示", () => {
    it("应该显示关于 AI 分析的提示信息", () => {
      render(<AIConfig />)
      
      expect(screen.getByText(/关于 AI 分析/)).toBeInTheDocument()
      expect(screen.getByText(/配置后/)).toBeInTheDocument()
      expect(screen.getByText(/不配置/)).toBeInTheDocument()
      expect(screen.getByText(/降级策略/)).toBeInTheDocument()
    })
    
    it("选择 Provider 后应该显示成本参考", () => {
      render(<AIConfig />)
      
      // 选择 OpenAI
      const select = screen.getByLabelText("AI 提供商")
      fireEvent.change(select, { target: { value: "openai" } })
      
      expect(screen.getByText(/成本参考/)).toBeInTheDocument()
      expect(screen.getByText(/OpenAI: 约/)).toBeInTheDocument()
    })
  })
})
