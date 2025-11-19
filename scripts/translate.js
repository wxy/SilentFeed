#!/usr/bin/env node

/**
 * 自动翻译脚本
 * 
 * 功能：
 * 1. 读取中文翻译文件（源语言）
 * 2. 对比英文翻译文件，找出缺失或过时的翻译
 * 3. 使用 DeepSeek API 自动翻译
 * 4. 更新翻译文件和跟踪记录
 * 
 * 使用：npm run i18n:translate
 */

// 加载环境变量
require('dotenv').config()

const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

// 配置
const CONFIG = {
  apiKey: process.env.DEEPSEEK_API_KEY,
  apiUrl: "https://api.deepseek.com/v1/chat/completions",
  model: "deepseek-chat",
  localesDir: path.join(__dirname, "../public/locales"),
  sourceLocale: "zh-CN",
  targetLocales: ["en"]
}

// 检查 API Key
if (!CONFIG.apiKey) {
  console.error("\n❌ 错误: 未找到 DEEPSEEK_API_KEY 环境变量")
  console.error("\n请设置环境变量:")
  console.error("  export DEEPSEEK_API_KEY='your-api-key'")
  console.error("\n或创建 .env 文件:")
  console.error("  DEEPSEEK_API_KEY=your-api-key")
  console.error("\n详见文档: docs/I18N.md")
  process.exit(1)
}

/**
 * 计算字符串的 MD5 哈希
 */
function getHash(content) {
  return crypto.createHash("md5").update(content).digest("hex").slice(0, 8)
}

/**
 * 扁平化嵌套对象
 * { a: { b: "c" } } => { "a.b": "c" }
 */
function flattenObject(obj, prefix = "") {
  return Object.keys(obj).reduce((acc, key) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof obj[key] === "object" && obj[key] !== null && !Array.isArray(obj[key])) {
      Object.assign(acc, flattenObject(obj[key], path))
    } else {
      acc[path] = obj[key]
    }
    return acc
  }, {})
}

/**
 * 反扁平化对象
 * { "a.b": "c" } => { a: { b: "c" } }
 */
function unflattenObject(obj) {
  const result = {}
  for (const key in obj) {
    const keys = key.split(".")
    keys.reduce((acc, k, i) => {
      if (i === keys.length - 1) {
        acc[k] = obj[key]
      } else {
        acc[k] = acc[k] || {}
      }
      return acc[k]
    }, result)
  }
  return result
}

/**
 * 使用 DeepSeek API 翻译文本
 */
async function translateText(text, targetLang) {
  const langName = targetLang === "en" ? "英文" : "中文"
  
  console.log(`  翻译: "${text}" → ${langName}`)
  
  try {
    const response = await fetch(CONFIG.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CONFIG.apiKey}`
      },
      body: JSON.stringify({
        model: CONFIG.model,
        messages: [
          {
            role: "system",
            content: `你是一个专业的翻译助手。翻译时：
1. 保持简洁、自然、符合目标语言习惯
2. 保留 {{变量}} 格式的插值不翻译
3. 保留产品名称（如 Silent Feed）不翻译
4. 只返回翻译结果，不要解释`
          },
          {
            role: "user",
            content: `将以下中文翻译成${langName}：\n${text}`
          }
        ],
        temperature: 0.3, // 低温度确保翻译稳定
        max_tokens: 500
      })
    })
    
    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status} ${response.statusText}`)
    }
    
    const data = await response.json()
    const translated = data.choices[0].message.content.trim()
    
    console.log(`  结果: "${translated}"`)
    
    return translated
  } catch (error) {
    console.error(`  ❌ 翻译失败:`, error.message)
    return text // 失败时返回原文
  }
}

/**
 * 加载 JSON 文件
 */
function loadJSON(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8")
    return JSON.parse(content)
  } catch (error) {
    console.error(`❌ 加载文件失败: ${filePath}`, error.message)
    return {}
  }
}

