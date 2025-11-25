/**
 * 页面访问追踪 Content Script
 * 
 * Phase 2.1 核心功能：
 * - 监听页面激活/失活
 * - 监听用户交互（scroll, click, keypress, mousemove）
 * - 使用 DwellTimeCalculator 计算有效停留时间
 * - 达到 30 秒阈值后通过消息传递给 Background 记录
 * - 提供调试日志用于浏览器测试
 * 
 * ⚠️ 架构说明：
 * - Content Script 运行在网页上下文中
 * - 不能直接访问扩展的 IndexedDB（会创建在网页的存储空间）
 * - 必须通过 chrome.runtime.sendMessage 发送数据到 Background
 * - Background 负责所有数据库操作
 * 
 * @version 2.0
 * @date 2025-11-04
 */

import type { PlasmoCSConfig } from "plasmo"
import { DwellTimeCalculator, type InteractionType } from "~core/tracker/DwellTimeCalculator"
import { contentExtractor } from "~core/extractor"
import { TextAnalyzer } from "~core/analyzer"
import { logger } from "~utils/logger"
import { aiManager } from "~core/ai/AICapabilityManager"
import { extractKeywordsFromTopics, detectLanguage } from "~core/ai/helpers"
import { getAIConfig } from "~storage/ai-config"

// 配置：注入到所有 HTTP/HTTPS 页面
export const config: PlasmoCSConfig = {
  matches: ["http://*/*", "https://*/*"],
  all_frames: false // 只在主框架中运行
}

// ==================== 类型定义 ====================

interface PageVisitData {
  url: string
  title: string
  domain: string
  visitedAt: number // 页面加载时间
  dwellTime: number // 有效停留时间（秒）
}

// ==================== 常量定义 ====================

/**
 * 停留时间阈值（秒）
 * 只有停留超过此时间的页面才会被记录
 */
const THRESHOLD_SECONDS = 30

/**
 * 检查间隔（毫秒）
 * 每隔此时间检查一次是否达到阈值
 */
const CHECK_INTERVAL_MS = 5000

// ==================== 标题状态管理 ====================

/**
 * 标题状态管理器
 * 用于在页面标题上添加/移除学习状态 emoji
 */
class TitleStateManager {
  private originalTitle: string = document.title
  private currentEmoji: string = ''
  
  // Emoji 定义
  private readonly EMOJIS = {
    LEARNING: '📖',   // 学习中（正在阅读）
    PAUSED: '⏸️',     // 已暂停（标签页未激活）
    LEARNED: '✅',    // 已学习完成
  }
  
  /**
   * 标记页面开始学习（添加阅读 emoji）
   */
  startLearning(): void {
    this.originalTitle = this.getCleanTitle()
    this.currentEmoji = this.EMOJIS.LEARNING
    this.updateTitle()
    logger.debug('📝 [TitleState] 开始学习', { title: document.title })
  }
  
  /**
   * 标记页面暂停学习（标签页失活）
   */
  pauseLearning(): void {
    this.currentEmoji = this.EMOJIS.PAUSED
    this.updateTitle()
    logger.debug('⏸️ [TitleState] 学习暂停', { title: document.title })
  }
  
  /**
   * 恢复学习状态（标签页激活）
   */
  resumeLearning(): void {
    this.currentEmoji = this.EMOJIS.LEARNING
    this.updateTitle()
    logger.debug('▶️ [TitleState] 恢复学习', { title: document.title })
  }
  
  /**
   * 标记页面学习完成（添加完成 emoji）
   */
  completeLearning(): void {
    this.currentEmoji = this.EMOJIS.LEARNED
    this.updateTitle()
    logger.debug('✅ [TitleState] 学习完成', { title: document.title })
    
    // 3 秒后移除完成标记
    setTimeout(() => {
      this.clearLearning()
    }, 3000)
  }
  
  /**
   * 清除学习状态（移除 emoji）
   */
  clearLearning(): void {
    this.currentEmoji = ''
    this.updateTitle()
    logger.debug('🧹 [TitleState] 清除状态', { title: document.title })
  }
  
  /**
   * 重置（用于 SPA 导航）
   */
  reset(): void {
    this.clearLearning()
    this.originalTitle = document.title
  }
  
