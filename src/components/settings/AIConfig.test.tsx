import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { AIConfig } from "./AIConfig"
import * as aiConfigModule from "@/storage/ai-config"

// Mock ai-config 模块
vi.mock("@/storage/ai-config", () => ({
  getAIConfig: vi.fn(),
  saveAIConfig: vi.fn(),
  validateApiKey: vi.fn(),
  getEngineAssignment: vi.fn().mockResolvedValue(null),
  saveEngineAssignment: vi.fn().mockResolvedValue(undefined),
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

// Mock recommendation-config
vi.mock("@/storage/recommendation-config", () => ({
  checkLocalAIStatus: vi.fn().mockResolvedValue({
    hasChromeAI: false,
    hasOllama: false,
    available: false,
    availableServices: []
  }),
  getRecommendationConfig: vi.fn().mockResolvedValue({
    analysisEngine: 'remoteAI',
    feedAnalysisEngine: 'remoteAI',
    maxRecommendations: 3
  }),
  saveRecommendationConfig: vi.fn().mockResolvedValue(undefined)
}))

// Mock db
vi.mock("@/storage/db", () => ({
  getPageCount: vi.fn().mockResolvedValue(50)
}))

// Mock constants/progress
vi.mock("@/constants/progress", () => ({
  LEARNING_COMPLETE_PAGES: 100
}))

// Mock local-ai-endpoint
vi.mock("@/utils/local-ai-endpoint", () => ({
  listLocalModels: vi.fn().mockResolvedValue({
    mode: 'openai',
    models: []
  })
}))

// Mock analysis-engine-capability
vi.mock("@/utils/analysis-engine-capability", () => ({
  checkLocalAI: vi.fn().mockResolvedValue({
    available: false,
    reason: '测试环境不支持本地 AI 检测'
  }),
  checkEngineCapability: vi.fn(),
  checkAllEngineCapabilities: vi.fn(),
  getRecommendedEngine: vi.fn()
}))

// Mock AIConfigPanel
vi.mock("@/components/AIConfigPanel", () => ({
  AIConfigPanel: () => <div data-testid="ai-config-panel">AI Config Panel</div>
}))

// Mock AIEngineAssignment
vi.mock("@/components/settings/AIEngineAssignment", () => ({
  AIEngineAssignmentComponent: () => <div data-testid="ai-engine-assignment">AI Engine Assignment</div>
}))

describe("AIConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock getAIConfig 返回空配置
    vi.mocked(aiConfigModule.getAIConfig).mockResolvedValue({
      provider: null,
      apiKeys: {},
      enabled: false,
      monthlyBudget: 5,
      model: undefined,
      enableReasoning: false
    })
  })

  describe("基本渲染", () => {
    it("应该渲染 AIConfigPanel", () => {
      render(<AIConfig />)
      expect(screen.getByTestId("ai-config-panel")).toBeInTheDocument()
    })
  })
})
