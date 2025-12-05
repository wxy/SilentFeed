import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OllamaProvider } from './OllamaProvider'

const createJsonResponse = (payload: any) => ({
  ok: true,
  json: async () => payload
})

describe('OllamaProvider', () => {
  const mockFetch = vi.fn()
  ;(globalThis as any).fetch = mockFetch

  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('legacy 接口 403 时应自动回退到 /api/generate', async () => {
    const provider = new OllamaProvider({
      apiKey: 'local',
      endpoint: 'http://localhost:11434',
      model: 'qwen2.5:7b'
    })

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden'
      })
      .mockResolvedValueOnce(createJsonResponse({
        model: 'qwen2.5:7b',
        response: '{"topics":{"技术":0.7,"教程":0.3}}',
        prompt_eval_count: 120,
        eval_count: 60
      }))

    const result = await provider.analyzeContent('测试文章内容')

    expect(result.topicProbabilities['技术']).toBeCloseTo(0.7, 5)
    expect(result.topicProbabilities['教程']).toBeCloseTo(0.3, 5)
    expect(mockFetch).toHaveBeenNthCalledWith(1,
      'http://localhost:11434/api/chat',
      expect.objectContaining({ method: 'POST' })
    )
    expect(mockFetch).toHaveBeenNthCalledWith(2,
      'http://localhost:11434/api/generate',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('失败时应在错误信息中包含请求详情', async () => {
    const provider = new OllamaProvider({
      apiKey: 'local',
      endpoint: 'http://localhost:11434',
      model: 'qwen2.5:7b'
    })

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Error'
    })

    let thrown: Error | null = null
    try {
      await provider.analyzeContent('测试请求')
    } catch (error) {
      thrown = error as Error
    }

    expect(thrown).not.toBeNull()
    expect(thrown?.message).toMatch(/http:\/\/localhost:11434\/api\/chat/)
    expect(thrown?.message).toMatch(/参数/)
  })

  it('isAvailable 应检测 /api/tags 返回模型列表', async () => {
    const provider = new OllamaProvider({ apiKey: 'local', endpoint: 'http://localhost:11434', model: 'qwen2.5:7b' })
    mockFetch.mockResolvedValueOnce(createJsonResponse({ models: [{ name: 'qwen2.5:7b' }, { name: 'llama3' }] }))
    const ok = await provider.isAvailable()
    expect(ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/api/tags', expect.any(Object))
  })

  it("handles reasoning truncation with finish_reason='length' (content empty)", async () => {
    const provider = new OllamaProvider({ baseURL: "http://localhost:11434", model: "qwen2.5" })
    // 模拟 OpenAI 兼容端点返回带 reasoning 且被截断
    const responseBody = {
      id: "cmpl-1",
      choices: [
        {
          finish_reason: "length",
          message: {
            content: "",
            reasoning: "这是推理内容，但被截断了……"
          }
        }
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
    }
    vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(responseBody), { status: 200 }))
    await expect(
      provider.callOpenAICompatibleAPI({ messages: [{ role: "user", content: "给我一个 JSON" }] })
    ).rejects.toThrow()
  })

  it("errors on empty choices in OpenAI compatible API", async () => {
    const provider = new OllamaProvider({ baseURL: "http://localhost:11434", model: "qwen2.5" })
    const responseBody = { id: "cmpl-2", choices: [], usage: { total_tokens: 0 } }
    vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(responseBody), { status: 200 }))
    await expect(provider.callOpenAICompatibleAPI({ messages: [{ role: "user", content: "测试" }] })).rejects.toThrow()
  })

  it("falls back from /api/chat (403) to /api/generate on failure", async () => {
    const provider = new OllamaProvider({ baseURL: "http://localhost:11434", model: "llama3" })
    // 第一次调用 chat 返回 500，触发回退
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response("forbidden", { status: 403 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ response: "{\"ok\":true}", eval_count: 42, prompt_eval_count: 10 }),
          { status: 200 }
        )
      )
    const result = await provider.callLegacyAPI({ prompt: "返回一个 JSON" })
    expect(result.content).toContain("ok")
    expect(result.tokensUsed.output).toBe(42)
  })

  it('testConnection 应通过 /api/tags 快速探测并返回成功', async () => {
    const provider = new OllamaProvider({ apiKey: 'local', endpoint: 'http://localhost:11434', model: 'qwen2.5:7b' })
    // /api/tags 成功返回模型列表
    mockFetch.mockResolvedValueOnce(createJsonResponse({ models: [{ name: 'qwen2.5:7b' }] }))
    const res = await provider.testConnection()
    expect(res.success).toBe(true)
    expect(mockFetch).toHaveBeenNthCalledWith(1, 'http://localhost:11434/api/tags', expect.any(Object))
  })

  it('OpenAI 兼容端点应走 /v1/chat/completions', async () => {
    const provider = new OllamaProvider({ apiKey: 'local', endpoint: 'http://localhost:11434/v1', model: 'qwen2.5:7b' })
    mockFetch.mockResolvedValueOnce(createJsonResponse({ choices: [{ message: { content: '{"topics":{"技术":0.6}}' } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }))
    const result = await provider.analyzeContent('内容')
    expect(result.topicProbabilities['技术']).toBeGreaterThan(0)
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/v1/chat/completions', expect.any(Object))
  })
})
