/**
 * Chrome Reading List 管理器
 * 
 * 功能：
 * - 管理 Chrome 阅读列表条目（添加/删除/更新/查询）
 * - 追踪从推荐系统保存的文章
 * - 监听阅读列表变化，检测"稍后读"文章被真实阅读
 * - 管理首次使用提示
 * 
 * 浏览器兼容性：
 * - Chrome 89+: 完全支持
 * - Edge: 不支持（API 未实现）
 */

import { logger } from '@/utils/logger'
import { saveUrlTracking } from '@/storage/tracking-storage'
import type { Recommendation, ConfirmedVisit } from '@/types/database'
import { db, dismissRecommendations } from '@/storage/db'
import { isReadingListAvailable, getBrowserCompatInfo } from '@/utils/browser-compat'
import { FeedManager } from '@/core/rss/managers/FeedManager'
import type { ReadingListCleanupConfig } from '@/storage/recommendation-config'

const rlLogger = logger.withTag('ReadingListManager')

/**
 * 阅读列表引导状态
 */
interface ReadingListOnboarding {
  tipCount: number          // 已显示提示次数
  firstSaveTime?: number    // 首次保存时间
}

const ONBOARDING_KEY = 'readingListOnboarding'
const MAX_TIP_COUNT = 3

export class ReadingListManager {
  /**
   * 在 URL 上附加推荐ID参数（sf_rec），若已存在则覆写
   */
  private static appendRecommendationId(url: string, recId: string): string {
    try {
      const u = new URL(url)
      u.searchParams.set('sf_rec', recId)
      return u.toString()
    } catch {
      return url
    }
  }
  /**
   * 检查阅读列表功能是否可用
   * @returns 是否支持阅读列表
   */
  static isAvailable(): boolean {
    return isReadingListAvailable()
  }

