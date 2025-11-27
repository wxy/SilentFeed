/**
 * Ollama 连接测试工具
 * 
 * 用于验证 Origin Bridge 是否正常工作
 * 
 * 使用方法：
 * 1. 在浏览器控制台中导入此模块
 * 2. 调用 testOllamaConnection()
 */

import { logger } from "@/utils/logger"

const testLogger = logger.withTag("OllamaTest")

interface TestResult {
  success: boolean
  message: string
  details?: any
}

/**
 * 测试 Ollama 连接（模型列表）
 */
export async function testOllamaModels(): Promise<TestResult> {
  const endpoints = [
    { name: "OpenAI 兼容 (/v1/models)", url: "http://localhost:11434/v1/models" },
    { name: "Legacy (/api/tags)", url: "http://localhost:11434/api/tags" }
  ]

  const results: any[] = []

  for (const endpoint of endpoints) {
    testLogger.info(`测试端点: ${endpoint.name}`)
    testLogger.info(`URL: ${endpoint.url}`)

    try {
      const startTime = Date.now()
      const response = await fetch(endpoint.url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      })

      const latency = Date.now() - startTime

      if (response.ok) {
        const data = await response.json()
        testLogger.info(`✅ ${endpoint.name} 成功 (${latency}ms)`)
        testLogger.info("响应数据:", data)
        results.push({
          endpoint: endpoint.name,
          success: true,
          status: response.status,
          latency,
          data
        })
      } else {
        const errorText = await response.text()
        testLogger.error(`❌ ${endpoint.name} 失败 (${response.status})`)
        testLogger.error("错误响应:", errorText)
        results.push({
          endpoint: endpoint.name,
          success: false,
          status: response.status,
          latency,
          error: errorText
        })
      }
    } catch (error) {
      testLogger.error(`❌ ${endpoint.name} 异常:`, error)
      results.push({
        endpoint: endpoint.name,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  const allSuccess = results.every(r => r.success)
  return {
    success: allSuccess,
    message: allSuccess ? "所有端点测试通过" : "部分端点测试失败",
    details: results
  }
}

/**
 * 测试 Ollama 聊天接口
 */
export async function testOllamaChat(): Promise<TestResult> {
  const endpoint = "http://localhost:11434/v1/chat/completions"
  
  testLogger.info("测试聊天端点:", endpoint)

  const body = {
    model: "qwen2.5:7b",
    messages: [
      {
        role: "user",
        content: "测试连接，请回复 'OK'"
      }
    ],
    stream: false,
    max_tokens: 10
  }

  testLogger.info("请求体:", body)

  try {
    const startTime = Date.now()
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    })

    const latency = Date.now() - startTime

    if (response.ok) {
      const data = await response.json()
      testLogger.info(`✅ 聊天接口测试成功 (${latency}ms)`)
      testLogger.info("响应数据:", data)
      return {
        success: true,
        message: `测试成功，延迟 ${latency}ms`,
        details: { latency, data }
      }
    } else {
      const errorText = await response.text()
      testLogger.error(`❌ 聊天接口测试失败 (${response.status})`)
      testLogger.error("错误响应:", errorText)
      return {
        success: false,
        message: `测试失败: HTTP ${response.status}`,
        details: { status: response.status, error: errorText }
      }
    }
  } catch (error) {
    testLogger.error("❌ 聊天接口测试异常:", error)
    return {
      success: false,
      message: "测试异常",
      details: { error: error instanceof Error ? error.message : String(error) }
    }
  }
}

/**
 * 完整测试套件
 */
export async function testOllamaConnection(): Promise<void> {
  testLogger.info("=".repeat(60))
  testLogger.info("开始 Ollama 连接测试")
  testLogger.info("=".repeat(60))

  // 测试 1: 模型列表
  testLogger.info("\n[测试 1] 模型列表端点")
  const modelsResult = await testOllamaModels()
  testLogger.info("测试结果:", modelsResult)

  // 测试 2: 聊天接口
  testLogger.info("\n[测试 2] 聊天接口")
  const chatResult = await testOllamaChat()
  testLogger.info("测试结果:", chatResult)

  // 汇总
  testLogger.info("\n" + "=".repeat(60))
  testLogger.info("测试汇总")
  testLogger.info("=".repeat(60))
  testLogger.info("模型列表:", modelsResult.success ? "✅ 通过" : "❌ 失败")
  testLogger.info("聊天接口:", chatResult.success ? "✅ 通过" : "❌ 失败")

  if (modelsResult.success && chatResult.success) {
    testLogger.info("\n🎉 所有测试通过！Ollama 连接正常")
  } else {
    testLogger.error("\n⚠️ 部分测试失败，请检查:")
    testLogger.error("1. Ollama 服务是否运行 (ollama serve)")
    testLogger.error("2. 模型是否已拉取 (ollama pull qwen2.5:7b)")
    testLogger.error("3. 是否配置了 OLLAMA_ORIGINS 环境变量")
    testLogger.error("4. 扩展是否已重新加载并授予权限")
  }
}

// 在开发模式下自动导出到 window
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  (window as any).testOllamaConnection = testOllamaConnection;
  (window as any).testOllamaModels = testOllamaModels;
  (window as any).testOllamaChat = testOllamaChat;
  testLogger.info("已将测试函数导出到 window:")
  testLogger.info("- window.testOllamaConnection()")
  testLogger.info("- window.testOllamaModels()")
  testLogger.info("- window.testOllamaChat()")
}
