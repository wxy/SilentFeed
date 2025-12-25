import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  getAIConfig,
  saveAIConfig,
  deleteAIConfig,
  isAIConfigured,
  validateApiKey,
  getProviderDisplayName,
  getProviderEndpoint,
  getProviderModel,
  getEngineAssignment,
  saveEngineAssignment,
  type AIConfig
} from "./ai-config"
import { AI_ENGINE_PRESETS, type AIEngineAssignment } from "@/types/ai-engine-assignment"

// Mock chrome.storage.sync with persistent storage
const mockStorage: Record<string, any> = {}
const mockChromeStorage = {
  sync: {
    get: vi.fn((keys?: string | string[]) => {
      if (!keys) {
        return Promise.resolve(mockStorage)
      }
      if (typeof keys === 'string') {
        return Promise.resolve({ [keys]: mockStorage[keys] })
      }
      const result: Record<string, any> = {}
      keys.forEach((key) => {
        if (key in mockStorage) {
          result[key] = mockStorage[key]
        }
      })
      return Promise.resolve(result)
    }),
    set: vi.fn((items: Record<string, any>) => {
      Object.assign(mockStorage, items)
      return Promise.resolve(undefined)
    }),
    remove: vi.fn((keys: string | string[]) => {
      const keysArray = typeof keys === 'string' ? [keys] : keys
      keysArray.forEach((key) => delete mockStorage[key])
      return Promise.resolve(undefined)
    })
  }
}

global.chrome = {
  runtime: {
    id: 'test-extension-id-12345'
  },
  storage: mockChromeStorage
} as any

