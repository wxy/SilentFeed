import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { AIConfig } from "./AIConfig"
import * as aiConfigModule from "@/storage/ai-config"

// Mock ai-config 模块
vi.mock("@/storage/ai-config", () => ({
  getAIConfig: vi.fn(),
  saveAIConfig: vi.fn(),
  validateApiKey: vi.fn(),
  getProviderFromModel: vi.fn((modelId: string) => {
    if (modelId.startsWith("deepseek")) return "deepseek"
    if (modelId.startsWith("gpt-") || modelId.startsWith("o4-")) return "openai"
    if (modelId.startsWith("claude")) return "anthropic"
    return null
  }),
  AIProviderType: {} as any,
  AVAILABLE_MODELS: {
    deepseek: [
      { id: "deepseek-chat", name: "DeepSeek", description: "国内友好，支持推理模式（R1）", supportsReasoning: true, reasoningCostMultiplier: 1, costMultiplier: 1 }
    ],
    openai: [
      { id: "gpt-5-nano", name: "GPT-5 Nano", description: "最快最便宜，适合简单任务", supportsReasoning: false, costMultiplier: 0.2 },
      { id: "gpt-5-mini", name: "GPT-5 Mini", description: "平衡性能和成本（推荐）", supportsReasoning: false, costMultiplier: 1 },
      { id: "gpt-5", name: "GPT-5", description: "最强性能，成本较高", supportsReasoning: false, costMultiplier: 5 },
      { id: "o4-mini", name: "o4-mini", description: "推理模型，擅长复杂推理任务", supportsReasoning: true, reasoningCostMultiplier: 16, costMultiplier: 4 }
    ]
  }
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
      apiKeys: {},
      enabled: false,
      monthlyBudget: 5,
      model: undefined,
      enableReasoning: false
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
      expect(screen.getByLabelText("Select AI Model")).toBeInTheDocument()
    })
    
    it("应该显示所有提供商选项", async () => {
      render(<AIConfig />)
      
      // 等待组件加载完成
      await waitFor(() => {
        expect(screen.getByLabelText("Select AI Model")).toBeInTheDocument()
      })
      
      const select = screen.getByLabelText("Select AI Model")
      
      // 检查选项（现在是按模型分组）
      expect(screen.getByRole("option", { name: /Please select/ })).toBeInTheDocument()
      // DeepSeek 组
      expect(screen.getByRole("option", { name: /DeepSeek/ })).toBeInTheDocument()
      // OpenAI 组（包含多个模型）
      expect(screen.getByRole("option", { name: /GPT-5 Nano/ })).toBeInTheDocument()
      expect(screen.getByRole("option", { name: /GPT-5 Mini/ })).toBeInTheDocument()
    })
  })
  
  describe("Provider 选择", () => {
    it("选择 Provider 后应该显示 API Key 输入框", async () => {
      render(<AIConfig />)
      
      const select = screen.getByLabelText("Select AI Model")
      
      // 初始状态：不显示 API Key 输入
      expect(screen.queryByLabelText(/API Key/)).not.toBeInTheDocument()
      
      // 选择 DeepSeek 模型
      fireEvent.change(select, { target: { value: "deepseek-chat" } })
      
      // 应该显示 API Key 输入框（需要等待）
      await waitFor(() => {
        expect(screen.getByLabelText(/API Key/)).toBeInTheDocument()
      })
      expect(screen.getByPlaceholderText(/Enter your API Key/)).toBeInTheDocument()
    })
    
    it.skip("选择 Provider 后应该显示提供商说明", () => {
      // 注意：UI 改版后不再显示提供商说明，此测试暂时跳过
      render(<AIConfig />)
      
      const select = screen.getByLabelText("Select AI Model")
      
      // 选择 DeepSeek 模型
      fireEvent.change(select, { target: { value: "deepseek-chat" } })
      
      // 描述已国际化，测试英文版本
      expect(screen.getByText(/Affordable|domestic-friendly/i)).toBeInTheDocument()
    })
    
    it("选择 Provider 后应该显示预算控制", () => {
      render(<AIConfig />)
      
      const select = screen.getByLabelText("Select AI Model")
      
      // 选择 DeepSeek 模型
      fireEvent.change(select, { target: { value: "deepseek-chat" } })
      
      expect(screen.getByLabelText(/Monthly budget limit/)).toBeInTheDocument()
    })
  })
  
  describe("配置保存", () => {
    it("应该保存配置到 chrome.storage.sync", async () => {
      render(<AIConfig />)
      
      // 选择 DeepSeek 模型
      const select = screen.getByLabelText("Select AI Model")
      fireEvent.change(select, { target: { value: "deepseek-chat" } })
      
      // 等待 API Key 输入框渲染
      const apiKeyInput = await screen.findByLabelText(/API Key/)
      fireEvent.change(apiKeyInput, { target: { value: "sk-test-123456" } })
      
      // 点击保存
      const saveButton = screen.getByText("Save Configuration")
      fireEvent.click(saveButton)
      
      // 等待保存完成
      await waitFor(() => {
        expect(aiConfigModule.saveAIConfig).toHaveBeenCalledWith({
          provider: "deepseek",
          model: "deepseek-chat",
          apiKeys: {
            openai: "",
            deepseek: "sk-test-123456"
          },
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
      
      // 选择 DeepSeek 模型
      const select = screen.getByLabelText("Select AI Model")
      fireEvent.change(select, { target: { value: "deepseek-chat" } })
      
      // 等待 UI 渲染
      await screen.findByLabelText(/API Key/)
      
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
      
      // 选择 DeepSeek 模型
      const select = screen.getByLabelText("Select AI Model")
      fireEvent.change(select, { target: { value: "deepseek-chat" } })
      
      // 输入正确格式的 API Key
      const apiKeyInput = await screen.findByLabelText(/API Key/)
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
      
      // 选择 DeepSeek 模型
      const select = screen.getByLabelText("Select AI Model")
      fireEvent.change(select, { target: { value: "deepseek-chat" } })
      
      // 输入错误格式的 API Key（不以 sk- 开头）
      const apiKeyInput = await screen.findByLabelText(/API Key/)
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
        model: "deepseek-chat",
        apiKeys: {
          deepseek: "sk-saved-key"
        },
        enabled: true,
        monthlyBudget: 10,
        enableReasoning: false
      })
      
      render(<AIConfig />)
      
      // 等待配置加载和 UI 渲染
      await waitFor(() => {
        const select = screen.getByLabelText("Select AI Model") as HTMLSelectElement
        expect(select.value).toBe("deepseek-chat")
      })
      
      // 检查 API Key（password 类型看不到值，但输入框应该存在）
      await waitFor(() => {
        expect(screen.getByLabelText(/API Key/)).toBeInTheDocument()
      })
      
      // 检查预算
      const budgetInput = screen.getByLabelText(/Monthly budget limit/) as HTMLInputElement
      expect(budgetInput.value).toBe("10")
    })
  })
  
  describe("禁用 AI", () => {
    it("应该禁用已配置的 AI", async () => {
      vi.mocked(aiConfigModule.getAIConfig).mockResolvedValue({
        model: "deepseek-chat",
        apiKeys: {
          deepseek: "sk-saved-key"
        },
        enabled: true,
        monthlyBudget: 10,
        enableReasoning: false
      })
      
      render(<AIConfig />)
      
      // 等待配置加载
      await waitFor(() => {
        expect(screen.getByLabelText(/API Key/)).toBeInTheDocument()
      })
      
      // 点击禁用 AI
      const disableButton = screen.getByText("Disable AI")
      fireEvent.click(disableButton)
      
      // 验证 saveAIConfig 被正确调用
      await waitFor(
        () => {
          expect(aiConfigModule.saveAIConfig).toHaveBeenCalledWith({
            provider: null,
            model: undefined,
            apiKeys: {},
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