  /**
   * 规范化 URL 用于数据库查询
   * 移除 UTM 和其他追踪参数，确保翻译 URL 和原始 URL 能匹配
   * 
   * @param url - 原始 URL
   * @returns 规范化后的 URL
   */
  static normalizeUrlForTracking(url: string): string {
    try {
      let workingUrl = url
      // 1) 处理 translate.google.com/translate?u= 原始链接
      if (workingUrl.includes('translate.google.com/translate')) {
        try {
          const tUrl = new URL(workingUrl)
          const uParam = tUrl.searchParams.get('u')
          if (uParam) {
            workingUrl = uParam
          }
        } catch {}
      }

      const urlObj = new URL(workingUrl)

      // 2) 处理 *.translate.goog 主机，将原始主机还原
      if (urlObj.hostname.endsWith('.translate.goog')) {
        const rawHost = urlObj.hostname.replace('.translate.goog', '')
        // 将连字符还原为点（translate.goog 用 - 代替 .）
        const restoredHost = rawHost.replace(/-/g, '.')
        urlObj.hostname = restoredHost
        // 删除 Google 翻译附加的参数
        Array.from(urlObj.searchParams.keys())
          .filter((k) => k.startsWith('_x_tr_'))
          .forEach((k) => urlObj.searchParams.delete(k))
      }
      
      // 移除常见的追踪参数
      const trackedParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
        'fbclid', 'gclid', 'msclkid', 'gclsrc',
        '_ga', '_gid', 'source', 'campaign',
        // 扩展自定义参数（用于在阅读清单中携带推荐ID）
        'sf_rec'
      ]
      
      trackedParams.forEach(param => {
        urlObj.searchParams.delete(param)
      })
      
      // 返回规范化后的 URL（保留其他有意义的参数）
      return urlObj.toString()
    } catch {
      // 如果 URL 无效，返回原始 URL
      return url
    }
  }

  /**
   * 将推荐文章保存到 Chrome 阅读列表
   * @param recommendation 推荐条目
   * @param autoTranslateEnabled 是否启用自动翻译
   * @param interfaceLanguage 界面语言（用于生成翻译链接）
   * @returns 是否成功保存
   */
  static async saveRecommendation(
    recommendation: Recommendation,
    autoTranslateEnabled: boolean = false,
    interfaceLanguage: string = 'zh-CN',
    titlePrefix: string = '📰 '
  ): Promise<boolean> {
    // 检查浏览器是否支持阅读列表
    if (!this.isAvailable()) {
      const compatInfo = getBrowserCompatInfo()
      rlLogger.warn('当前浏览器不支持阅读列表功能', {
        browser: compatInfo.browser,
        version: compatInfo.version,
      })
      return false
    }

    try {
      // 检查订阅源的谷歌翻译设置
      let feedUseGoogleTranslate = true // 默认使用谷歌翻译
      if (recommendation.sourceUrl) {
        try {
          const feedManager = new FeedManager()
          const feed = await feedManager.getFeedByUrl(recommendation.sourceUrl)
          if (feed) {
            feedUseGoogleTranslate = feed.useGoogleTranslate !== false
            rlLogger.debug(`订阅源翻译设置: ${feed.title}, useGoogleTranslate=${feedUseGoogleTranslate}`)
          }
        } catch (err) {
          rlLogger.warn('获取订阅源设置失败，使用默认（谷歌翻译）:', err)
        }
      }
      
      // 决定使用原文链接还是翻译链接
      let urlToSave = recommendation.url
      let titleToSave = recommendation.title
      
      // 如果订阅源禁用了谷歌翻译，直接使用原文
      if (!feedUseGoogleTranslate) {
        rlLogger.info('订阅源禁用谷歌翻译，使用原文链接', {
          url: recommendation.url,
          source: recommendation.source
        })
        // 在原文链接上附加推荐ID
        urlToSave = ReadingListManager.appendRecommendationId(urlToSave, recommendation.id!)
      } else if (autoTranslateEnabled && recommendation.translation) {
        // 如果启用自动翻译且存在翻译数据（说明文章语言和界面语言不同）
        // 生成谷歌翻译链接
        const originalWithRec = ReadingListManager.appendRecommendationId(recommendation.url, recommendation.id!)
        const encodedUrl = encodeURIComponent(originalWithRec)
        urlToSave = `https://translate.google.com/translate?sl=auto&tl=${interfaceLanguage}&u=${encodedUrl}`
        // 使用翻译后的标题
        titleToSave = recommendation.translation.translatedTitle
        
        rlLogger.info('使用翻译链接保存到阅读列表', {
          original: recommendation.url,
          translated: urlToSave,
          language: `${recommendation.translation.sourceLanguage}→${interfaceLanguage}`
        })
      } else {
        // 使用原文且允许翻译开关但无需翻译时，也附加推荐ID
        urlToSave = ReadingListManager.appendRecommendationId(urlToSave, recommendation.id!)
      }

      // 应用可选的标题前缀，避免重复添加
      if (titlePrefix && !titleToSave.startsWith(titlePrefix)) {
        titleToSave = `${titlePrefix}${titleToSave}`
      }
      
      // 1. 添加到 Chrome 阅读列表
      await chrome.readingList.addEntry({
        title: titleToSave,
        url: urlToSave,
        hasBeenRead: false,
      })

      // 2. 更新 Dexie 中的推荐状态
      await db.recommendations.update(recommendation.id, {
        savedToReadingList: true,
        savedAt: Date.now(),
        feedback: 'later',  // Phase 14: 标记为"稍后读"
      })
      
      // Phase 14: 同步更新 feedArticles 表中的文章状态
      try {
        const article = await db.feedArticles
          .where('link').equals(recommendation.url)
          .first()
        
        if (article) {
          const now = Date.now()
          await db.feedArticles.update(article.id, {
            // 移出推荐池（用户已处理）
            poolStatus: 'exited',
            poolExitedAt: now,
            poolExitReason: 'saved',
            // 旧字段兼容
            inPool: false,
            poolRemovedAt: now,
            poolRemovedReason: 'saved' as any,  // 旧类型不支持 saved，但保留兼容
          })
          rlLogger.debug('已同步更新文章状态', { articleId: article.id })
        }
      } catch (syncError) {
        rlLogger.warn('同步更新 feedArticles 失败（不影响主功能）:', syncError)
      }
      
      // 3. 统一追踪机制：预设追踪标记
      // 用途：30秒验证时识别"来自阅读列表"
      // 注：Chrome Reading List API 无 onEntryOpened 事件
      //     保存时预设标记，打开时无法直接监听
      // 使用 local storage 而非 session，避免扩展重启后丢失
      // ⚠️ 重要：使用实际保存的URL（可能是翻译链接）作为追踪键
      try {
        await saveUrlTracking(urlToSave, {
          recommendationId: recommendation.id!,
          title: recommendation.title,
          source: 'readingList',
          action: 'opened'  // 表示"通过阅读列表打开"
        })
        rlLogger.debug('已预设阅读列表追踪标记', { url: urlToSave })
      } catch (storageError) {
        rlLogger.warn('保存追踪标记失败（不影响主功能）', storageError)
      }

      rlLogger.info('已保存到阅读列表', {
        id: recommendation.id,
        title: titleToSave,
        url: urlToSave,
      })

      // 4. 记录到 readingListEntries 表，便于清理和标记来源
      try {
        const normalizedUrl = ReadingListManager.normalizeUrlForTracking(urlToSave)
        await db.readingListEntries.put({
          normalizedUrl,
          url: urlToSave,
          recommendationId: recommendation.id,
          addedAt: Date.now(),
          titlePrefix
        })
        rlLogger.info('💾 已保存阅读列表条目到数据库', {
          '原始URL': urlToSave,
          '规范化URL': normalizedUrl,
          '推荐ID': recommendation.id,
          '是否翻译链接': urlToSave.includes('translate.google')
        })
      } catch (entryError) {
        rlLogger.warn('记录阅读列表条目失败（不影响主功能）:', entryError)
      }

      // 3. 检查是否需要显示提示
      await this.maybeShowOnboardingTip()

      return true
    } catch (error) {
      const errorMessage = (error as Error).message || ''
      
      // 如果文章已在阅读列表中，也算成功
      if (errorMessage.includes('Duplicate') || errorMessage.includes('already exists')) {
        rlLogger.debug('文章已在阅读列表中', { url: recommendation.url })
        
        // 仍然更新 Dexie 状态
        await db.recommendations.update(recommendation.id, {
          savedToReadingList: true,
          savedAt: Date.now(),
          feedback: 'later',  // Phase 14: 标记为"稍后读"
        })

        try {
          const normalizedUrl = ReadingListManager.normalizeUrlForTracking(urlToSave)
          await db.readingListEntries.put({
            normalizedUrl,
            url: urlToSave,
            recommendationId: recommendation.id,
            addedAt: Date.now(),
            titlePrefix
          })
          rlLogger.info('💾 已保存阅读列表条目到数据库（重复条目分支）', {
            '原始URL': urlToSave,
            '规范化URL': normalizedUrl,
            '推荐ID': recommendation.id,
            '是否翻译链接': urlToSave.includes('translate.google')
          })
        } catch (entryError) {
          rlLogger.warn('记录阅读列表条目失败（duplicate 分支）:', entryError)
        }
        
        // Phase 14: 同步更新 feedArticles
        try {
          const article = await db.feedArticles
            .where('link').equals(recommendation.url)
            .first()
          
          if (article) {
            const now = Date.now()
            await db.feedArticles.update(article.id, {
              poolStatus: 'exited',
              poolExitedAt: now,
              poolExitReason: 'saved',
              inPool: false,
              poolRemovedAt: now,
            })
          }
        } catch (syncError) {
          rlLogger.warn('同步更新 feedArticles 失败:', syncError)
        }
        
        return true
      }
      
      rlLogger.error('保存到阅读列表失败', error)
      return false
    }
  }

  /**
   * 检查是否需要显示首次使用提示
   */
  private static async maybeShowOnboardingTip(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(ONBOARDING_KEY)
      const onboarding: ReadingListOnboarding = result[ONBOARDING_KEY] || {
        tipCount: 0,
      }

      // 如果已经提示过 3 次，不再提示
      if (onboarding.tipCount >= MAX_TIP_COUNT) {
        return
      }

      // 更新提示次数
      onboarding.tipCount++
      if (!onboarding.firstSaveTime) {
        onboarding.firstSaveTime = Date.now()
      }
      await chrome.storage.local.set({ [ONBOARDING_KEY]: onboarding })

      // 根据提示次数显示不同内容
      let message: string
      if (onboarding.tipCount === 1) {
        message = 
          '✅ 已保存到阅读列表！\n\n' +
          '你可以在 Chrome 侧边栏中查看：\n' +
          '1. 点击地址栏旁的 📑 图标\n' +
          '2. 选择"阅读列表"'
      } else if (onboarding.tipCount === 2) {
        const count = await this.getUnreadCount()
        message = 
          `💡 阅读列表中已有 ${count} 篇文章\n\n` +
          '点击地址栏旁的 📑 图标可随时查看'
      } else {
        message = '✅ 已保存到阅读列表'
      }

      // 记录到日志而非使用 alert (background service worker 不支持 alert)
      rlLogger.info('已显示首次使用提示', { message, count: onboarding.tipCount })
    } catch (error) {
      rlLogger.error('显示提示失败', error)
    }
  }

  /**
   * 查询阅读列表中的条目
   */
  static async getEntries(filter?: {
    url?: string
    hasBeenRead?: boolean
  }): Promise<chrome.readingList.ReadingListEntry[]> {
    if (!this.isAvailable()) {
      return []
    }
    try {
      return await chrome.readingList.query(filter || {})
    } catch (error) {
      rlLogger.error('查询阅读列表失败', error)
      return []
    }
  }

  /**
   * 获取未读条目数量
   */
  static async getUnreadCount(): Promise<number> {
    if (!this.isAvailable()) {
      return 0
    }
    try {
      const entries = await chrome.readingList.query({ hasBeenRead: false })
      return entries.length
    } catch (error) {
      rlLogger.error('获取未读数量失败', error)
      return 0
    }
  }

  /**
   * 检查 URL 是否在阅读列表中
   */
  static async isInReadingList(url: string): Promise<boolean> {
    if (!this.isAvailable()) {
      return false
    }
    try {
      const entries = await chrome.readingList.query({ url })
      return entries.length > 0
    } catch (error) {
      rlLogger.error('检查阅读列表状态失败', error)
      return false
    }
  }

  /**
   * 设置阅读列表事件监听器
   * 监听文章被标记为已读，并将其记录为真实阅读
   */
  static setupListeners(): void {
    // 检查浏览器是否支持阅读列表
    if (!this.isAvailable()) {
      rlLogger.info('当前浏览器不支持阅读列表，跳过监听器设置')
      return
    }

    // 监听条目更新（仅记录日志，不作为阅读信号）
    chrome.readingList.onEntryUpdated.addListener(async (entry) => {
      // 策略B：忽略"已读"按钮，依赖实际访问监控
      rlLogger.debug('阅读列表条目更新（忽略，仅记录日志）', {
        title: entry.title,
        url: entry.url,
        hasBeenRead: entry.hasBeenRead,
      })
    })

    // 监听新增条目（用于调试和统计）
    chrome.readingList.onEntryAdded.addListener((entry) => {
      rlLogger.debug('阅读列表新增条目', {
        title: entry.title,
        url: entry.url,
      })
    })

    // 监听移除条目（区分是否阅读后删除）
    chrome.readingList.onEntryRemoved.addListener(async (entry) => {
      rlLogger.debug('阅读列表移除条目', {
        title: entry.title,
        url: entry.url,
        hasBeenRead: entry.hasBeenRead
      })
      
      // 检查是否是未读删除（视为"不想读"）
      // 传递 hasBeenRead 状态以区分已读删除和未读删除
      await this.handleReadingListRemoved(entry.url, entry.hasBeenRead)

      // 清理内部追踪
      try {
        await db.readingListEntries.delete(entry.url)
      } catch (error) {
        rlLogger.warn('删除阅读列表追踪记录失败', error)
      }
    })

    rlLogger.info('阅读列表事件监听器已设置')
  }

  /**
   * 处理阅读列表条目被删除
   * 策略B：检查数据库中是否有实际访问记录，而不是 session storage
   * 
   * @param url - 被删除的条目URL
   * @param hasBeenRead - Chrome阅读列表中的已读状态
   */
  private static async handleReadingListRemoved(url: string, hasBeenRead?: boolean): Promise<void> {
    try {
      const trackingRecord = await db.readingListEntries.get(url)
      let recommendation: Recommendation | undefined

      // 1. 查找对应的推荐记录
      if (trackingRecord?.recommendationId) {
        recommendation = await db.recommendations.get(trackingRecord.recommendationId)
      }
      if (!recommendation) {
        recommendation = await db.recommendations
          .filter((rec) => rec.url === url && rec.savedToReadingList === true)
          .first()
      }

      if (!recommendation) {
        rlLogger.debug('未找到对应的推荐记录或该条目非推荐保存', { url })
        return
      }

      // 2. 检查数据库中是否有实际访问记录（策略B）
      const confirmedVisit = await db.confirmedVisits
        .filter((visit) => visit.url === url && visit.recommendationId === recommendation.id)
        .first()

      if (confirmedVisit) {
        // 有访问记录，说明用户真的打开并阅读了（达到 30 秒阈值）
        rlLogger.info('✅ [稍后读] 删除前已实际阅读 → 视为【正式阅读】', {
          id: recommendation.id,
          title: recommendation.title,
          url,
          visitTime: new Date(confirmedVisit.visitTime).toISOString(),
          duration: confirmedVisit.duration,
          处理方式: '已有 ConfirmedVisit，无需额外处理',
        })

        // 更新推荐记录的 readAt 时间
        await db.recommendations.update(recommendation.id, {
          readAt: confirmedVisit.visitTime,
          visitCount: (recommendation.visitCount || 0) + 1,
        })
        return
      }

      // 3. 检查Chrome阅读列表中的已读状态
      // 如果已标记为已读（hasBeenRead=true），说明是从"已读"tab删除
      // 这是系统的正常清理行为，不视为"不想读"，不做任何特殊处理
      if (hasBeenRead) {
        rlLogger.info('📚 [稍后读] 删除已读条目 → 正常清理', {
          id: recommendation.id,
          title: recommendation.title,
          url,
          hasBeenRead,
          处理方式: '不标记为"不想读"，无需额外处理',
        })
        return
      }

      // 4. 从"未读"tab删除：没有访问记录且未标记为已读
      // 说明从未打开或未达到 30 秒阈值，视为"不想读"
      // 统一追踪机制：使用与dismissSelected相同的逻辑
      rlLogger.info('❌ [稍后读] 删除前从未阅读 → 视为【不想读】', {
        id: recommendation.id,
        title: recommendation.title,
        url,
        hasBeenRead,
        source: 'readingList',
        处理方式: '调用 dismissRecommendations(统一逻辑)',
      })

      // 使用统一的 dismissRecommendations 函数
      await dismissRecommendations([recommendation.id])
    } catch (error) {
      rlLogger.error('处理阅读列表删除失败', error)
    }
  }

  /**
   * 判断条目是否由本扩展添加
   */
  static async isOurEntry(url: string): Promise<boolean> {
    try {
      const record = await db.readingListEntries.get(url)
      return !!record
    } catch (error) {
      rlLogger.warn('查询阅读列表来源失败', error)
      return false
    }
  }

  /**
   * 手动清理阅读列表（仅清理本扩展添加的条目）
   */
  static async cleanup(config: ReadingListCleanupConfig): Promise<{ removed: number; total: number }> {
    if (!this.isAvailable()) return { removed: 0, total: 0 }
    if (!config.enabled) return { removed: 0, total: 0 }

    try {
      const ourRecords = await db.readingListEntries.toArray()
      const ourUrls = new Set(ourRecords.map(r => r.url))
      const allEntries = await chrome.readingList.query({})
      const ourEntries = allEntries.filter(e => ourUrls.has(e.url))
      const removalSet = new Set<string>()
      const now = Date.now()
      const cutoff = config.retentionDays > 0
        ? now - config.retentionDays * 24 * 60 * 60 * 1000
        : 0

      // 1) 时间过期
      if (cutoff > 0) {
        ourEntries.forEach(entry => {
          if (entry.creationTime < cutoff) {
            if (!config.keepUnread || entry.hasBeenRead) {
              removalSet.add(entry.url)
            }
          }
        })
      }

      // 2) 条目数超限（移除最早的）
      if (config.maxEntries > 0 && ourEntries.length > config.maxEntries) {
        const sorted = [...ourEntries].sort((a, b) => a.creationTime - b.creationTime)
        const overflow = sorted.length - config.maxEntries
        for (let i = 0; i < overflow; i++) {
          const entry = sorted[i]
          if (config.keepUnread && !entry.hasBeenRead) continue
          removalSet.add(entry.url)
        }
      }

      let removed = 0
      for (const url of removalSet) {
        try {
          await chrome.readingList.removeEntry({ url })
          await db.readingListEntries.delete(url)
          removed++
        } catch (err) {
          rlLogger.warn('清理阅读列表条目失败', { url, err })
        }
      }

      rlLogger.info('阅读列表清理完成', {
        total: ourEntries.length,
        removed
      })

      return { removed, total: ourEntries.length }
    } catch (error) {
      rlLogger.error('阅读列表清理失败', error)
      return { removed: 0, total: 0 }
    }
  }

  /**
   * 获取已保存到阅读列表的推荐数量
   */
  static async getSavedRecommendationsCount(): Promise<number> {
    try {
      return await db.recommendations
        .where('savedToReadingList')
        .equals(1)
        .count()
    } catch (error) {
      rlLogger.error('获取已保存推荐数量失败', error)
      return 0
    }
  }

  /**
   * 获取已从阅读列表真实阅读的推荐数量
   */
  static async getReadFromListCount(): Promise<number> {
    try {
      return await db.recommendations
        .filter((rec) => rec.savedToReadingList === true && rec.readAt !== undefined)
        .count()
    } catch (error) {
      rlLogger.error('获取真实阅读数量失败', error)
      return 0
    }
  }
}
