/**
 * 推荐系统 Mock 数据
 * Phase 6: AI 推荐引擎开发
 * 
 * 用于UI开发和测试，展示不同类型的推荐效果
 */

import type { Recommendation } from '@/storage/types'

/**
 * Mock 推荐数据
 */
export const mockRecommendations: Recommendation[] = [
  {
    id: 'mock-rec-1',
    url: 'https://vue-js.com/guide/composition-api.html',
    title: 'Vue.js Composition API 深度指南：构建更强大的组件',
    summary: '本文详细介绍了 Vue 3 的 Composition API，包括 setup() 函数、响应式引用、以及如何组织复杂的组件逻辑。适合想要掌握现代 Vue.js 开发的工程师。',
    source: 'Vue.js 官方博客',
    sourceUrl: 'https://vue-js.com/blog',
    
    recommendedAt: Date.now() - 2 * 60 * 60 * 1000, // 2小时前
    score: 0.89,
    reason: '因为您经常浏览前端开发和Vue.js相关内容',
    
    // Phase 6: 全文抓取信息
    wordCount: 4200,
    readingTime: 17,
    excerpt: '本文详细介绍了 Vue 3 的 Composition API，这是Vue.js生态系统中最重要的更新之一。我们将深入探讨 setup() 函数的工作原理、响应式引用的使用方法、以及如何使用组合式API来组织复杂的组件逻辑...',
    
    isRead: false,
    feedback: undefined,
    effectiveness: undefined
  },
  
  {
    id: 'mock-rec-2', 
    url: 'https://deepseek.ai/research/reasoning-models',
    title: 'DeepSeek 推理模型架构解析：如何实现更智能的AI推理',
    summary: 'DeepSeek 最新发布的推理模型采用了创新的思维链技术，大幅提升了复杂问题的解决能力。本文深入分析其技术原理和应用场景。',
    source: 'AI 研究前沿',
    sourceUrl: 'https://ai-research.com',
    
    recommendedAt: Date.now() - 4 * 60 * 60 * 1000, // 4小时前
    score: 0.76,
    reason: '基于您对AI技术和机器学习的兴趣',
    
    // Phase 6: 全文抓取信息
    wordCount: 5800,
    readingTime: 23,
    excerpt: 'DeepSeek 最新发布的推理模型(DeepSeek-R1)采用了创新的思维链(Chain-of-Thought)技术，能够将复杂问题分解为多个推理步骤...',
    
    isRead: false,
    feedback: undefined,
    effectiveness: undefined
  },

  {
    id: 'mock-rec-3',
    url: 'https://uxdesign.cc/chrome-extension-design-principles',
    title: 'Chrome 扩展的用户体验设计原则：从功能到愉悦',
    summary: '设计优秀的浏览器扩展需要平衡功能性和用户体验。本文总结了成功扩展的设计模式，以及如何避免常见的UX陷阱。',
    source: 'UX Design Weekly',
    sourceUrl: 'https://uxdesign.cc',
    
    recommendedAt: Date.now() - 6 * 60 * 60 * 1000, // 6小时前
    score: 0.72,
    reason: '与您正在开发的浏览器扩展项目相关',
    
    // Phase 6: 全文抓取信息
    wordCount: 3100,
    readingTime: 12,
    
    isRead: false,
    feedback: undefined,
    effectiveness: undefined
  },

  {
    id: 'mock-rec-4',
    url: 'https://techcrunch.com/ai-productivity-tools-2024',
    title: '2024年最值得关注的AI生产力工具：重塑工作流程',
    summary: '从代码生成到内容创作，AI工具正在改变我们的工作方式。本文评测了今年最优秀的AI生产力工具，并分析其对不同行业的影响。',
    source: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com',
    
    recommendedAt: Date.now() - 8 * 60 * 60 * 1000, // 8小时前
    score: 0.68,
    reason: '符合您对生产力工具和效率提升的关注',
    
    // Phase 6: 全文抓取信息  
    wordCount: 6500,
    readingTime: 26,
    
    isRead: false,
    feedback: undefined,
    effectiveness: undefined
  },

  {
    id: 'mock-rec-5',
    url: 'https://css-tricks.com/modern-css-layouts-2024',
    title: '现代CSS布局技术全览：Grid、Flexbox与容器查询',
    summary: '2024年的CSS布局已经非常强大。本文介绍了最新的布局技术，包括CSS Grid的高级用法、Flexbox的最佳实践，以及新兴的容器查询功能。',
    source: 'CSS-Tricks',
    sourceUrl: 'https://css-tricks.com',
    
    recommendedAt: Date.now() - 12 * 60 * 60 * 1000, // 12小时前
    score: 0.64,
    reason: '根据您的前端开发兴趣推荐',
    
    // Phase 6: 全文抓取信息
    wordCount: 2800,
    readingTime: 11,
    
    isRead: false,
    feedback: undefined,
    effectiveness: undefined
  }
]

/**
 * Mock 推荐统计数据
 */
export const mockRecommendationStats = {
  totalCount: 156,
  unreadCount: 5,
  readCount: 89,
  readLaterCount: 12,
  dismissedCount: 50,
  avgReadDuration: 178, // 2.97分钟
  topSources: [
    { source: 'Vue.js 官方博客', count: 23, readRate: 0.87 },
    { source: 'AI 研究前沿', count: 19, readRate: 0.74 },
    { source: 'TechCrunch', count: 15, readRate: 0.68 },
    { source: 'CSS-Tricks', count: 12, readRate: 0.79 },
    { source: 'UX Design Weekly', count: 8, readRate: 0.85 }
  ]
}

/**
 * 获取Mock推荐数据（模拟异步调用）
 */
export async function getMockRecommendations(limit: number = 50): Promise<Recommendation[]> {
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 300))
  
  return mockRecommendations.slice(0, limit)
}

/**
 * Mock推荐理由生成（用于测试AI功能）
 */
export const mockRecommendationReasons = [
  '基于您最近对Vue.js的深度学习兴趣',
  '与您在TypeScript项目中的实践经验相关', 
  '符合您对现代前端架构的关注点',
  '根据您的AI技术研究历史推荐',
  '匹配您的用户体验设计偏好',
  '因为您经常关注生产力工具的最新动态',
  '与您的开源项目开发经验相符'
]

/**
 * 生成随机Mock推荐理由
 */
export function generateMockReason(userInterests: string[] = []): string {
  if (userInterests.length > 0) {
    const interest = userInterests[Math.floor(Math.random() * userInterests.length)]
    return `因为您对${interest}感兴趣`
  }
  
  const randomReason = mockRecommendationReasons[
    Math.floor(Math.random() * mockRecommendationReasons.length)
  ]
  
  return randomReason
}