  /**
   * 获取清理后的标题（移除所有学习相关 emoji）
   */
  private getCleanTitle(): string {
    let title = document.title
    Object.values(this.EMOJIS).forEach(emoji => {
      title = title.replace(emoji + ' ', '')
    })
    return title
  }
  
  /**
   * 更新文档标题
   */
  private updateTitle(): void {
    const cleanTitle = this.getCleanTitle()
    document.title = this.currentEmoji ? `${this.currentEmoji} ${cleanTitle}` : cleanTitle
  }
}

const titleManager = new TitleStateManager()

// ==================== 状态管理 ====================

let calculator: DwellTimeCalculator
let isRecorded = false // 防止重复记录
let isRecording = false // 防止并发记录
let checkTimer: number | null = null // 定时检查的计时器
let urlCheckTimer: number | null = null // URL 轮询定时器
let eventListeners: Array<{ element: EventTarget; event: string; handler: EventListener }> = [] // 追踪所有事件监听器
let isContextValid = true // 扩展上下文是否有效（热重载检测）
let currentUrl = window.location.href // 当前 URL（用于检测 SPA 导航）

// ==================== 扩展上下文检测 ====================

/**
 * 检查扩展上下文是否有效
 * 在开发模式下，热重载会导致 chrome.runtime 失效
 */
function checkExtensionContext(): boolean {
  if (!isContextValid) {
    return false
  }
  
  try {
    // 尝试访问 chrome.runtime.id，如果失效会抛出错误
    if (!chrome.runtime?.id) {
      isContextValid = false
      return false
    }
    return true
  } catch (error) {
    isContextValid = false
    // 开发环境的上下文失效是正常现象（热重载），使用 debug 而非 warn
    logger.debug('⚠️ [PageTracker] 扩展上下文已失效（可能是热重载），停止追踪')
    cleanup()
    return false
  }
}

// ==================== 页面信息提取 ====================

/**
 * 获取当前页面的基本信息
 */
function getPageInfo(): PageVisitData {
  const url = window.location.href
  const title = document.title || url
  const domain = window.location.hostname
  const visitedAt = Date.now()
  const dwellTime = calculator.getEffectiveDwellTime()

  return {
    url,
    title,
    domain,
    visitedAt,
    dwellTime
  }
}

// ==================== 内容提取与分析 ====================

/**
 * 提取页面元数据
 */
async function extractPageMetadata() {
  try {
    const extracted = contentExtractor.extract(document)
    
    return {
      description: extracted.description || undefined,
      keywords: extracted.metaKeywords.length > 0 ? extracted.metaKeywords : undefined,
      author: document.querySelector('meta[name="author"]')?.getAttribute('content') || undefined,
      publishedTime: document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') || 
                    document.querySelector('meta[name="publish-date"]')?.getAttribute('content') || undefined,
      ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content') || undefined,
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || undefined,
    }
  } catch (error) {
    logger.debug('⚠️ [PageTracker] 元数据提取失败', error)
    return null
  }
}

/**
 * 提取内容摘要
 */
async function extractContentSummary() {
  try {
    const extracted = contentExtractor.extract(document)
    
    // 提取首段（前 500 字）
    const firstParagraph = extracted.content.slice(0, 500)
    
    return {
      firstParagraph,
      extractedText: extracted.content,
      wordCount: extracted.content.length,
      language: extracted.language,
    }
  } catch (error) {
    logger.debug('⚠️ [PageTracker] 内容摘要提取失败', error)
    return null
  }
}

/**
 * 分析页面内容
 */
