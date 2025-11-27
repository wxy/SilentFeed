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
})