describe("ai-config", () => {
  beforeEach(() => {
    // 清空模拟存储
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key])
    
    // 重置所有 mock 实现（确保每个测试独立）
    vi.clearAllMocks()
    
    // 恢复 mock 的默认实现
    mockChromeStorage.sync.get.mockImplementation((keys?: string | string[]) => {
      if (!keys) {
        return Promise.resolve(mockStorage)
      }
      if (typeof keys === 'string') {
        return Promise.resolve({ [keys]: mockStorage[keys] })
      }
      const result: Record<string, any> = {}
      keys.forEach((key) => {
        if (key in mockStorage) {
          result[key] = mockStorage[key]
        }
      })
      return Promise.resolve(result)
    })
    
    mockChromeStorage.sync.set.mockImplementation((items: Record<string, any>) => {
      Object.assign(mockStorage, items)
      return Promise.resolve(undefined)
    })
    
    mockChromeStorage.sync.remove.mockImplementation((keys: string | string[]) => {
      const keysArray = typeof keys === 'string' ? [keys] : keys
      keysArray.forEach((key) => delete mockStorage[key])
      return Promise.resolve(undefined)
    })
  })
  
  describe("getAIConfig", () => {
    it("应该返回默认配置（未配置时）", async () => {
      mockChromeStorage.sync.get.mockResolvedValue({})
      
      const config = await getAIConfig()
      
      expect(config).toEqual({
        providers: {},
        providerBudgets: {},
        local: {
          enabled: false,
          provider: "ollama",
          endpoint: "http://localhost:11434/v1",
          model: "", // 不再硬编码，用户需要配置或动态查询
          apiKey: "ollama",
          temperature: 0.2,
          maxOutputTokens: 768,
          timeoutMs: 60000, // Phase 12.6: 默认 60s
          reasoningTimeoutMs: 180000 // Phase 12.6: 默认 180s
        },
        engineAssignment: AI_ENGINE_PRESETS.intelligence.config,
        // Phase 12: Provider 偏好设置默认值
        preferredRemoteProvider: "deepseek",
        preferredLocalProvider: "ollama"
      })
    })
    
    it("应该读取已保存的配置", async () => {
      const savedConfig: AIConfig = {
        providers: {
          openai: {
            apiKey: btoa("sk-test-123"),
            model: "gpt-4o-mini"
          }
        },
        providerBudgets: {
          openai: 10
        },
        local: {
          enabled: false,
          provider: "ollama",
          endpoint: "http://localhost:11434/v1",
          model: "llama2",
          apiKey: "ollama",
          temperature: 0.2,
          maxOutputTokens: 768,
          timeoutMs: 45000
        },
        engineAssignment: AI_ENGINE_PRESETS.intelligence.config
      }
      
      mockChromeStorage.sync.get.mockResolvedValue({
        aiConfig: savedConfig
      })
      
      const config = await getAIConfig()
      
      expect(config.providers.openai?.apiKey).toBe("sk-test-123") // 应该解密
      expect(config.providers.openai?.model).toBe("gpt-4o-mini")
    })
    
    it("应该处理加载失败的情况", async () => {
      mockChromeStorage.sync.get.mockRejectedValue(new Error("Storage error"))
      
      const config = await getAIConfig()
      
      // 应该返回默认配置
      expect(config.providers).toEqual({})
    })
  })
  
  describe("saveAIConfig", () => {
    it("应该保存配置并加密 API Key", async () => {
      const config: AIConfig = {
        providers: {
          openai: {
            apiKey: "sk-test-123",
            model: "gpt-4o-mini"
          }
        },
        globalMonthlyBudget: 10,
        providerBudgets: {
          openai: 10
        },
        local: {
          enabled: false,
          provider: "ollama",
          endpoint: "http://localhost:11434/v1",
          model: "llama2",
          apiKey: "ollama",
          temperature: 0.2,
          maxOutputTokens: 768,
          timeoutMs: 45000
        },
        engineAssignment: AI_ENGINE_PRESETS.intelligence.config
      }
      
      await saveAIConfig(config)
      
      // 验证调用了 chrome.storage.sync.set
      expect(mockChromeStorage.sync.set).toHaveBeenCalled()
      
      // 验证 API Key 被加密（新格式：version:iv:ciphertext）
      const savedData = mockChromeStorage.sync.set.mock.calls[0][0]
      const encryptedKey = savedData.aiConfig.providers.openai.apiKey
      
      // 验证是新的加密格式
      expect(encryptedKey).toMatch(/^1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/)
      
      // 验证不是明文
      expect(encryptedKey).not.toBe("sk-test-123")
    })
    
    it("应该处理保存失败的情况", async () => {
      mockChromeStorage.sync.set.mockRejectedValue(new Error("Storage error"))
      
      const config: AIConfig = {
        providers: {
          openai: {
            apiKey: "sk-test-123",
            model: "gpt-4o-mini"
          }
        },
        globalMonthlyBudget: 10,
        providerBudgets: {
          openai: 10
        },
        local: {
          enabled: false,
          provider: "ollama",
          endpoint: "http://localhost:11434/v1",
          model: "llama2",
          apiKey: "ollama",
          temperature: 0.2,
          maxOutputTokens: 768,
          timeoutMs: 45000
        },
        engineAssignment: AI_ENGINE_PRESETS.intelligence.config
      }
      
      await expect(saveAIConfig(config)).rejects.toThrow()
    })
  })
  
  describe("deleteAIConfig", () => {
    it("应该删除配置", async () => {
      await deleteAIConfig()
      
      expect(mockChromeStorage.sync.remove).toHaveBeenCalledWith("aiConfig")
    })
  })
  
  describe("isAIConfigured", () => {
    it("未配置时应该返回 false", async () => {
      mockChromeStorage.sync.get.mockResolvedValue({})
      
      const configured = await isAIConfigured()
      
      expect(configured).toBe(false)
    })
    
    it("已配置时应该返回 true", async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        aiConfig: {
          providers: {
            openai: {
              apiKey: btoa("sk-test-123"),
              model: "gpt-4o-mini"
            }
          },
          globalMonthlyBudget: 5,
          local: {
            enabled: false,
            provider: "ollama",
            endpoint: "http://localhost:11434/v1",
            model: "llama2",
            apiKey: "ollama",
            temperature: 0.2,
            maxOutputTokens: 768,
            timeoutMs: 45000
          },
          engineAssignment: AI_ENGINE_PRESETS.intelligence.config
        }
      })
      
      const configured = await isAIConfigured()
      
      expect(configured).toBe(true)
    })
    
    it("未配置 provider 时应该返回 false", async () => {
      mockChromeStorage.sync.get.mockResolvedValue({
        aiConfig: {
          providers: {},
          globalMonthlyBudget: 5,
          local: {
            enabled: false,
            provider: "ollama",
            endpoint: "http://localhost:11434/v1",
            model: "llama2",
            apiKey: "ollama",
            temperature: 0.2,
            maxOutputTokens: 768,
            timeoutMs: 45000
          },
          engineAssignment: AI_ENGINE_PRESETS.intelligence.config
        }
      })
      
      const configured = await isAIConfigured()
      
      expect(configured).toBe(false)
    })
  })
  
  describe("validateApiKey", () => {
    it("应该验证 OpenAI API Key", () => {
      expect(validateApiKey("openai", "sk-test-123456789")).toBe(true)
      expect(validateApiKey("openai", "sk-proj-test-123")).toBe(true)
      expect(validateApiKey("openai", "invalid-key")).toBe(false)
      expect(validateApiKey("openai", "")).toBe(false)
    })
    
    it("应该验证 Anthropic API Key", () => {
      expect(validateApiKey("anthropic", "sk-ant-test-123456789")).toBe(true)
      expect(validateApiKey("anthropic", "sk-test-123")).toBe(false)
      expect(validateApiKey("anthropic", "")).toBe(false)
    })
    
    it("应该验证 DeepSeek API Key", () => {
      // DeepSeek API Key 格式: sk-xxx，长度 > 20
      // 注：chat 和 reasoner 模型使用相同的 API Key
      expect(validateApiKey("deepseek", "sk-" + "a".repeat(25))).toBe(true)
      expect(validateApiKey("deepseek", "sk-short")).toBe(false) // 长度不够
      expect(validateApiKey("deepseek", "no-prefix-key")).toBe(false) // 没有 sk- 前缀
      expect(validateApiKey("deepseek", "")).toBe(false)
    })
  })
  
  describe("getProviderDisplayName", () => {
    it("应该返回正确的显示名称", () => {
      expect(getProviderDisplayName("openai")).toBe("OpenAI (GPT-4o-mini)")
      expect(getProviderDisplayName("anthropic")).toBe(
        "Anthropic (Claude-3-Haiku)"
      )
      expect(getProviderDisplayName("deepseek")).toBe("DeepSeek")
      expect(getProviderDisplayName(null)).toBe("未配置")
    })
  })
  
  describe("getProviderEndpoint", () => {
    it("应该返回正确的 API 端点", () => {
      expect(getProviderEndpoint("openai")).toBe(
        "https://api.openai.com/v1/chat/completions"
      )
      expect(getProviderEndpoint("anthropic")).toBe(
        "https://api.anthropic.com/v1/messages"
      )
      expect(getProviderEndpoint("deepseek")).toBe(
        "https://api.deepseek.com/v1/chat/completions"
      )
    })
  })
  
  describe("getProviderModel", () => {
    it("应该返回正确的模型名称", () => {
      expect(getProviderModel("openai")).toBe("gpt-4o-mini")
      expect(getProviderModel("anthropic")).toBe("claude-3-haiku-20240307")
      expect(getProviderModel("deepseek")).toBe("deepseek-chat")
    })
  })

  describe("Phase 11: 引擎分配", () => {
    describe("getEngineAssignment", () => {
      it("应该返回默认的引擎分配（智能优先）", async () => {
        mockChromeStorage.sync.get.mockResolvedValue({})
        
        const assignment = await getEngineAssignment()
        
        expect(assignment).toEqual(AI_ENGINE_PRESETS.intelligence.config)
      })

      it("应该返回已保存的引擎分配（补充缺失的默认字段）", async () => {
        const customAssignment: AIEngineAssignment = {
          pageAnalysis: { provider: "ollama", model: "llama2" },
          articleAnalysis: { provider: "ollama", model: "llama2" },
          profileGeneration: { provider: "deepseek", useReasoning: true },
          recommendation: { provider: "deepseek", useReasoning: false }
        }

        mockChromeStorage.sync.get.mockResolvedValue({
          aiConfig: {
            providers: {
              deepseek: {
                apiKey: "sk-test-key",
                model: "deepseek-chat"
              }
            },
            globalMonthlyBudget: 5,
            local: {
              enabled: true,
              provider: "ollama",
              endpoint: "http://localhost:11434/v1",
              model: "llama2",
              apiKey: "ollama",
              temperature: 0.2,
              maxOutputTokens: 768,
              timeoutMs: 45000
            },
            engineAssignment: customAssignment
          }
        })
        
        const assignment = await getEngineAssignment()
        
        // 应该保留自定义配置，并补充缺失的 sourceAnalysis
        expect(assignment.pageAnalysis).toEqual(customAssignment.pageAnalysis)
        expect(assignment.articleAnalysis).toEqual(customAssignment.articleAnalysis)
        expect(assignment.profileGeneration).toEqual(customAssignment.profileGeneration)
        expect(assignment.sourceAnalysis).toBeDefined() // 补充默认值
      })

      it("旧配置迁移时应该使用默认引擎分配", async () => {
        // 模拟旧配置（没有 engineAssignment 字段）
        mockChromeStorage.sync.get.mockResolvedValue({
          aiConfig: {
            providers: {
              deepseek: {
                apiKey: "c2stdGVzdC1rZXk=",
                model: "deepseek-chat"
              }
            },
            globalMonthlyBudget: 5,
            local: {
              enabled: false,
              provider: "ollama",
              endpoint: "http://localhost:11434/v1",
              model: "llama2",
              apiKey: "ollama",
              temperature: 0.2,
              maxOutputTokens: 768,
              timeoutMs: 45000
            }
          }
        })
        
        const assignment = await getEngineAssignment()
        
        // 应该返回默认的智能优先方案
        expect(assignment).toEqual(AI_ENGINE_PRESETS.intelligence.config)
      })
    })

    describe("saveEngineAssignment", () => {
      it("应该保存引擎分配到配置", async () => {
        const existingConfig: AIConfig = {
          providers: {
            deepseek: {
              apiKey: "test-key",
              model: "deepseek-chat"
            }
          },
          globalMonthlyBudget: 10,
          local: {
            enabled: false,
            provider: "ollama",
            endpoint: "http://localhost:11434/v1",
            model: "llama2",
            temperature: 0.2,
            maxOutputTokens: 768,
            timeoutMs: 45000
          },
          engineAssignment: AI_ENGINE_PRESETS.intelligence.config
        }

        mockChromeStorage.sync.get.mockResolvedValue({
          aiConfig: existingConfig
        })

        const newAssignment = AI_ENGINE_PRESETS.privacy.config

        await saveEngineAssignment(newAssignment)

        expect(mockChromeStorage.sync.set).toHaveBeenCalledWith({
          aiConfig: expect.objectContaining({
            engineAssignment: newAssignment
          })
        })
      })

      it("应该保留其他配置字段", async () => {
        const existingConfig: AIConfig = {
          providers: {
            deepseek: {
              apiKey: "test-key",
              model: "deepseek-chat",
              enableReasoning: true
            }
          },
          globalMonthlyBudget: 10,
          local: {
            enabled: true,
            provider: "ollama",
            endpoint: "http://localhost:11434/v1",
            model: "llama2",
            temperature: 0.3,
            maxOutputTokens: 1024,
            timeoutMs: 60000
          },
          engineAssignment: AI_ENGINE_PRESETS.intelligence.config
        }

        mockChromeStorage.sync.get.mockResolvedValue({
          aiConfig: existingConfig
        })

        const newAssignment = AI_ENGINE_PRESETS.economic.config

        await saveEngineAssignment(newAssignment)

        expect(mockChromeStorage.sync.set).toHaveBeenCalledWith({
          aiConfig: expect.objectContaining({
            globalMonthlyBudget: 10,
            engineAssignment: newAssignment
          })
        })
      })
    })
  })
  
  // Phase 12.4: 双层预算配置测试
  describe('预算配置', () => {
    it('应该支持全局预算和 provider 预算配置', async () => {
      const config: AIConfig = {
        providers: {
          openai: {
            apiKey: 'sk-test-openai',
            model: 'gpt-5-mini'
          },
          deepseek: {
            apiKey: 'sk-test-deepseek',
            model: 'deepseek-chat'
          }
        },
        globalMonthlyBudget: 10,
        providerBudgets: {
          openai: 6,
          deepseek: 4
        },
        local: {
          enabled: false,
          provider: 'ollama',
          endpoint: 'http://localhost:11434/v1',
          model: '',
          apiKey: 'ollama',
          temperature: 0.2,
          maxOutputTokens: 768,
          timeoutMs: 45000
        },
        engineAssignment: AI_ENGINE_PRESETS.intelligence.config
      }
      
      await saveAIConfig(config)
      
      const savedCall = mockChromeStorage.sync.set.mock.calls[0][0]
      expect(savedCall.aiConfig.globalMonthlyBudget).toBe(10)
      expect(savedCall.aiConfig.providerBudgets).toEqual({
        openai: 6,
        deepseek: 4
      })
    })
    
    it('应该自动迁移旧的 monthlyBudget 到 globalMonthlyBudget', async () => {
      const oldConfig = {
        providers: {
          openai: {
            apiKey: btoa('sk-test-123'),
            model: 'gpt-5-mini'
          },
          deepseek: {
            apiKey: btoa('sk-test-456'),
            model: 'deepseek-chat'
          }
        },
        monthlyBudget: 10, // 旧字段
        local: {
          enabled: false,
          provider: 'ollama',
          endpoint: 'http://localhost:11434/v1',
          model: '',
          apiKey: 'ollama'
        },
        engineAssignment: AI_ENGINE_PRESETS.intelligence.config
      }
      
      mockChromeStorage.sync.get.mockResolvedValue({
        aiConfig: oldConfig
      })
      
      const config = await getAIConfig()
      
      // 应该迁移到 globalMonthlyBudget
      expect(config.globalMonthlyBudget).toBe(10)
      
      // 应该自动为 providers 分配预算（平均分配）
      expect(config.providerBudgets).toEqual({
        openai: 5,
        deepseek: 5
      })
    })
    
    it('应该在没有 provider 时正确迁移预算', async () => {
      const oldConfig = {
        providers: {},
        monthlyBudget: 10,
        local: {
          enabled: false,
          provider: 'ollama',
          endpoint: 'http://localhost:11434/v1',
          model: ''
        },
        engineAssignment: AI_ENGINE_PRESETS.intelligence.config
      }
      
      mockChromeStorage.sync.get.mockResolvedValue({
        aiConfig: oldConfig
      })
      
      const config = await getAIConfig()
      
      expect(config.globalMonthlyBudget).toBe(10)
      expect(config.providerBudgets).toEqual({}) // 没有 provider，不分配
    })
    
    it('应该优先使用新的 globalMonthlyBudget（如果同时存在）', async () => {
      const config = {
        providers: {},
        globalMonthlyBudget: 15,
        monthlyBudget: 10, // 旧字段
        providerBudgets: {},
        local: {
          enabled: false,
          provider: 'ollama',
          endpoint: 'http://localhost:11434/v1',
          model: ''
        },
        engineAssignment: AI_ENGINE_PRESETS.intelligence.config
      }
      
      mockChromeStorage.sync.get.mockResolvedValue({
        aiConfig: config
      })
      
      const loaded = await getAIConfig()
      
      expect(loaded.globalMonthlyBudget).toBe(15) // 使用新字段
    })
  })
  
  describe("Timeout Configuration (Phase 12.6)", () => {
    it("应该保存和加载超时配置", async () => {
      const config: AIConfig = {
        providers: {
          openai: {
            apiKey: "test-key",
            model: "gpt-5-mini",
            timeoutMs: 90000,
            reasoningTimeoutMs: 180000
          },
          deepseek: {
            apiKey: "test-key-2",
            model: "deepseek-chat",
            timeoutMs: 45000,
            reasoningTimeoutMs: 150000
          }
        },
        providerBudgets: {},
        local: {
          enabled: false,
          provider: "ollama",
          endpoint: "http://localhost:11434/v1",
          model: "",
          apiKey: "ollama",
          temperature: 0.2,
          maxOutputTokens: 768,
          timeoutMs: 45000
        },
        engineAssignment: AI_ENGINE_PRESETS.intelligence.config
      }
      
      await saveAIConfig(config)
      const loaded = await getAIConfig()
      
      expect(loaded.providers.openai?.timeoutMs).toBe(90000)
      expect(loaded.providers.openai?.reasoningTimeoutMs).toBe(180000)
      expect(loaded.providers.deepseek?.timeoutMs).toBe(45000)
      expect(loaded.providers.deepseek?.reasoningTimeoutMs).toBe(150000)
    })
    
    it("未配置超时时应返回 undefined（使用默认值）", async () => {
      const config: AIConfig = {
        providers: {
          deepseek: {
            apiKey: "test-key",
            model: "deepseek-chat"
            // 未设置 timeoutMs
          }
        },
        providerBudgets: {},
        local: {
          enabled: false,
          provider: "ollama",
          endpoint: "http://localhost:11434/v1",
          model: "",
          apiKey: "ollama",
          temperature: 0.2,
          maxOutputTokens: 768,
          timeoutMs: 45000
        },
        engineAssignment: AI_ENGINE_PRESETS.intelligence.config
      }
      
      await saveAIConfig(config)
      const loaded = await getAIConfig()
      
      // 应该回退到 undefined（在 Provider 调用时使用默认值）
      expect(loaded.providers.deepseek?.timeoutMs).toBeUndefined()
      expect(loaded.providers.deepseek?.reasoningTimeoutMs).toBeUndefined()
    })
    
    it("应该支持只配置部分超时", async () => {
      const config: AIConfig = {
        providers: {
          openai: {
            apiKey: "test-key",
            model: "gpt-5-mini",
            timeoutMs: 75000
            // 未设置 reasoningTimeoutMs
          }
        },
        providerBudgets: {},
        local: {
          enabled: false,
          provider: "ollama",
          endpoint: "http://localhost:11434/v1",
          model: "",
          apiKey: "ollama",
          temperature: 0.2,
          maxOutputTokens: 768,
          timeoutMs: 45000
        },
        engineAssignment: AI_ENGINE_PRESETS.intelligence.config
      }
      
      await saveAIConfig(config)
      const loaded = await getAIConfig()
      
      expect(loaded.providers.openai?.timeoutMs).toBe(75000)
      expect(loaded.providers.openai?.reasoningTimeoutMs).toBeUndefined()
    })
  })
})