async function analyzePageContent() {
  try {
    const extracted = contentExtractor.extract(document)
    
    // 检查是否有足够的内容进行分析
    if (!extracted.content || extracted.content.trim().length < 10) {
      logger.debug('⚠️ [PageTracker] 页面内容太少，跳过分析')
      return {
        keywords: [],
        topics: [],
        language: 'other' as const,
      }
    }
    
    // 合并标题、描述和内容进行分析，优化权重分配
    let fullText = ''
    if (extracted.title) {
      fullText += extracted.title + ' '.repeat(3) // 标题权重高一些
    }
    if (extracted.description) {
      fullText += extracted.description + ' '.repeat(2) // 描述中等权重
    }
    if (extracted.content) {
      fullText += extracted.content // 正文内容
    }
    
    logger.debug('🔍 [PageTracker] 待分析文本长度', {
      标题: extracted.title?.length || 0,
      描述: extracted.description?.length || 0,
      正文: extracted.content?.length || 0,
      总计: fullText.length
    })
    
    // Sprint 3: 尝试使用 AI 分析内容
    let keywords: string[] = []
    let topics: string[] = []
    let language = extracted.language
    let aiAnalysis: any = undefined
    
    try {
      // 初始化 AI 管理器
      await aiManager.initialize()
      
      // 检测语言（AI helpers 提供更准确的检测）
      const detectedLang = detectLanguage(fullText)
      language = detectedLang === 'zh' || detectedLang === 'en' ? detectedLang : 'other'
      
      // Phase 10: 从 AI 配置中获取推理模式设置
      const aiConfig = await getAIConfig()
      
      // 调用 AI 分析（传递推理模式参数）
      const aiResult = await aiManager.analyzeContent(fullText, {
        useReasoning: aiConfig.enableReasoning
      })
      
      logger.debug('🤖 [PageTracker] AI 分析完成', {
        provider: aiResult.metadata.provider,
        model: aiResult.metadata.model,
        主题分布: aiResult.topicProbabilities,
        主题数量: Object.keys(aiResult.topicProbabilities).length,
        cost: aiResult.metadata.cost
      })
      
      // 从 AI 主题概率提取关键词（向后兼容）
      keywords = extractKeywordsFromTopics(aiResult.topicProbabilities, 0.05)
        .slice(0, 20) // 保留前 20 个
      
      // 从 AI 主题概率提取主题列表
      topics = Object.entries(aiResult.topicProbabilities)
        .filter(([_, prob]) => prob > 0.1) // 过滤低概率主题
        .map(([topic, _]) => topic)
      
      // 如果没有检测到主题，使用 'other'
      if (topics.length === 0) {
        topics = ['other']
      }
      
      // 构建 AI 分析元数据
      aiAnalysis = {
        topics: aiResult.topicProbabilities,
        provider: aiResult.metadata.provider,
        model: aiResult.metadata.model,
        timestamp: aiResult.metadata.timestamp,
        cost: aiResult.metadata.cost,
        currency: aiResult.metadata.provider === 'deepseek' ? 'CNY' : 'USD', // DeepSeek 使用人民币
        tokensUsed: aiResult.metadata.tokensUsed
      }
      
    } catch (aiError) {
      // AI 分析失败，回退到关键词分析
      logger.debug('⚠️ [PageTracker] AI 分析失败，使用关键词 fallback', aiError)
      
      const analyzer = new TextAnalyzer()
      
      // 提取关键词，增加数量
      keywords = analyzer.extractKeywords(fullText, { topK: 30, minWordLength: 2 })
        .map(kw => kw.word) // 只取词汇，不要权重
      
      // 改进的主题分类
      topics = classifyTopics(keywords)
      
      keywords = keywords.slice(0, 20) // 保留前20个
    }
    
    return {
      keywords,
      topics,
      language,
      aiAnalysis, // Sprint 3: 新增 AI 分析结果
    }
  } catch (error) {
    logger.debug('⚠️ [PageTracker] 内容分析失败', error)
    return {
      keywords: [],
      topics: [],
      language: 'other' as const,
    }
  }
}

/**
 * 改进的主题分类（基于关键词匹配）
 */
