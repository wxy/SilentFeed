import { describe, it, expect, beforeEach, vi } from 'vitest'
import { buildLocalAIHeaders, listLocalModels, resolveLocalAIEndpoint } from './local-ai-endpoint'

describe('local-ai-endpoint 工具', () => {
  const mockFetch = vi.fn()
  ;(globalThis as any).fetch = mockFetch

  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe('resolveLocalAIEndpoint', () => {
    it('默认地址应优先使用 legacy 接口并提供 openai 兼容端点', () => {
      const resolved = resolveLocalAIEndpoint('http://localhost:11434')

      expect(resolved.mode).toBe('legacy')
      expect(resolved.legacy.chatUrl).toBe('http://localhost:11434/api/chat')
      expect(resolved.openai.chatUrl).toBe('http://localhost:11434/v1/chat/completions')
      expect(resolved.legacy.generateUrl).toBe('http://localhost:11434/api/generate')
    })

    it('以 /v1 结尾时应视为 openai 模式', () => {
      const resolved = resolveLocalAIEndpoint('http://localhost:11434/v1')

      expect(resolved.mode).toBe('openai')
      expect(resolved.chatUrl).toBe('http://localhost:11434/v1/chat/completions')
      expect(resolved.legacy.chatUrl).toBe('http://localhost:11434/api/chat')
    })
  })

  describe('listLocalModels', () => {
    const createResponse = (payload: any) => ({
      ok: true,
      json: async () => payload
    })

    it('应优先使用 openai 模式，成功后不再尝试 legacy', async () => {
      mockFetch
        .mockResolvedValueOnce(createResponse({ data: [{ id: 'phi3' }] }))

      const result = await listLocalModels('http://localhost:11434/v1')

      expect(result.mode).toBe('openai')
      expect(result.models).toHaveLength(1)
      expect(result.models[0].id).toBe('phi3')
      expect(mockFetch).toHaveBeenCalledTimes(1)  // 只调用一次
    })

    it('openai 失败时应回退到 legacy 模式', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('openai failed'))
        .mockResolvedValueOnce(createResponse({ models: [{ name: 'qwen2.5:7b' }] }))

      const result = await listLocalModels('http://localhost:11434/v1')

      expect(result.mode).toBe('legacy')
      expect(result.models).toHaveLength(1)
      expect(result.models[0].id).toBe('qwen2.5:7b')
      expect(mockFetch).toHaveBeenCalledTimes(2)  // 主模式 + 备用模式
    })

    it('两个端点都不可用时应抛出错误', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

      await expect(listLocalModels('http://localhost:11434/v1')).rejects.toThrow('无法从 Ollama 获取模型列表')
      expect(mockFetch).toHaveBeenCalledTimes(2)  // 主模式 + 备用模式
    })
  })

  describe('buildLocalAIHeaders', () => {
    it('openai 模式且无有效 token 时不附带 Authorization', () => {
      const headers = buildLocalAIHeaders('openai', 'ollama')
      expect(headers).toEqual({ 'Content-Type': 'application/json' })
    })

    it('openai 模式在提供自定义 token 时附带 Authorization', () => {
      const headers = buildLocalAIHeaders('openai', 'secret-token')
      expect(headers).toMatchObject({
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret-token'
      })
    })
  })
})
