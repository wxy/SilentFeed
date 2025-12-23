/**
 * AI 引擎分配类型测试
 */
import { describe, it, expect } from "vitest"
import {
  AI_ENGINE_PRESETS,
  getDefaultEngineAssignment,
  validateEngineConfig,
  validateEngineAssignment,
  getPresetDisplayInfo,
  type AIEngineAssignment,
  type AIEngineConfig
} from "./ai-engine-assignment"

describe("ai-engine-assignment", () => {
  describe("AI_ENGINE_PRESETS", () => {
    it("应该包含三个预设方案", () => {
      expect(Object.keys(AI_ENGINE_PRESETS)).toEqual([
        "privacy",
        "intelligence",
        "economic"
      ])
    })

    it("隐私优先方案应该全部使用本地AI", () => {
      const preset = AI_ENGINE_PRESETS.privacy
      // Phase 12: 使用 local 抽象而非硬编码 ollama
      expect(preset.config.pageAnalysis.provider).toBe("local")
      expect(preset.config.feedAnalysis.provider).toBe("local")
      expect(preset.config.profileGeneration.provider).toBe("local")
    })

    it("智能优先方案应该使用远程AI+推理", () => {
      const preset = AI_ENGINE_PRESETS.intelligence
      // Phase 12: 使用 remote 抽象而非硬编码 deepseek
      expect(preset.config.pageAnalysis.provider).toBe("remote")
      expect(preset.config.feedAnalysis.provider).toBe("remote")
      expect(preset.config.profileGeneration.provider).toBe("remote")
      expect(preset.config.profileGeneration.useReasoning).toBe(true)
    })

    it("经济优先方案应该使用远程AI标准模式", () => {
      const preset = AI_ENGINE_PRESETS.economic
      // Phase 12: 使用 remote 抽象而非硬编码 deepseek
      expect(preset.config.pageAnalysis.provider).toBe("remote")
      expect(preset.config.feedAnalysis.provider).toBe("remote")
      expect(preset.config.profileGeneration.provider).toBe("remote")
      expect(preset.config.profileGeneration.useReasoning).toBe(false)
    })

    it("智能优先方案应该标记为推荐", () => {
      expect(AI_ENGINE_PRESETS.intelligence.recommended).toBe(true)
      expect(AI_ENGINE_PRESETS.privacy.recommended).toBeUndefined()
      expect(AI_ENGINE_PRESETS.economic.recommended).toBeUndefined()
    })

    it("每个方案都应该有完整的元数据", () => {
      Object.values(AI_ENGINE_PRESETS).forEach(preset => {
        expect(preset.name).toBeTruthy()
        expect(preset.icon).toBeTruthy()
        expect(preset.description).toBeTruthy()
        expect(preset.estimatedCost).toBeTruthy()
        expect(preset.performanceImpact).toBeTruthy()
        expect(preset.benefits).toBeInstanceOf(Array)
        expect(preset.benefits.length).toBeGreaterThan(0)
        expect(preset.warnings).toBeInstanceOf(Array)
        expect(preset.warnings.length).toBeGreaterThan(0)
      })
    })
  })

  describe("getDefaultEngineAssignment", () => {
    it("应该返回智能优先方案", () => {
      const defaultAssignment = getDefaultEngineAssignment()
      expect(defaultAssignment).toEqual(AI_ENGINE_PRESETS.intelligence.config)
    })

    it("默认方案应该包含所有必需的任务配置", () => {
      const defaultAssignment = getDefaultEngineAssignment()
      expect(defaultAssignment.pageAnalysis).toBeDefined()
      expect(defaultAssignment.feedAnalysis).toBeDefined()
      expect(defaultAssignment.profileGeneration).toBeDefined()
      // sourceAnalysis 是可选的，但智能优先方案应该包含
      expect(defaultAssignment.sourceAnalysis).toBeDefined()
    })
  })

  describe("validateEngineConfig", () => {
    it("应该接受有效的引擎配置", () => {
      const validConfigs: AIEngineConfig[] = [
        { provider: "ollama", model: "qwen2.5:7b" },
        { provider: "deepseek" },
        { provider: "deepseek", useReasoning: true },
        { provider: "openai", model: "gpt-4o-mini" }
      ]

      validConfigs.forEach(config => {
        expect(validateEngineConfig(config)).toBe(true)
      })
    })

    it("应该拒绝无效的 provider", () => {
      const invalidConfig = { provider: "invalid" as any }
      expect(validateEngineConfig(invalidConfig)).toBe(false)
    })

    it("应该接受 ollama 不启用推理", () => {
      const validConfig: AIEngineConfig = {
        provider: "ollama",
        useReasoning: false
      }
      expect(validateEngineConfig(validConfig)).toBe(true)
    })
  })

  describe("validateEngineAssignment", () => {
    it("应该接受有效的引擎分配", () => {
      const validAssignments: AIEngineAssignment[] = [
        AI_ENGINE_PRESETS.privacy.config,
        AI_ENGINE_PRESETS.intelligence.config,
        AI_ENGINE_PRESETS.economic.config
      ]

      validAssignments.forEach(assignment => {
        expect(validateEngineAssignment(assignment)).toBe(true)
      })
    })

    it("应该接受自定义的有效配置", () => {
      const customAssignment: AIEngineAssignment = {
        pageAnalysis: { provider: "deepseek" },
        feedAnalysis: { provider: "ollama", model: "llama3.2:3b" },
        profileGeneration: { provider: "deepseek", useReasoning: true }
      }
      expect(validateEngineAssignment(customAssignment)).toBe(true)
    })

    it("应该拒绝包含无效 provider 的配置", () => {
      const invalidAssignment: AIEngineAssignment = {
        pageAnalysis: { provider: "invalid" as any },
        feedAnalysis: { provider: "deepseek" },
        profileGeneration: { provider: "deepseek" }
      }
      expect(validateEngineAssignment(invalidAssignment)).toBe(false)
    })
  })

  describe("getPresetDisplayInfo", () => {
    it("应该返回预设方案的显示信息", () => {
      const info = getPresetDisplayInfo("intelligence")
      expect(info.name).toBe("智能优先")
      expect(info.icon).toBe("🧠")
      expect(info.description).toBeTruthy()
      expect(info.recommended).toBe(true)
      expect(info.estimatedCost).toBeTruthy()
      expect(info.performanceImpact).toBeTruthy()
    })

    it("应该为每个预设返回正确的信息", () => {
      const presetNames = ["privacy", "intelligence", "economic"] as const
      presetNames.forEach(name => {
        const info = getPresetDisplayInfo(name)
        expect(info.name).toBeTruthy()
        expect(info.icon).toBeTruthy()
      })
    })

    it("隐私优先不应该标记为推荐", () => {
      const info = getPresetDisplayInfo("privacy")
      expect(info.recommended).toBeUndefined()
    })

    it("经济优先不应该标记为推荐", () => {
      const info = getPresetDisplayInfo("economic")
      expect(info.recommended).toBeUndefined()
    })
  })

  describe("预设方案成本对比", () => {
    it("隐私优先应该是零成本", () => {
      expect(AI_ENGINE_PRESETS.privacy.estimatedCost).toBe("¥0/月")
    })

    it("智能优先成本应该最高", () => {
      expect(AI_ENGINE_PRESETS.intelligence.estimatedCost).toBe("¥5-8/月")
    })

    it("经济优先成本应该最低（除了隐私）", () => {
      expect(AI_ENGINE_PRESETS.economic.estimatedCost).toBe("¥0.5-1/月")
    })
  })

  describe("预设方案性能影响对比", () => {
    it("隐私优先性能影响应该最高", () => {
      expect(AI_ENGINE_PRESETS.privacy.performanceImpact).toContain("高")
    })

    it("智能优先性能影响应该较低", () => {
      expect(AI_ENGINE_PRESETS.intelligence.performanceImpact).toContain("低")
    })

    it("经济优先性能影响应该为无", () => {
      expect(AI_ENGINE_PRESETS.economic.performanceImpact).toContain("无")
    })
  })

  describe("Phase 12: Provider 抽象类型", () => {
    it("validateEngineConfig 应该接受 remote 抽象类型", () => {
      const config: AIEngineConfig = {
        provider: "remote",
        useReasoning: false
      }
      expect(validateEngineConfig(config)).toBe(true)
    })

    it("validateEngineConfig 应该接受 local 抽象类型", () => {
      const config: AIEngineConfig = {
        provider: "local",
        useReasoning: false
      }
      expect(validateEngineConfig(config)).toBe(true)
    })

    it("validateEngineConfig 应该继续接受具体 Provider 类型（向后兼容）", () => {
      const configs: AIEngineConfig[] = [
        { provider: "deepseek", useReasoning: false },
        { provider: "openai", useReasoning: false },
        { provider: "ollama", useReasoning: false }
      ]
      configs.forEach(config => {
        expect(validateEngineConfig(config)).toBe(true)
      })
    })

    it("所有预设方案应该只使用 remote 或 local 抽象类型", () => {
      const abstractTypes = ["remote", "local"]
      Object.values(AI_ENGINE_PRESETS).forEach(preset => {
        const providers = [
          preset.config.pageAnalysis.provider,
          preset.config.feedAnalysis.provider,
          preset.config.profileGeneration.provider
        ]
        providers.forEach(provider => {
          expect(abstractTypes).toContain(provider)
        })
      })
    })
  })
})