function classifyTopics(keywords: string[]): string[] {
  const topicKeywords = {
    technology: {
      zh: ['技术', '编程', '代码', '软件', '开发', '算法', '程序', '系统', '网络', '数据库', 
           'javascript', 'python', 'react', 'vue', '前端', '后端', '服务器', '框架', '工具', '调试'],
      en: ['programming', 'code', 'software', 'developer', 'algorithm', 'tech', 'system',
           'javascript', 'python', 'react', 'vue', 'frontend', 'backend', 'server', 'framework']
    },
    design: {
      zh: ['设计', '界面', '视觉', '交互', '排版', '颜色', '字体', '图标', '用户体验', '产品设计'],
      en: ['design', 'ui', 'ux', 'interface', 'typography', 'visual', 'graphic', 'layout', 'color']
    },
    science: {
      zh: ['研究', '实验', '科学', '理论', '数据', '分析', '学术', '论文', '科技', '创新'],
      en: ['research', 'study', 'experiment', 'scientific', 'theory', 'data', 'analysis', 'academic']
    },
    business: {
      zh: ['商业', '营销', '金融', '管理', '战略', '市场', '销售', '投资', '创业', '公司'],
      en: ['business', 'marketing', 'finance', 'management', 'strategy', 'market', 'sales', 'investment']
    },
    education: {
      zh: ['教育', '学习', '课程', '培训', '知识', '技能', '教学', '学校', '大学', '考试'],
      en: ['education', 'learning', 'course', 'training', 'knowledge', 'skill', 'teaching', 'school']
    },
    entertainment: {
      zh: ['娱乐', '游戏', '电影', '音乐', '视频', '直播', '综艺', '明星', '动漫', '小说'],
      en: ['entertainment', 'game', 'movie', 'music', 'video', 'streaming', 'anime', 'novel']
    },
    news: {
      zh: ['新闻', '时事', '政治', '社会', '经济', '国际', '报道', '事件', '政府', '法律'],
      en: ['news', 'politics', 'social', 'economy', 'international', 'government', 'law', 'event']
    }
  }
  
  const detectedTopics: string[] = []
  
  Object.entries(topicKeywords).forEach(([topic, wordLists]) => {
    const allWords = [...wordLists.zh, ...wordLists.en]
    
    const hasMatch = keywords.some(keyword => 
      allWords.some(word => {
        // 改进匹配逻辑：考虑包含关系
        const keywordLower = keyword.toLowerCase()
        const wordLower = word.toLowerCase()
        return keywordLower.includes(wordLower) || wordLower.includes(keywordLower)
      })
    )
    
    if (hasMatch) {
      detectedTopics.push(topic)
    }
  })
  
  return detectedTopics.length > 0 ? detectedTopics : ['other']
}

// ==================== 数据记录 ====================

/**
 * 记录页面访问到数据库
 */