/**
 * 保存 JSON 文件
 */
function saveJSON(filePath, data) {
  try {
    const content = JSON.stringify(data, null, 2) + "\n"
    fs.writeFileSync(filePath, content, "utf8")
    console.log(`✅ 已保存: ${filePath}`)
  } catch (error) {
    console.error(`❌ 保存文件失败: ${filePath}`, error.message)
  }
}

/**
 * 主函数：同步翻译
 */
async function syncTranslations() {
  console.log("🔄 开始同步翻译...\n")
  
  // 加载源语言文件（中文）
  const sourceFile = path.join(CONFIG.localesDir, CONFIG.sourceLocale, "translation.json")
  const sourceData = loadJSON(sourceFile)
  const sourceFlat = flattenObject(sourceData)
  
  console.log(`📖 源语言: ${CONFIG.sourceLocale}，共 ${Object.keys(sourceFlat).length} 个 key\n`)
  
  // 加载翻译跟踪记录
  const trackerFile = path.join(CONFIG.localesDir, ".translation-tracker.json")
  const tracker = loadJSON(trackerFile)
  
  // 遍历每个目标语言
  for (const targetLocale of CONFIG.targetLocales) {
    console.log(`\n🌐 目标语言: ${targetLocale}`)
    console.log("─".repeat(50))
    
    const targetFile = path.join(CONFIG.localesDir, targetLocale, "translation.json")
    const targetData = loadJSON(targetFile)
    const targetFlat = flattenObject(targetData)
    
    const updates = []
    let translatedCount = 0
    let skippedCount = 0
    
    // 遍历源语言的每个 key
    for (const [key, value] of Object.entries(sourceFlat)) {
      if (!value || typeof value !== "string") {
        console.log(`⏭️  跳过空值: ${key}`)
        skippedCount++
        continue
      }
      
      const currentHash = getHash(value)
      const trackedData = tracker.translations?.[key]?.[CONFIG.sourceLocale]
      const trackedTarget = tracker.translations?.[key]?.[targetLocale]
      
      // 判断是否需要翻译
      const needsTranslation = 
        !targetFlat[key] || // 没有翻译
        !trackedData || // 没有跟踪记录
        trackedData.hash !== currentHash || // 源文本已变化
        !trackedTarget // 没有目标语言跟踪记录
      
      if (needsTranslation) {
        console.log(`\n🔤 [${key}]`)
        
        // 调用翻译 API
        const translated = await translateText(value, targetLocale)
        
        targetFlat[key] = translated
        translatedCount++
        
        // 更新跟踪记录
        if (!tracker.translations) tracker.translations = {}
        if (!tracker.translations[key]) tracker.translations[key] = {}
        
        tracker.translations[key][CONFIG.sourceLocale] = {
          value,
          hash: currentHash,
          lastModified: new Date().toISOString(),
          status: "verified"
        }
        
        tracker.translations[key][targetLocale] = {
          value: translated,
          hash: getHash(translated),
          lastModified: new Date().toISOString(),
          status: "ai-translated"
        }
        
        // 添加小延迟避免 API 限流
        await new Promise(resolve => setTimeout(resolve, 500))
      } else {
        skippedCount++
      }
    }
    
    // 保存更新后的目标语言文件
    const targetUnflat = unflattenObject(targetFlat)
    saveJSON(targetFile, targetUnflat)
    
    console.log(`\n📊 ${targetLocale} 统计:`)
    console.log(`  ✅ 翻译: ${translatedCount} 个`)
    console.log(`  ⏭️  跳过: ${skippedCount} 个`)
  }
  
  // 更新跟踪记录
  tracker.version = "1.0.0"
  tracker.lastUpdate = new Date().toISOString()
  saveJSON(trackerFile, tracker)
  
  console.log("\n✨ 翻译同步完成！")
}

// 执行
syncTranslations().catch(error => {
  console.error("\n❌ 翻译失败:", error)
  process.exit(1)
})
