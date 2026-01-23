/**
 * 补充调度器（RefillScheduler）
 * 
 * 职责：从候选池挑选文章补充到弹窗推荐
 * 
 * 工作流程：
 * 1. 定时检查弹窗推荐容量
 * 2. 从候选池挑选高分文章
 * 3. 更新 feedArticles 表的 poolStatus 为 'popup'
 * 4. 根据显示模式设置，可选地写入阅读清单
 * 
 * 调度策略：
 * - 固定间隔：5 分钟检查一次
 * - 冷却期由策略控制（30-180 分钟）
 * - 每日补充上限由策略控制
 */

import { db } from '@/storage/db'
import { getRecommendationConfig } from '@/storage/recommendation-config'
import { getCurrentStrategy } from '@/storage/strategy-storage'
import { getRefillManager } from '@/core/recommender/pool-refill-policy'
import { ReadingListManager } from '@/core/reading-list/reading-list-manager'
import { getUIConfig } from '@/storage/ui-config'
import { translateRecommendations } from '@/core/translator/recommendation-translator'
import { logger } from '@/utils/logger'
import type { FeedArticle } from '@/types/rss'

const schedLogger = logger.withTag('RefillScheduler')

/**
 * 补充调度器配置
 */
export interface RefillSchedulerConfig {
  /** 检查间隔（分钟） */
  checkIntervalMinutes: number
}

const DEFAULT_CONFIG: RefillSchedulerConfig = {
  checkIntervalMinutes: 5
}

/**
 * 补充调度器
 */
export class RefillScheduler {
  private config: RefillSchedulerConfig
  private alarmName = 'refill-recommendation-pool'
  private isRunning = false
  private isRefilling = false
  public nextRunTime: number | null = null

  constructor(config: Partial<RefillSchedulerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 启动调度器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      schedLogger.warn('补充调度器已在运行')
      return
    }

    schedLogger.info('启动补充调度器...')
    