async function recordPageVisit(): Promise<void> {
  // 检查扩展上下文
  if (!checkExtensionContext()) {
    logger.debug('⚠️ [PageTracker] 扩展上下文失效，跳过记录')
    return
  }
  
  if (isRecorded) {
    logger.debug('🚫 [PageTracker] 已记录过，跳过')
    return
  }
  
  // 设置记录标志，防止并发调用
  isRecording = true

  try {
    const pageInfo = getPageInfo()
    
      // Phase 2.7 Step 6: 检测访问来源
    let source: 'organic' | 'recommended' | 'search' = 'organic'
    let recommendationId: string | undefined
    
    try {
      // 检查 chrome.storage 是否可用
      if (!checkExtensionContext() || !chrome?.storage?.local) {
        logger.debug('⚠️ [PageTracker] Chrome storage 不可用，跳过来源检测')
        // 继续记录，但使用默认来源
      } else {
        try {
          // 1. 尝试从 chrome.storage 读取追踪信息
          const trackingKey = `tracking_${pageInfo.url}`
          const result = await chrome.storage.local.get(trackingKey)
          const trackingInfo = result[trackingKey]
          
          if (trackingInfo && trackingInfo.expiresAt > Date.now()) {
            source = trackingInfo.source || 'organic'
            recommendationId = trackingInfo.recommendationId
            logger.debug('🔗 [PageTracker] 检测到推荐来源', { source, recommendationId })
            
            // 使用后立即删除追踪信息
            await chrome.storage.local.remove(trackingKey)
          } else {
            // 2. 检测是否来自搜索引擎（基于 referrer）
            const referrer = document.referrer
            if (referrer) {
              try {
                const referrerUrl = new URL(referrer)
                const searchEngines = ['google.com', 'bing.com', 'baidu.com', 'duckduckgo.com']
                if (searchEngines.some(engine => referrerUrl.hostname.includes(engine))) {
                  source = 'search'
                  logger.debug('🔍 [PageTracker] 检测到搜索引擎来源', { referrer })
                }
              } catch (urlError) {
                // 无效的 referrer URL，忽略
                logger.debug('⚠️ [PageTracker] 无效的 referrer URL')
              }
            }
          }
        } catch (storageError) {
          logger.debug('⚠️ [PageTracker] Chrome storage 访问失败，使用默认来源', storageError)
        }
      }
    } catch (error) {
      logger.debug('⚠️ [PageTracker] 检测来源失败，使用默认值', error)
    }
    
    logger.info('💾 [PageTracker] 准备记录页面访问', {
      页面: pageInfo.title,
      URL: pageInfo.url,
      停留时间: `${pageInfo.dwellTime.toFixed(1)}秒`,
      来源: source,
      时间戳: new Date(pageInfo.visitedAt).toLocaleTimeString()
    })

    // ⚠️ 架构变更：不再直接访问数据库
    // Content Script 通过消息传递数据到 Background
    // Background 负责所有数据库操作
    
    // 检查扩展上下文
    if (!checkExtensionContext()) {
      logger.debug('⚠️ [PageTracker] 扩展上下文失效，无法记录')
      return
    }
    
    // 构建完整的访问记录数据
    const metadata = await extractPageMetadata()
    const contentSummary = await extractContentSummary()
    const analysisResult = await analyzePageContent()
    
    logger.debug('📊 [PageTracker] 页面分析结果', {
      关键词数量: analysisResult.keywords.length,
      前5关键词: analysisResult.keywords.slice(0, 5),
      主题: analysisResult.topics,
      语言: analysisResult.language
    })
    
    const visitData = {
      id: crypto.randomUUID(),
      url: pageInfo.url,
      title: pageInfo.title,
      domain: pageInfo.domain,
      visitTime: pageInfo.visitedAt,
      duration: pageInfo.dwellTime,
      interactionCount: 0, // TODO: 实际记录交互次数
      
      // Phase 2.7 Step 6: 来源追踪
      source,
      recommendationId,
      
      // Phase 3.2: 提取页面内容和分析
      meta: metadata,
      contentSummary: contentSummary,
      analysis: analysisResult,
      
      status: 'qualified' as const,
      
      // 数据生命周期
      contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000, // 90 天后
      analysisRetainUntil: -1 // 永久保留
    }
    
    // 发送消息到 Background 保存数据
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_PAGE_VISIT',
        data: visitData
      })
      
      if (response?.success) {
        isRecorded = true
        titleManager.completeLearning() // 显示学习完成标记（3秒后自动消失）
        logger.info('✅ [PageTracker] 页面访问已记录到数据库（通过 Background）')
        
        // ⚠️ 不要在这里清理！
        // SPA 页面可能会继续导航到其他页面
        // 只在页面真正卸载时才清理（由 beforeunload/pagehide 处理）
      } else {
        throw new Error(response?.error || '未知错误')
      }
    } catch (messageError) {
      // 页面进入 bfcache 或扩展上下文失效
      if (messageError instanceof Error) {
        if (messageError.message?.includes('Extension context') || 
            messageError.message?.includes('message channel')) {
          logger.debug('⚠️ [PageTracker] 扩展上下文失效或页面进入缓存')
        } else {
          logger.error('❌ [PageTracker] 发送消息失败', messageError)
        }
      }
      throw messageError
    }
    
  } catch (error) {
    // 开发环境的上下文错误是正常现象
    if (error instanceof Error && error.message?.includes('Extension context')) {
      logger.debug('⚠️ [PageTracker] 扩展上下文失效（热重载导致）')
    } else {
      logger.error('❌ [PageTracker] 记录页面访问失败', error)
    }
  } finally {
    // 无论成功或失败，都重置记录标志
    isRecording = false
  }
}/**
 * 检查是否达到阈值
 */
function checkThreshold(): void {
  // 检查扩展上下文
  if (!checkExtensionContext()) {
    return
  }
  
  const dwellTime = calculator.getEffectiveDwellTime()

  // 防止重复记录或并发记录
  if (dwellTime >= THRESHOLD_SECONDS && !isRecorded && !isRecording) {
    logger.info('🎯 [PageTracker] 达到阈值，开始记录')
    recordPageVisit()
  }
}

// ==================== 清理函数 ====================

/**
 * 清理所有监听器和定时器
 */
function cleanup(): void {
  logger.debug('🧹 [PageTracker] 清理资源')
  
  // 清除标题状态
  titleManager.clearLearning()
  
  // 停止 DwellTimeCalculator（只在未停止时调用）
  if (calculator && !calculator['isStopped']) {
    calculator.stop()
  }
  
  // 停止定时检查
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
  
  // 停止 URL 轮询
  if (urlCheckTimer) {
    clearInterval(urlCheckTimer)
    urlCheckTimer = null
  }
  
  // 移除所有事件监听器
  eventListeners.forEach(({ element, event, handler }) => {
    try {
      element.removeEventListener(event, handler)
    } catch (error) {
      // 忽略移除失败的情况
    }
  })
  eventListeners = []
}

