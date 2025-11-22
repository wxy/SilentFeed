import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { AIConfig } from "./AIConfig"
import * as aiConfigModule from "@/storage/ai-config"

// Mock ai-config 模块
vi.mock("@/storage/ai-config", () => ({
  getAIConfig: vi.fn(),
  saveAIConfig: vi.fn(),
  validateApiKey: vi.fn(),
  AIProviderType: {} as any
}))

// Mock aiManager
vi.mock("@/core/ai/AICapabilityManager", () => ({
  aiManager: {
    initialize: vi.fn(),
    testConnection: vi.fn()
  }
}))

describe("AIConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // 默认返回空配置
    vi.mocked(aiConfigModule.getAIConfig).mockResolvedValue({
      provider: null,
      apiKey: "",
      enabled: false,
      monthlyBudget: 5
    })
    
    vi.mocked(aiConfigModule.saveAIConfig).mockResolvedValue(undefined)
    vi.mocked(aiConfigModule.validateApiKey).mockImplementation(
      (provider, key) => {
        if (!key || key.length < 10) return false
        switch (provider) {
          case "openai":
            return key.startsWith("sk-")
          case "anthropic":
            return key.startsWith("sk-ant-")
          case "deepseek":
            return key.length > 20
          default:
            return false
        }
      }
    )
  })
  
  describe("渲染", () => {
    it("应该渲染 AI 配置界面", () => {
      render(<AIConfig />)
      
      expect(screen.getByText(/AI Configuration/)).toBeInTheDocument()
      expect(screen.getByLabelText("AI Provider")).toBeInTheDocument()
    })
    
    it("应该显示所有提供商选项", async () => {
      render(<AIConfig />)
      
      // 等待组件加载完成
      await waitFor(() => {
        expect(screen.getByLabelText("AI Provider")).toBeInTheDocument()
      })
      
      const select = screen.getByLabelText("AI Provider")
      
      // 检查选项（Phase 10: OpenAI 和 Anthropic 临时禁用）
      expect(screen.getByRole("option", { name: /None \(AI Disabled\)/ })).toBeInTheDocument()
      expect(screen.getByRole("option", { name: /OpenAI.*Temporarily Unavailable/ })).toBeInTheDocument()
      expect(screen.getByRole("option", { name: /Anthropic.*Temporarily Unavailable/ })).toBeInTheDocument()
      expect(screen.getByRole("option", { name: /DeepSeek/ })).toBeInTheDocument()
    })
  })
  
  describe("Provider 选择", () => {
    it("选择 Provider 后应该显示 API Key 输入框", async () => {
      render(<AIConfig />)
      
      const select = screen.getByLabelText("AI Provider")
      
      // 初始状态：不显示 API Key 输入
      expect(screen.queryByLabelText("API Key")).not.toBeInTheDocument()
      
      // 选择 DeepSeek
      fireEvent.change(select, { target: { value: "deepseek" } })
      
      // 应该显示 API Key 输入框
      expect(screen.getByLabelText("API Key")).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/Enter your API Key/)).toBeInTheDocument()
    })
    
    it("选择 Provider 后应该显示提供商说明", () => {
      render(<AIConfig />)
      
      const select = screen.getByLabelText("AI Provider")
      
      // 选择 DeepSeek
      fireEvent.change(select, { target: { value: "deepseek" } })
      
      expect(screen.getByText(/Domestically friendly/)).toBeInTheDocument()
    })
    
    it("选择 Provider 后应该显示预算控制", () => {
      render(<AIConfig />)
      
      const select = screen.getByLabelText("AI Provider")
      
      // 选择 DeepSeek
      fireEvent.change(select, { target: { value: "deepseek" } })
      
      expect(screen.getByLabelText(/Monthly budget limit/)).toBeInTheDocument()
    })
  })
  
  describe("配置保存", () => {
    it("应该保存配置到 chrome.storage.sync", async () => {
      render(<AIConfig />)
      
      // 选择 DeepSeek
      const select = screen.getByLabelText("AI Provider")
      fireEvent.change(select, { target: { value: "deepseek" } })
      
      // 输入 API Key
      const apiKeyInput = screen.getByLabelText("API Key")
      fireEvent.change(apiKeyInput, { target: { value: "sk-test-123456" } })
      
      // 点击保存
      const saveButton = screen.getByText("Save Configuration")
      fireEvent.click(saveButton)
      
      // 等待保存完成
      await waitFor(() => {
        expect(aiConfigModule.saveAIConfig).toHaveBeenCalledWith({
          provider: "deepseek",
          apiKey: "sk-test-123456",
          enabled: true,
          monthlyBudget: 5,
          enableReasoning: false
        })
      })
      
      // 应该显示成功消息
      expect(screen.getByText(/Configuration saved successfully!/)).toBeInTheDocument()
    })
    
    it("API Key 为空时保存按钮应该被禁用", async () => {
      render(<AIConfig />)
      
      // 选择 DeepSeek
      const select = screen.getByLabelText("AI Provider")
      fireEvent.change(select, { target: { value: "deepseek" } })
      
      // 不输入 API Key
      const saveButton = screen.getByText("Save Configuration")
      
      // 保存按钮应该被禁用
      expect(saveButton).toBeDisabled()
      
      // 点击不应该有反应
      fireEvent.click(saveButton)
      expect(aiConfigModule.saveAIConfig).not.toHaveBeenCalled()
    })
  })
  
  describe("测试连接", () => {
    it("应该验证 DeepSeek API Key 格式", async () => {
      const { aiManager } = await import("@/core/ai/AICapabilityManager")
      
      // Mock 成功的连接测试
      vi.mocked(aiManager.initialize).mockResolvedValue(undefined)
      vi.mocked(aiManager.testConnection).mockResolvedValue({
        success: true,
        message: "Connection successful! DeepSeek API works normally",
        latency: 123
      })
      vi.mocked(aiConfigModule.validateApiKey).mockReturnValue(true)
      
      render(<AIConfig />)
      
      // 选择 DeepSeek
      const select = screen.getByLabelText("AI Provider")
      fireEvent.change(select, { target: { value: "deepseek" } })
      
      // 输入正确格式的 API Key
      const apiKeyInput = screen.getByLabelText("API Key")
      fireEvent.change(apiKeyInput, { target: { value: "sk-test-123456" } })
      
      // 点击测试连接
      const testButton = screen.getByText("Test connection")
      fireEvent.click(testButton)
      
      // 应该显示连接成功
      await waitFor(() => {
        expect(screen.getByText(/Connection successful!/)).toBeInTheDocument()
      })
      // 检查延迟信息（mock环境中可能是0ms）
      expect(screen.getByText(/\d+ms/)).toBeInTheDocument()
    })
    
    // Phase 10: Anthropic 测试已移除（临时禁用供应商）
    
    it("API Key 格式错误时应该提示", async () => {
      render(<AIConfig />)
      
      // 选择 DeepSeek
      const select = screen.getByLabelText("AI Provider")
      fireEvent.change(select, { target: { value: "deepseek" } })
      
      // 输入错误格式的 API Key（不以 sk- 开头）
      const apiKeyInput = screen.getByLabelText("API Key")
      fireEvent.change(apiKeyInput, { target: { value: "wrong-key" } })
      
      // 点击测试连接
      const testButton = screen.getByText("Test connection")
      fireEvent.click(testButton)
      
      // 应该显示格式错误
      await waitFor(() => {
        expect(screen.getByText(/format is incorrect/)).toBeInTheDocument()
      })
    })
  })
  
  describe("加载配置", () => {
    it("应该加载已保存的配置", async () => {
      vi.mocked(aiConfigModule.getAIConfig).mockResolvedValue({
        provider: "deepseek",
        apiKey: "sk-saved-key",
        enabled: true,
        monthlyBudget: 10
      })
      
      render(<AIConfig />)
      
      // 等待配置加载
      await waitFor(() => {
        const select = screen.getByLabelText("AI Provider") as HTMLSelectElement
        expect(select.value).toBe("deepseek")
      })
      
      // 检查 API Key（password 类型看不到值，但输入框应该存在）
      expect(screen.getByLabelText("API Key")).toBeInTheDocument()
      
      // 检查预算
      const budgetInput = screen.getByLabelText(/Monthly budget limit/) as HTMLInputElement
      expect(budgetInput.value).toBe("10")
    })
  })
  
  describe("禁用 AI", () => {
    it("应该禁用已配置的 AI", async () => {
      vi.mocked(aiConfigModule.getAIConfig).mockResolvedValue({
        provider: "deepseek",
        apiKey: "sk-saved-key",
        enabled: true,
        monthlyBudget: 10,
        enableReasoning: false
      })
      
      render(<AIConfig />)
      
      // 等待配置加载
      await waitFor(() => {
        expect(screen.getByLabelText("API Key")).toBeInTheDocument()
      })
      
      // 点击禁用 AI
      const disableButton = screen.getByText("Disable AI")
      fireEvent.click(disableButton)
      
      // 验证 saveAIConfig 被正确调用
      await waitFor(
        () => {
          expect(aiConfigModule.saveAIConfig).toHaveBeenCalledWith({
            provider: null,
            apiKey: "",
            enabled: false,
            monthlyBudget: 5,
            enableReasoning: false
          })
        },
        { timeout: 3000 }
      )
    })
  })
  
  describe("UI 提示", () => {
    it("应该显示关于 AI 分析的提示信息", () => {
      render(<AIConfig />)
      
      expect(screen.getByText(/About AI Analysis/)).toBeInTheDocument()
      expect(screen.getByText(/After configuration/)).toBeInTheDocument()
      expect(screen.getByText(/Not configured/)).toBeInTheDocument()
      expect(screen.getByText(/Downgrade strategy/)).toBeInTheDocument()
    })
    
    })
})  