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

    it('应当合并 openai 与 legacy 返回的模型列表', async () => {
      mockFetch
        .mockResolvedValueOnce(createResponse({ data: [{ id: 'phi3' }] }))
        .mockResolvedValueOnce(createResponse({ models: [{ name: 'qwen2.5:7b' }] }))

      const result = await listLocalModels('http://localhost:11434/v1')

      expect(result.mode).toBe('openai')
      expect(result.models).toHaveLength(2)
      expect(result.models.map(model => model.id)).toEqual(['phi3', 'qwen2.5:7b'])
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('应去重重复模型', async () => {
      mockFetch
        .mockResolvedValueOnce(createResponse({ data: [{ id: 'qwen2.5:7b' }] }))
        .mockResolvedValueOnce(createResponse({ models: [{ name: 'qwen2.5:7b', details: { parameter_size: '7B' } }] }))

      const result = await listLocalModels('http://localhost:11434/v1')

      expect(result.models).toHaveLength(1)
      expect(result.models[0].id).toBe('qwen2.5:7b')
    })

    it('两个端点都不可用时应抛出错误', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

      await expect(listLocalModels('http://localhost:11434/v1')).rejects.toThrow('ECONNREFUSED')
      expect(mockFetch).toHaveBeenCalledTimes(2)
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