// ==================== 事件监听 ====================

/**
 * 监听页面可见性变化
 */
function setupVisibilityListener(): void {
  const handler = () => {
    const isVisible = !document.hidden
    calculator.onVisibilityChange(isVisible)
    
    // 更新标题状态
    if (isVisible) {
      logger.debug('👁️ [DwellTime] 页面激活')
      if (!isRecorded) {
        titleManager.resumeLearning() // 恢复学习状态
      }
    } else {
      logger.debug('😴 [DwellTime] 页面失活')
      if (!isRecorded) {
        titleManager.pauseLearning() // 暂停学习状态
      }
    }
  }
  
  document.addEventListener('visibilitychange', handler)
  eventListeners.push({ element: document, event: 'visibilitychange', handler })
}

/**
 * 监听用户交互（scroll, click, keypress, mousemove）
 */
function setupInteractionListeners(): void {
  const interactionEvents: InteractionType[] = ['scroll', 'click', 'keypress', 'mousemove']
  
  interactionEvents.forEach(event => {
    const handler = () => {
      calculator.onInteraction(event)
    }
    
    window.addEventListener(event, handler, { passive: true })
    eventListeners.push({ element: window, event, handler })
  })
}

/**
 * 开始定期检查停留时间
 */
function startThresholdChecking(): void {
  checkTimer = window.setInterval(() => {
    checkThreshold()
  }, CHECK_INTERVAL_MS)
  
  logger.debug('⏰ [PageTracker] 开始定期检查')
}

/**
 * 页面卸载时保存数据
 */
function setupUnloadListener(): void {
  // beforeunload: 页面即将卸载（可能被阻止）
  const beforeUnloadHandler = () => {
    const dwellTime = calculator.getEffectiveDwellTime()
    
    if (dwellTime >= THRESHOLD_SECONDS && !isRecorded) {
      logger.info('⚡ [PageTracker] beforeunload - 页面卸载前尝试记录')
      recordPageVisit()
    }
    
    // 清理资源
    cleanup()
  }
  
  // pagehide: 页面隐藏（更可靠，移动端友好）
  const pageHideHandler = () => {
    const dwellTime = calculator.getEffectiveDwellTime()
    
    if (dwellTime >= THRESHOLD_SECONDS && !isRecorded) {
      logger.info('⚡ [PageTracker] pagehide - 页面隐藏前尝试记录')
      recordPageVisit()
    }
    
    // 清理资源
    cleanup()
  }
  
  // visibilitychange: 页面变为隐藏状态
  const visibilityHandler = () => {
    if (document.visibilityState === 'hidden') {
      const dwellTime = calculator.getEffectiveDwellTime()
      
      if (dwellTime >= THRESHOLD_SECONDS && !isRecorded) {
        logger.info('⚡ [PageTracker] visibilitychange - 页面隐藏前尝试记录')
        recordPageVisit()
      }
      
      // 注意：visibilitychange 不一定是页面卸载，可能只是切换标签页
      // 所以这里不清理资源
    }
  }
  
  window.addEventListener('beforeunload', beforeUnloadHandler)
  window.addEventListener('pagehide', pageHideHandler)
  document.addEventListener('visibilitychange', visibilityHandler)
  
  eventListeners.push({ element: window, event: 'beforeunload', handler: beforeUnloadHandler })
  eventListeners.push({ element: window, event: 'pagehide', handler: pageHideHandler })
  eventListeners.push({ element: document, event: 'visibilitychange', handler: visibilityHandler })
  
  logger.debug('🎯 [PageTracker] 页面卸载监听已设置', {
    事件: ['beforeunload', 'pagehide', 'visibilitychange']
  })
}

/**
 * 监听 SPA 页面导航（URL 变化）
 */
