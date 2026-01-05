/**
 * 数据库迁移测试
 * 
 * 测试 Phase 10 数据迁移的完整性和正确性
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from './index'
import {
  migrateRecommendationStatus,
  calculateArticleImportance,
  runFullMigration,
  needsMigration,
  // Phase 13
  migrateToPoolStatus,
  needsPhase13Migration,
  runPhase13Migration
} from './db-migration'

describe('数据库迁移 - db-migration', () => {
  // 默认 settings（用于测试）
  const defaultSettings = {
    id: 'singleton' as const,
    dwellTime: {
      mode: 'fixed' as const,
      fixedThreshold: 30,
      minThreshold: 20,
      maxThreshold: 60,
      calculatedThreshold: 30
    },
    exclusionRules: {
      autoExcludeIntranet: true,
      autoExcludeSensitive: true,
      customDomains: []
    },
    dataRetention: {
      rawVisitsDays: 90,
      statisticsDays: 365
    }
  }

  beforeEach(async () => {
    // 清空数据库
    await db.recommendations.clear()
    await db.feedArticles.clear()
    await db.settings.clear()
    
    // 初始化 settings（迁移代码需要）
    await db.settings.add(defaultSettings)
  })

  afterEach(async () => {
    // 清理
    await db.recommendations.clear()
    await db.feedArticles.clear()
    await db.settings.clear()
  })

  describe('migrateRecommendationStatus - 推荐状态同步', () => {
    it('应该将活跃推荐状态同步到文章（inPool）', async () => {
      // 准备数据：文章 + 活跃推荐
      const articleId = await db.feedArticles.add({
        id: 'article-1',
        feedId: 'feed-1',
        title: '测试文章',
        link: 'https://example.com/article1',
        published: Date.now(),
        fetched: Date.now(),
        read: false,
        starred: false,
        inFeed: true
      })

      await db.recommendations.add({
        id: 'rec-1',
        url: 'https://example.com/article1',
        title: '测试文章',
        summary: '摘要',
        recommendedAt: Date.now(),
        score: 0.8,
        source: 'ai',
        sourceUrl: 'feed-url',
        isRead: false,
        status: 'active'
      })

      // 执行迁移
      const result = await migrateRecommendationStatus()

      // 验证结果
      expect(result.success).toBe(true)
      expect(result.processed).toBeGreaterThan(0)
      expect(result.synced).toBeGreaterThan(0)

      // 验证文章状态
      const article = await db.feedArticles.get(articleId)
      expect(article?.inPool).toBe(true) // 应该在推荐池中
      expect(article?.recommended).toBe(true)
      expect(article?.poolAddedAt).toBeDefined()
    })

    it('应该将已读状态同步到文章', async () => {
      // 准备数据
      const articleId = await db.feedArticles.add({
        id: 'article-2',
        feedId: 'feed-1',
        title: '测试文章',
        link: 'https://example.com/article1',
        published: Date.now(),
        fetched: Date.now(),
        read: false,
        starred: false,
        inFeed: true
      })

      const clickedAt = Date.now()
      await db.recommendations.add({
        id: 'rec-1',
        url: 'https://example.com/article1',
        title: '测试文章',
        summary: '摘要',
        recommendedAt: Date.now(),
        score: 0.8,
        source: 'ai',
        sourceUrl: 'feed-url',
        isRead: true,
        clickedAt,
        status: 'active' // 使用 active，因为已读文章仍需要标记状态
      })

      // 执行迁移
      const result = await migrateRecommendationStatus()

      // 验证
      expect(result.success).toBe(true)
      const article = await db.feedArticles.get(articleId)
      expect(article?.read).toBe(true)
      expect(article?.poolRemovedAt).toBe(clickedAt)
      expect(article?.poolRemovedReason).toBe('read')
    })

    it('应该将拒绝状态同步到文章', async () => {
      // 准备数据
      const articleId = await db.feedArticles.add({
        id: 'article-3',
        feedId: 'feed-1',
        title: '测试文章',
        link: 'https://example.com/article1',
        published: Date.now(),
        fetched: Date.now(),
        read: false,
        starred: false,
        inFeed: true
      })

      const feedbackAt = Date.now()
      await db.recommendations.add({
        id: 'rec-1',
        url: 'https://example.com/article1',
        title: '测试文章',
        summary: '摘要',
        recommendedAt: Date.now(),
        score: 0.8,
        source: 'ai',
        sourceUrl: 'feed-url',
        isRead: false,
        feedback: 'dismissed',
        feedbackAt,
        status: 'dismissed'
      })

      // 执行迁移
      const result = await migrateRecommendationStatus()

      // 验证
      expect(result.success).toBe(true)
      const article = await db.feedArticles.get(articleId)
      expect(article?.disliked).toBe(true)
      expect(article?.poolRemovedAt).toBe(feedbackAt)
      expect(article?.poolRemovedReason).toBe('disliked')
    })

    it('应该处理推荐记录找不到对应文章的情况', async () => {
      // 只添加推荐，不添加文章
      await db.recommendations.add({
        id: 'rec-1',
        url: 'https://example.com/nonexistent',
        title: '不存在的文章',
        summary: '摘要',
        recommendedAt: Date.now(),
        score: 0.8,
        source: 'ai',
        sourceUrl: 'feed-url',
        isRead: false,
        status: 'active'
      })

      // 执行迁移
      const result = await migrateRecommendationStatus()

      // 应该成功完成，但 synced 为 0
      expect(result.success).toBe(true)
      expect(result.processed).toBe(1)
      expect(result.synced).toBe(0) // 没有文章被同步
      expect(result.errors).toBe(0) // 不应该报错
    })

    it('应该处理空数据库的情况', async () => {
      // 不添加任何数据
      const result = await migrateRecommendationStatus()

      expect(result.success).toBe(true)
      expect(result.processed).toBe(0)
      expect(result.synced).toBe(0)
      expect(result.errors).toBe(0)
    })
  })

  describe('calculateArticleImportance - 重要性评分计算', () => {
    it('应该为被推荐过的文章计算基础评分', async () => {
      const articleId = await db.feedArticles.add({
        id: 'article-4',
        feedId: 'feed-1',
        title: '测试文章',
        link: 'https://example.com/article1',
        published: Date.now(),
        fetched: Date.now(),
        read: false,
        starred: false,
        recommended: true, // 被推荐过
        inFeed: true
      })

      const result = await calculateArticleImportance()

      expect(result.success).toBe(true)
      expect(result.processed).toBe(1)

      const article = await db.feedArticles.get(articleId)
      expect(article?.importance).toBeGreaterThan(0)
      expect(article?.importance).toBeGreaterThanOrEqual(30) // 基础分 30
    })

    it('应该为已读文章增加评分', async () => {
      const articleId = await db.feedArticles.add({
        id: 'article-5',
        feedId: 'feed-1',
        title: '测试文章',
        link: 'https://example.com/article1',
        published: Date.now(),
        fetched: Date.now(),
        read: true,
        starred: false,
        recommended: true,
        inFeed: true
      })

      const result = await calculateArticleImportance()

      expect(result.success).toBe(true)
      const article = await db.feedArticles.get(articleId)
      expect(article?.importance).toBeGreaterThanOrEqual(50) // 30+20
    })

    it('应该为收藏文章大幅增加评分', async () => {
      const articleId = await db.feedArticles.add({
        id: 'article-6',
        feedId: 'feed-1',
        title: '测试文章',
        link: 'https://example.com/article1',
        published: Date.now(),
        fetched: Date.now(),
        read: false,
        starred: true, // 收藏
        inFeed: true
      })

      const result = await calculateArticleImportance()

      expect(result.success).toBe(true)
      const article = await db.feedArticles.get(articleId)
      expect(article?.importance).toBeGreaterThanOrEqual(50) // 收藏 +50
    })

    it('应该处理空数据库的情况', async () => {
      const result = await calculateArticleImportance()

      expect(result.success).toBe(true)
      expect(result.processed).toBe(0)
      expect(result.errors).toBe(0)
    })
  })

  describe('needsMigration - 迁移需求检查', () => {
    it('应该在已完成迁移时返回 false', async () => {
      // 更新 settings，设置迁移已完成
      await db.settings.update('singleton', {
        migrations: { phase10Completed: true }
      })

      const needs = await needsMigration()
      expect(needs).toBe(false)
    })

    it('应该在无文章数据时自动标记迁移完成', async () => {
      // 空数据库
      const needs = await needsMigration()

      expect(needs).toBe(false)
      const settings = await db.settings.get('singleton')
      expect(settings?.migrations?.phase10Completed).toBe(true)
    })
  })

  describe('runFullMigration - 完整迁移流程', () => {
    it('应该按顺序执行所有迁移步骤', async () => {
      // 准备测试数据
      const articleId = await db.feedArticles.add({
        id: 'article-7',
        feedId: 'feed-1',
        title: '测试文章',
        link: 'https://example.com/article1',
        published: Date.now(),
        fetched: Date.now(),
        read: false,
        starred: false,
        inFeed: true
      })

      await db.recommendations.add({
        id: 'rec-1',
        url: 'https://example.com/article1',
        title: '测试文章',
        summary: '摘要',
        recommendedAt: Date.now(),
        score: 0.8,
        source: 'ai',
        sourceUrl: 'feed-url',
        isRead: true,
        status: 'active'
      })

      // 执行完整迁移
      const success = await runFullMigration()

      // 验证成功
      expect(success).toBe(true)

      // 验证迁移标记已设置
      const settings = await db.settings.get('singleton')
      expect(settings?.migrations?.phase10Completed).toBe(true)

      // 验证数据已迁移
      const article = await db.feedArticles.get(articleId)
      expect(article?.read).toBe(true) // 步骤1: 状态同步
      expect(article?.importance).toBeDefined() // 步骤2: 评分计算
    })

    it('应该在迁移失败时返回 false', async () => {
      // Mock 数据库错误
      vi.spyOn(db.feedArticles, 'toArray').mockRejectedValueOnce(
        new Error('Database error')
      )

      const success = await runFullMigration()

      expect(success).toBe(false)
    })
  })

  // ===== Phase 13: poolStatus 迁移测试 =====
  describe('Phase 13 - migrateToPoolStatus', () => {
    it('应该将 recommended=true && inPool=true 迁移到 poolStatus=recommended', async () => {
      // 准备旧格式数据
      await db.feedArticles.add({
        id: 'legacy-recommended',
        feedId: 'feed-1',
        link: 'http://example.com/1',
        title: 'Legacy Recommended',
        published: Date.now(),
        fetched: Date.now(),
        read: false,
        starred: false,
        recommended: true,
        inPool: true,
        poolAddedAt: Date.now() - 1000
      })

      const result = await migrateToPoolStatus()

      expect(result.success).toBe(true)
      expect(result.migrated.toRecommended).toBe(1)

      const article = await db.feedArticles.get('legacy-recommended')
      expect(article?.poolStatus).toBe('recommended')
      expect(article?.recommendedPoolAddedAt).toBeDefined()
    })

    it('应该将 recommended=true && read=true 迁移为已退出', async () => {
      const removedAt = Date.now() - 5000
      await db.feedArticles.add({
        id: 'legacy-read',
        feedId: 'feed-1',
        link: 'http://example.com/2',
        title: 'Legacy Read',
        published: Date.now(),
        fetched: Date.now(),
        read: true,
        starred: false,
        recommended: true,
        inPool: false,
        poolRemovedAt: removedAt,
        poolRemovedReason: 'read'
      })

      const result = await migrateToPoolStatus()

      expect(result.success).toBe(true)
      expect(result.migrated.toExited).toBe(1)

      const article = await db.feedArticles.get('legacy-read')
      expect(article?.poolExitReason).toBe('read')
      expect(article?.poolExitedAt).toBe(removedAt)
    })

    it('应该将有 analysis 且高分的文章迁移到候选池', async () => {
      await db.feedArticles.add({
        id: 'analyzed-high-score',
        feedId: 'feed-1',
        link: 'http://example.com/3',
        title: 'Analyzed High Score',
        published: Date.now(),
        fetched: Date.now(),
        read: false,
        starred: false,
        analysis: {
          topicProbabilities: { 技术: 0.8 },
          confidence: 0.9,
          provider: 'test'
        },
        analysisScore: 7.5
      })

      const result = await migrateToPoolStatus()

      expect(result.success).toBe(true)
      expect(result.migrated.toCandidate).toBe(1)

      const article = await db.feedArticles.get('analyzed-high-score')
      expect(article?.poolStatus).toBe('candidate')
      expect(article?.candidatePoolAddedAt).toBeDefined()
    })

    it('应该将有 analysis 且低分的文章标记为分析未达标', async () => {
      await db.feedArticles.add({
        id: 'analyzed-low-score',
        feedId: 'feed-1',
        link: 'http://example.com/4',
        title: 'Analyzed Low Score',
        published: Date.now(),
        fetched: Date.now(),
        read: false,
        starred: false,
        analysis: {
          topicProbabilities: { 技术: 0.3 },
          confidence: 0.9,
          provider: 'test'
        },
        analysisScore: 4.5
      })

      const result = await migrateToPoolStatus()

      expect(result.success).toBe(true)
      expect(result.migrated.toAnalyzedNotQualified).toBe(1)

      const article = await db.feedArticles.get('analyzed-low-score')
      expect(article?.poolStatus).toBe('analyzed-not-qualified')
    })

    it('应该将无 analysis 且 inFeed=true 的文章迁移到原始池', async () => {
      await db.feedArticles.add({
        id: 'unanalyzed-in-feed',
        feedId: 'feed-1',
        link: 'http://example.com/5',
        title: 'Unanalyzed In Feed',
        published: Date.now(),
        fetched: Date.now(),
        read: false,
        starred: false,
        inFeed: true
      })

      const result = await migrateToPoolStatus()

      expect(result.success).toBe(true)
      expect(result.migrated.toRaw).toBe(1)

      const article = await db.feedArticles.get('unanalyzed-in-feed')
      expect(article?.poolStatus).toBe('raw')
    })

    it('应该跳过已有 poolStatus 的文章', async () => {
      await db.feedArticles.add({
        id: 'already-migrated',
        feedId: 'feed-1',
        link: 'http://example.com/6',
        title: 'Already Migrated',
        published: Date.now(),
        fetched: Date.now(),
        read: false,
        starred: false,
        poolStatus: 'candidate',
        recommended: true,
        inPool: true
      })

      const result = await migrateToPoolStatus()

      expect(result.success).toBe(true)
      expect(result.migrated.toRecommended).toBe(0)

      const article = await db.feedArticles.get('already-migrated')
      expect(article?.poolStatus).toBe('candidate') // 保持不变
    })
  })

  describe('Phase 13 - needsPhase13Migration', () => {
    it('应该返回 true 当有旧格式数据时', async () => {
      await db.feedArticles.add({
        id: 'legacy-data',
        feedId: 'feed-1',
        link: 'http://example.com/legacy',
        title: 'Legacy Data',
        published: Date.now(),
        fetched: Date.now(),
        read: false,
        starred: false,
        recommended: true,
        inPool: true
        // 没有 poolStatus
      })

      const needs = await needsPhase13Migration()
      expect(needs).toBe(true)
    })

    it('应该返回 false 当迁移已完成时', async () => {
      await db.settings.update('singleton', {
        migrations: { phase10Completed: true, phase13Completed: true }
      })

      const needs = await needsPhase13Migration()
      expect(needs).toBe(false)
    })
  })

  describe('Phase 13 - runPhase13Migration', () => {
    it('应该完成完整迁移流程并设置标记', async () => {
      // 准备数据
      await db.feedArticles.add({
        id: 'to-migrate',
        feedId: 'feed-1',
        link: 'http://example.com/migrate',
        title: 'To Migrate',
        published: Date.now(),
        fetched: Date.now(),
        read: false,
        starred: false,
        recommended: true,
        inPool: true
      })

      const success = await runPhase13Migration()
      expect(success).toBe(true)

      // 检查迁移标记
      const settings = await db.settings.get('singleton')
      expect(settings?.migrations?.phase13Completed).toBe(true)

      // 检查数据迁移
      const article = await db.feedArticles.get('to-migrate')
      expect(article?.poolStatus).toBe('recommended')
    })
  })
})