    try {
      // 注册 Alarm 监听器
      chrome.alarms.onAlarm.addListener(this.handleAlarm.bind(this))
      
      // 立即执行一次
      await this.runRefill()
      
      // 设置定时任务
      await this.scheduleNext()
      
      this.isRunning = true
      schedLogger.info('✅ 补充调度器已启动')
    } catch (error) {
      schedLogger.error('❌ 启动补充调度器失败:', error)
      throw error
    }
  }

  /**
   * 停止调度器
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    schedLogger.info('停止补充调度器...')
    
    try {
      await chrome.alarms.clear(this.alarmName)
      this.isRunning = false
      this.nextRunTime = null
      schedLogger.info('✅ 补充调度器已停止')
    } catch (error) {
      schedLogger.error('❌ 停止补充调度器失败:', error)
    }
  }

  /**
   * 处理 Alarm 触发
   */
  private async handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
    if (alarm.name !== this.alarmName) {
      return
    }

    schedLogger.debug(`Alarm 触发: ${alarm.name}`)
    await this.runRefill()
    await this.scheduleNext()
  }

  /**
   * 执行推荐池补充
   */
  private async runRefill(): Promise<void> {
    if (this.isRefilling) {
      schedLogger.debug('补充正在进行中，跳过本次执行')
      return
    }

    this.isRefilling = true
    const startTime = Date.now()

    try {
      schedLogger.info('开始推荐池补充...')

      // 1. 获取策略配置
      const strategy = await getCurrentStrategy()
      if (!strategy) {
        schedLogger.warn('⚠️ 策略未配置，跳过补充')
        return
      }

      const targetPoolSize = strategy.strategy.recommendation.targetPoolSize
      const qualityThreshold = strategy.strategy.candidatePool.entryThreshold

      // 🔍 诊断日志：输出 AI 策略详情
      schedLogger.info('🎯 AI 策略配置:', {
        targetPoolSize: strategy.strategy.recommendation.targetPoolSize,
        cooldownMinutes: strategy.strategy.recommendation.cooldownMinutes,
        dailyLimit: strategy.strategy.recommendation.dailyLimit,
        refillThreshold: strategy.strategy.recommendation.refillThreshold,
        entryThreshold: strategy.strategy.candidatePool.entryThreshold,
        generatedAt: new Date(strategy.strategy.meta.generatedAt).toLocaleString('zh-CN')
      })
      schedLogger.info(`🔍 使用的 targetPoolSize = ${targetPoolSize}`)

      // 1.5. 清理超出容量的推荐（退回候选池）
      await this.cleanupExcessRecommendations(targetPoolSize)

      // 2. 检查当前弹窗推荐状态
      
      // 🔍 诊断：先查询所有 poolStatus='recommended' 的文章
      const allRecommended = await db.feedArticles
        .filter(a => a.poolStatus === 'recommended')
        .toArray()
      
      schedLogger.info(`🔍 [诊断] poolStatus='recommended' 的文章总数: ${allRecommended.length}`)
      
      // 详细列出每篇文章的状态
      for (const article of allRecommended) {
        const isValid = !article.isRead && article.feedback !== 'dismissed'
        schedLogger.info(`  📄 ${article.title?.substring(0, 30)}... | isRead=${article.isRead || false} | feedback=${article.feedback || 'none'} | 符合条件=${isValid ? '✅' : '❌'}`)
      }
      
      const currentPool = await db.feedArticles
        .filter(a => {
          const isPopup = a.poolStatus === 'recommended'
          const isUnread = !a.isRead
          const notDismissed = a.feedback !== 'dismissed'
          return isPopup && isUnread && notDismissed
        })
        .toArray()

      const currentPoolSize = currentPool.length
      schedLogger.info(`📊 推荐池状态: ${currentPoolSize}/${targetPoolSize} (实际符合补充检查条件的文章数)`, {
        总文章数: allRecommended.length,
        符合条件: currentPoolSize,
        差异: allRecommended.length - currentPoolSize,
        currentPool: currentPool.map(a => ({
          id: a.id,
          title: a.title?.substring(0, 30),
          isRead: a.isRead,
          feedback: a.feedback
        }))
      })

      // 3. 检查是否允许补充（会自动从 storage 读取最新 AI 策略）
      const refillManager = getRefillManager()
      const shouldRefill = await refillManager.shouldRefill(currentPoolSize, targetPoolSize)
      
      if (!shouldRefill) {
        schedLogger.warn(`⏸️ 补充受限：不满足补充条件 (${currentPoolSize}/${targetPoolSize})`)
        
        // 诊断：输出限制原因
        const state = refillManager.getState()
        const policy = refillManager.getPolicy()
        const fillRate = currentPoolSize / targetPoolSize
        const timeSinceLastRefill = Date.now() - state.lastRefillTime
        
        schedLogger.info('📋 补充策略状态:', {
          fillRate: `${(fillRate * 100).toFixed(0)}%`,
          triggerThreshold: `${(policy.triggerThreshold * 100).toFixed(0)}%`,
          shouldTrigger: fillRate <= policy.triggerThreshold,
          timeSinceLastRefill: `${Math.round(timeSinceLastRefill / 1000 / 60)}分钟`,
          minInterval: `${Math.round(policy.minInterval / 1000 / 60)}分钟`,
          coolingDown: state.lastRefillTime > 0 && timeSinceLastRefill < policy.minInterval,
          dailyCount: `${state.dailyRefillCount}/${policy.maxDailyRefills}`,
          reachedDailyLimit: state.dailyRefillCount >= policy.maxDailyRefills
        })
        
        return
      }

      // 4. 从候选池获取高分文章
      const remainingCapacity = targetPoolSize - currentPoolSize
      schedLogger.info(`🎯 需要补充: ${remainingCapacity} 篇 (${currentPoolSize}/${targetPoolSize})`)
      
      const candidates = await this.getCandidateArticles(remainingCapacity, qualityThreshold)

      if (candidates.length === 0) {
        schedLogger.info('📭 候选池为空或无合适文章，跳过本次补充')
        return
      }

      schedLogger.info(`📦 从候选池选取 ${candidates.length} 篇文章`)

      // 5. 创建推荐记录
      const recommendations = await this.createRecommendations(candidates)
      
      // 🔍 诊断：输出文章的翻译信息
      schedLogger.info(`🔍 推荐文章翻译状态:`)
      for (const rec of recommendations) {
        schedLogger.info(`  - ${rec.title}`)
        schedLogger.info(`    URL: ${rec.link}`)
        schedLogger.info(`    有翻译: ${!!rec.translation}`)
        if (rec.translation) {
          schedLogger.info(`    翻译标题: ${rec.translation.translatedTitle}`)
          schedLogger.info(`    源语言: ${rec.translation.sourceLanguage}`)
          schedLogger.info(`    目标语言: ${rec.translation.targetLanguage}`)
        }
      }
      
      // 6. 记录补充操作
      await refillManager.recordRefill()

      // 7. 如果启用自动翻译，对缺少翻译的文章进行即时翻译
      const uiConfig = await getUIConfig()
      if (uiConfig.autoTranslate && recommendations.length > 0) {
        const untranslated = recommendations.filter(r => !r.translation)
        if (untranslated.length > 0) {
          schedLogger.info(`🌐 发现 ${untranslated.length} 篇未翻译文章，开始即时翻译...`)
          try {
            const translated = await translateRecommendations(untranslated)
            
            // 更新数组中的文章（保持引用一致性）
            for (const translatedArticle of translated) {
              const index = recommendations.findIndex(r => r.id === translatedArticle.id)
              if (index !== -1) {
                recommendations[index] = translatedArticle
                
                // 🔧 关键修复：更新数据库中的 translation 字段
                if (translatedArticle.translation) {
                  await db.feedArticles.update(translatedArticle.id, {
                    translation: translatedArticle.translation
                  })
                  schedLogger.debug(`✅ 已更新数据库翻译: ${translatedArticle.id}`, {
                    title: translatedArticle.translation.translatedTitle
                  })
                }
              }
            }
            
            schedLogger.info(`✅ 即时翻译完成: ${translated.length} 篇，已保存到数据库`)
          } catch (error) {
            schedLogger.error('❌ 即时翻译失败:', error)
            // 翻译失败不影响补充流程
          }
        }
      }

      // 8. 根据当前显示模式，立即处理阅读清单
      const config = await getRecommendationConfig()
      schedLogger.info(`🔍 [诊断] 当前显示模式: ${config.deliveryMode}`)
      
      if (config.deliveryMode === 'readingList') {
        schedLogger.info(`📝 清单模式：将 ${recommendations.length} 篇文章写入阅读清单`)
        await this.writeToReadingList(recommendations)
        
        // 验证写入后推荐池状态是否被修改
        const poolAfterWrite = await db.feedArticles
          .filter(a => a.poolStatus === 'recommended')
          .count()
        schedLogger.info(`🔍 [诊断] 写入阅读清单后，poolStatus='recommended' 的文章数: ${poolAfterWrite}`)
      }

      // 9. 图标会在下次 updateBadge() 调用时自动更新（无需手动触发）

      const duration = Date.now() - startTime
      schedLogger.info(`✅ 推荐池补充完成`, {
        '补充数量': recommendations.length,
        '当前池容量': `${currentPoolSize + recommendations.length}/${targetPoolSize}`,
        '耗时': `${duration}ms`
      })

    } catch (error) {
      schedLogger.error('❌ 推荐池补充失败:', error)
    } finally {
      this.isRefilling = false
    }
  }

  /**
   * 清理超出容量的推荐（退回候选池）
   * 
   * 策略：保留高分推荐，将低分推荐退回候选池
   */
  private async cleanupExcessRecommendations(targetPoolSize: number): Promise<void> {
    try {
      // 获取当前所有推荐池文章（包括已读和未读）
      const allPopupArticles = await db.feedArticles
        .filter(a => a.poolStatus === 'recommended')
        .toArray()

      schedLogger.info(`🔍 [cleanupExcessRecommendations] 检查推荐池: 当前=${allPopupArticles.length}, 容量=${targetPoolSize}`)
      
      if (allPopupArticles.length <= targetPoolSize) {
        schedLogger.debug(`推荐池大小正常: ${allPopupArticles.length}/${targetPoolSize}`)
        return
      }

      schedLogger.warn(`⚠️ 推荐池超出容量: ${allPopupArticles.length}/${targetPoolSize}，开始清理...`)

      // 按评分降序排序
      const sorted = allPopupArticles.sort((a, b) => 
        (b.analysisScore || 0) - (a.analysisScore || 0)
      )

      // 保留高分的 targetPoolSize 篇，其余退回候选池
      const toKeep = sorted.slice(0, targetPoolSize)
      const toMoveBack = sorted.slice(targetPoolSize)

      const now = Date.now()
      let movedCount = 0

      for (const article of toMoveBack) {
        try {
          // 退回候选池
          await db.feedArticles.update(article.id, {
            poolStatus: 'candidate',
            popupAddedAt: undefined,
            poolExitedAt: now,
            poolExitReason: 'capacity_cleanup'
          })
          movedCount++
        } catch (error) {
          schedLogger.error(`退回候选池失败: ${article.id}`, error)
        }
      }

      schedLogger.info(`✅ 清理完成: 退回 ${movedCount} 篇到候选池，保留 ${toKeep.length} 篇高分推荐`)
      schedLogger.debug(`保留评分范围: ${toKeep[toKeep.length - 1]?.analysisScore?.toFixed(2)} - ${toKeep[0]?.analysisScore?.toFixed(2)}`)
      if (toMoveBack.length > 0) {
        schedLogger.debug(`退回评分范围: ${toMoveBack[toMoveBack.length - 1]?.analysisScore?.toFixed(2)} - ${toMoveBack[0]?.analysisScore?.toFixed(2)}`)
      }
    } catch (error) {
      schedLogger.error('❌ 清理推荐池失败:', error)
    }
  }

  /**
   * 从候选池获取文章
   */
  private async getCandidateArticles(limit: number, threshold: number): Promise<FeedArticle[]> {
    try {
      schedLogger.info(`🔍 查询候选池: 需要 ${limit} 篇，评分阈值 ${threshold.toFixed(2)}`)
      
      const candidates = await db.feedArticles
        .filter(a => {
          // 必须是候选池文章
          if (a.poolStatus !== 'candidate') return false
          // 必须还在源中
          if (a.inFeed === false) return false
          // 必须有评分且达到阈值
          if (!a.analysisScore || a.analysisScore < threshold) return false
          return true
        })
        .toArray()

      schedLogger.info(`📊 候选池统计: 合格文章 ${candidates.length} 篇`, {
        scoreRange: candidates.length > 0 ? {
          min: Math.min(...candidates.map(a => a.analysisScore || 0)).toFixed(2),
          max: Math.max(...candidates.map(a => a.analysisScore || 0)).toFixed(2)
        } : null
      })

      // 按评分降序排序，取前 N 篇
      const sorted = candidates.sort((a, b) => 
        (b.analysisScore || 0) - (a.analysisScore || 0)
      )

      const selected = sorted.slice(0, limit)
      
      if (selected.length < limit) {
        schedLogger.warn(`⚠️ 候选文章不足: 需要 ${limit} 篇，实际 ${selected.length} 篇`)
      }
      
      schedLogger.info(`✅ 选择文章: ${selected.length} 篇`, {
        articles: selected.map(a => ({
          title: a.title?.substring(0, 30),
          score: a.analysisScore?.toFixed(2)
        }))
      })

      return selected
    } catch (error) {
      schedLogger.error('获取候选文章失败:', error)
      return []
    }
  }

  /**
   * 创建推荐记录（Phase 13+: 直接更新 feedArticles，不再写入 recommendations 表）
   * 
   * 注意：容量检查已在 refill() 中完成，这里直接处理传入的文章
   */
  private async createRecommendations(articles: FeedArticle[]): Promise<FeedArticle[]> {
    const updatedArticles: FeedArticle[] = []
    const now = Date.now()

    // 获取策略配置的推荐池容量（用于日志）
    const strategy = await getCurrentStrategy()
    const targetPoolSize = strategy?.strategy.recommendation.targetPoolSize || 6

    // 检查当前推荐池大小（用于日志）
    const currentPoolSize = await db.feedArticles
      .filter(a => {
        const isPopup = a.poolStatus === 'recommended'
        const isUnread = !a.isRead
        const notDismissed = a.feedback !== 'dismissed'
        return isPopup && isUnread && notDismissed
      })
      .count()

    schedLogger.debug(`开始将 ${articles.length} 篇文章加入弹窗推荐 (当前: ${currentPoolSize}/${targetPoolSize})`)

    for (const article of articles) {
      try {
        // 直接更新文章状态为弹窗推荐
        await db.feedArticles.update(article.id, {
          poolStatus: 'recommended',
          popupAddedAt: now,
          recommendedPoolAddedAt: now,  // 兼容旧字段
          isRead: false,                 // 初始化为未读
        })
        
        schedLogger.debug(`✅ 文章已加入弹窗: ${article.id}, title: ${article.title}`)
        
        // 验证更新成功
        const updated = await db.feedArticles.get(article.id)
        if (!updated || updated.poolStatus !== 'recommended') {
          schedLogger.error(`⚠️ 验证失败：文章状态未更新 ${article.id}`, {
            expected: 'recommended',
            actual: updated?.poolStatus
          })
        } else {
          schedLogger.debug(`✓ 验证成功：文章状态 = recommended, ${article.id}`)
          updatedArticles.push(updated)
        }
      } catch (error) {
        schedLogger.error(`❌ 更新文章状态失败: ${article.id}`, error)
      }
    }

    // 最终验证：查询数据库中弹窗状态的文章数量
    const finalCount = await db.feedArticles
      .filter(a => {
        const isPopup = a.poolStatus === 'recommended'
        const isUnread = !a.isRead
        const notDismissed = a.feedback !== 'dismissed'
        return isPopup && isUnread && notDismissed
      })
      .count()
    schedLogger.info(`📊 创建完成后数据库验证：弹窗未读文章数 = ${finalCount}`)

    return updatedArticles
  }

  /**
   * 写入阅读清单（Phase 13+: 改为接收 FeedArticle 数组）
   */
  private async writeToReadingList(articles: FeedArticle[]): Promise<void> {
    try {
      // 获取翻译配置
      const uiConfig = await getUIConfig()
      const autoTranslateEnabled = uiConfig.autoTranslate || false
      
      // 获取阅读清单配置（包含标题前缀）
      const recConfig = await getRecommendationConfig()
      const titlePrefix = recConfig.readingList?.titlePrefix || '🤫 '
      
      // 获取目标语言
      const chromeLanguage = chrome.i18n.getUILanguage()
      const currentLanguage = chromeLanguage.toLowerCase() // 'zh-CN' 或 'en'
      
      schedLogger.info(`📝 准备写入阅读清单: ${articles.length} 篇文章`, {
        autoTranslateEnabled,
        currentLanguage,
        titlePrefix
      })
      
      for (const article of articles) {
        let displayUrl = article.link
        let displayTitle = article.title
        let usingTranslation = false
        
        // 诊断日志：检查文章翻译状态
        schedLogger.debug('检查文章翻译状态:', {
          articleId: article.id,
          title: article.title,
          hasTranslation: !!article.translation,
          autoTranslateEnabled,
          translationDetails: article.translation ? {
            sourceLang: article.translation.sourceLanguage,
            targetLang: article.translation.targetLanguage,
            hasTranslatedTitle: !!article.translation.translatedTitle
          } : null
        })
        
        // ✅ 修复: 查询订阅源的翻译设置
        let feedUseGoogleTranslate = true // 默认允许谷歌翻译
        try {
          const feed = await db.discoveredFeeds.get(article.feedId)
          if (feed) {
            feedUseGoogleTranslate = feed.useGoogleTranslate !== false
          }
        } catch (err) {
          schedLogger.warn('获取订阅源翻译设置失败，使用默认值 (允许翻译):', err)
        }
        
        // 如果启用自动翻译且文章有翻译且订阅源允许谷歌翻译
        if (autoTranslateEnabled && article.translation && feedUseGoogleTranslate) {
          const targetLang = article.translation.targetLanguage
          const sourceLang = article.translation.sourceLanguage
          
          // 检查翻译是否匹配当前语言，且源语言不同于目标语言
          const langMatches = targetLang.toLowerCase().startsWith(currentLanguage.split('-')[0]) ||
                            currentLanguage.startsWith(targetLang.toLowerCase().split('-')[0])
          const needsTranslation = !sourceLang.toLowerCase().startsWith(targetLang.toLowerCase().split('-')[0])
          
          schedLogger.debug('语言匹配检查:', {
            targetLang,
            sourceLang,
            currentLanguage,
            langMatches,
            needsTranslation,
            feedUseGoogleTranslate
          })
          
          if (langMatches && needsTranslation) {
            displayTitle = article.translation.translatedTitle || article.title
            displayUrl = this.generateTranslateGoogUrl(article.link, targetLang)
            usingTranslation = true
            
            schedLogger.info('✅ 使用翻译链接:', {
              articleId: article.id,
              originalTitle: article.title,
              translatedTitle: displayTitle,
              originalUrl: article.link,
              translatedUrl: displayUrl,
              sourceLang,
              targetLang,
              feedUseGoogleTranslate
            })
          } else {
            schedLogger.info('❌ 不使用翻译链接:', {
              articleId: article.id,
              reason: !langMatches ? '语言不匹配' : '不需要翻译',
              sourceLang,
              targetLang,
              currentLanguage,
              langMatches,
              needsTranslation,
              feedUseGoogleTranslate
            })
          }
        } else if (autoTranslateEnabled && article.translation && !feedUseGoogleTranslate) {
          // 订阅源禁用谷歌翻译，但仍使用翻译标题
          displayTitle = article.translation.translatedTitle || article.title
          schedLogger.info('📝 订阅源禁用谷歌翻译，使用翻译标题但保留原文链接:', {
            articleId: article.id,
            feedId: article.feedId,
            originalTitle: article.title,
            translatedTitle: displayTitle,
            link: article.link,
            feedUseGoogleTranslate
          })
        } else if (autoTranslateEnabled && !article.translation) {
          schedLogger.warn('⚠️ 自动翻译已启用，但文章无翻译数据:', {
            articleId: article.id,
            title: article.title,
            link: article.link
          })
        }
        
        // 添加标题前缀（避免重复添加）
        const finalTitle = (titlePrefix && !displayTitle.startsWith(titlePrefix))
          ? `${titlePrefix}${displayTitle}`
          : displayTitle
        
        // 添加推荐 ID 追踪参数到 URL
        const urlWithTracking = ReadingListManager.addTrackingParam(displayUrl, article.id)
        
        const ok = await ReadingListManager.addToReadingList(
          finalTitle,
          urlWithTracking,  // 使用带追踪参数的 URL
          article.isRead || false
        )
        
        if (ok) {
          // 记录映射关系（用于删除和状态同步）
          const normalizedOriginalUrl = ReadingListManager.normalizeUrlForTracking(article.link)
          const normalizedDisplayUrl = ReadingListManager.normalizeUrlForTracking(displayUrl)
          const shortId = ReadingListManager.hashId(article.id)  // 生成短 ID
          
          await db.readingListEntries.put({
            normalizedUrl: normalizedOriginalUrl,  // 主键，使用原文URL
            url: urlWithTracking,                   // 实际显示的URL（带追踪参数）
            originalUrl: article.link,              // 始终保存原文URL
            recommendationId: article.id,
            shortId: shortId,                       // 存储短 ID
            addedAt: Date.now()
          })
          
          // 如果使用了翻译链接，额外记录一个翻译URL的映射
          if (displayUrl !== article.link) {
            await db.readingListEntries.put({
              normalizedUrl: normalizedDisplayUrl,
              url: urlWithTracking,               // 使用带追踪参数的 URL
              originalUrl: article.link,
              recommendationId: article.id,
              shortId: shortId,                   // 同样存储短 ID
              addedAt: Date.now()
            })
          }
        }
      }
      schedLogger.info(`✅ 已将 ${articles.length} 条推荐写入阅读清单`)
    } catch (error) {
      schedLogger.warn('写入阅读清单失败:', error)
    }
  }

  /**
   * 生成 translate.goog 格式的翻译 URL
   */
  private generateTranslateGoogUrl(url: string, targetLang: string): string {
    try {
      const urlObj = new URL(url)
      
      // 将域名中的点替换为短横线
      // 例如：example.com → example-com
      const translatedHost = urlObj.hostname.replace(/\./g, '-')
      
      // 构造新 URL
      const translatedUrl = new URL(`https://${translatedHost}.translate.goog${urlObj.pathname}${urlObj.search}`)
      
      // 添加翻译参数
      translatedUrl.searchParams.set('_x_tr_sl', 'auto')     // 源语言：自动检测
      translatedUrl.searchParams.set('_x_tr_tl', targetLang) // 目标语言
      translatedUrl.searchParams.set('_x_tr_hl', targetLang) // 界面语言
      
      // 保留原始 hash
      if (urlObj.hash) {
        translatedUrl.hash = urlObj.hash
      }
      
      return translatedUrl.toString()
    } catch (error) {
      // 如果 URL 解析失败，降级使用传统格式
      schedLogger.warn('生成 translate.goog URL 失败，使用传统格式', { url, error })
      const encodedUrl = encodeURIComponent(url)
      return `https://translate.google.com/translate?sl=auto&tl=${targetLang}&u=${encodedUrl}`
    }
  }

  /**
   * 调度下次执行
   */
  private async scheduleNext(): Promise<void> {
    try {
      const intervalMinutes = this.config.checkIntervalMinutes
      this.nextRunTime = Date.now() + intervalMinutes * 60 * 1000

      await chrome.alarms.create(this.alarmName, {
        delayInMinutes: intervalMinutes
      })

      schedLogger.debug(`📅 下次补充检查: ${intervalMinutes} 分钟后`)
    } catch (error) {
      schedLogger.error('调度下次补充失败:', error)
    }
  }

  /**
   * 更新策略配置
   */
  async updateStrategy(strategy: any): Promise<void> {
    schedLogger.info('更新补充调度器策略', {
      targetPoolSize: strategy.strategy.recommendation.targetPoolSize,
      cooldownMinutes: strategy.strategy.recommendation.cooldownMinutes,
      dailyLimit: strategy.strategy.recommendation.dailyLimit
    })

    // 更新 PoolRefillManager 的策略
    const refillManager = getRefillManager()
    refillManager.updatePolicy({
      minInterval: strategy.strategy.recommendation.cooldownMinutes * 60 * 1000,
      maxDailyRefills: strategy.strategy.recommendation.dailyLimit
    })

    schedLogger.info('✅ 补充调度器策略已更新')

    // 如果正在运行，重新启动以应用新配置
    if (this.isRunning) {
      schedLogger.info('重新启动调度器以应用新策略...')
      await this.stop()
      await this.start()
    }
  }

  /**
   * 获取调度器状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isRefilling: this.isRefilling,
      nextRunTime: this.nextRunTime,
      config: this.config
    }
  }

  /**
   * 手动触发补充
   */
  async triggerManual(): Promise<void> {
    schedLogger.info('手动触发推荐池补充...')
    await this.runRefill()
  }
}

// 导出单例
export const refillScheduler = new RefillScheduler()