function setupNavigationListener(): void {
  logger.info('🎯 [PageTracker] 开始设置 SPA 导航监听')
  
  // 方案 1: 监听标准事件
  const popstateHandler = () => {
    logger.debug('🔄 [PageTracker] popstate 事件触发')
    handleUrlChange()
  }
  window.addEventListener('popstate', popstateHandler)
  eventListeners.push({ element: window, event: 'popstate', handler: popstateHandler })
  
  const hashchangeHandler = () => {
    logger.debug('🔄 [PageTracker] hashchange 事件触发')
    handleUrlChange()
  }
  window.addEventListener('hashchange', hashchangeHandler)
  eventListeners.push({ element: window, event: 'hashchange', handler: hashchangeHandler })
  
  // 方案 2: 拦截 history API（可能被框架覆盖）
  try {
    const originalPushState = history.pushState.bind(history)
    const originalReplaceState = history.replaceState.bind(history)
    
    history.pushState = function(...args) {
      logger.debug('🔄 [PageTracker] pushState 被调用', { 
        url: args[2],
        当前URL: window.location.href 
      })
      originalPushState(...args)
      setTimeout(() => handleUrlChange(), 0)
    }
    
    history.replaceState = function(...args) {
      logger.debug('🔄 [PageTracker] replaceState 被调用', { 
        url: args[2],
        当前URL: window.location.href 
      })
      originalReplaceState(...args)
      setTimeout(() => handleUrlChange(), 0)
    }
    
    logger.debug('✅ [PageTracker] history API 拦截成功')
  } catch (error) {
    logger.warn('⚠️ [PageTracker] history API 拦截失败', error)
  }
  
  // 方案 3: 定期轮询 URL（兜底方案，每秒检查一次）
  urlCheckTimer = window.setInterval(() => {
    const newUrl = window.location.href
    if (newUrl !== currentUrl) {
      logger.debug('🔄 [PageTracker] URL 轮询检测到变化')
      handleUrlChange()
    }
  }, 1000)
  
  logger.info('🎯 [PageTracker] SPA 导航监听已启动', {
    方案: ['标准事件', 'history API 拦截', 'URL 轮询（1秒）']
  })
}

/**
 * 处理 URL 变化（SPA 导航）
 */
function handleUrlChange(): void {
  const newUrl = window.location.href
  
  logger.debug('🔍 [PageTracker] handleUrlChange 被调用', {
    当前URL: currentUrl,
    新URL: newUrl,
    是否相同: newUrl === currentUrl
  })
  
  if (newUrl !== currentUrl) {
    logger.info('🔄 [PageTracker] 检测到 URL 变化', {
      旧URL: currentUrl,
      新URL: newUrl
    })
    
    // 如果当前页面达到阈值，先记录
    const dwellTime = calculator.getEffectiveDwellTime()
    logger.debug('📊 [PageTracker] 检查旧页面停留时间', {
      停留时间: `${dwellTime.toFixed(1)}秒`,
      阈值: `${THRESHOLD_SECONDS}秒`,
      已记录: isRecorded
    })
    
    if (dwellTime >= THRESHOLD_SECONDS && !isRecorded) {
      logger.info('📝 [PageTracker] URL 变化前记录旧页面')
      recordPageVisit()
    }
    
    // 重置状态开始追踪新页面
    resetPageTracking()
    currentUrl = newUrl
  }
}

/**
 * 重置页面追踪状态（用于 SPA 导航）
 */
function resetPageTracking(): void {
  // 重置标题状态
  titleManager.reset()
  
  // 重置 calculator
  calculator = new DwellTimeCalculator()
  
  // 重置记录状态
  isRecorded = false
  
  logger.info('🔄 [PageTracker] 页面追踪状态已重置', {
    页面: document.title,
    URL: window.location.href
  })
}

// ==================== 初始化 ====================

function init(): void {
  // 初始化 DwellTimeCalculator
  calculator = new DwellTimeCalculator()
  
  // 初始化当前 URL
  currentUrl = window.location.href
  
  // 添加学习开始标记
  titleManager.startLearning()
  
  logger.info('🚀 [PageTracker] 页面访问追踪已启动', {
    页面: document.title,
    URL: window.location.href,
    时间: new Date().toLocaleTimeString(),
    '是否刷新': performance.navigation.type === 1 ? '是' : '否'
  })

  // 设置监听器
  setupVisibilityListener()
  setupInteractionListeners()
  setupUnloadListener()
  setupNavigationListener() // SPA 导航监听（对 MPA 无效但不影响）
  
  // 启动定时检查
  startThresholdChecking()
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
