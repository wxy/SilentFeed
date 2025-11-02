/**
 * 页面访问追踪 Content Script
 * 
 * Phase 2.1 核心功能：
 * - 监听页面激活/失活
 * - 监听用户交互（scroll, click, keypress, mousemove）
 * - 使用 DwellTimeCalculator 计算有效停留时间
 * - 达到 30 秒阈值后记录到 IndexedDB
 * - 提供调试日志用于浏览器测试
 * 
 * @version 1.0
 * @date 2025-11-02
 */

import type { PlasmoCSConfig } from "plasmo"
import { DwellTimeCalculator } from "~core/tracker/DwellTimeCalculator"
import { db } from "~storage/db"

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

// ==================== 全局状态 ====================

const calculator = new DwellTimeCalculator()
const THRESHOLD_SECONDS = 30 // 记录阈值：30 秒
const CHECK_INTERVAL_MS = 5000 // 检查间隔：5 秒

let isRecorded = false // 是否已记录（避免重复）
let checkTimer: ReturnType<typeof setInterval> | null = null

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

// ==================== 数据记录 ====================

/**
 * 记录页面访问到数据库
 */
async function recordPageVisit(): Promise<void> {
  if (isRecorded) {
    console.log('🚫 [PageTracker] 已记录过，跳过')
    return
  }

  const pageInfo = getPageInfo()
  
  console.log('💾 [PageTracker] 准备记录页面访问', {
    页面: pageInfo.title,
    URL: pageInfo.url,
    停留时间: `${pageInfo.dwellTime.toFixed(1)}秒`,
    时间戳: new Date(pageInfo.visitedAt).toLocaleTimeString()
  })

  try {
    // 先创建临时记录（Phase 2.1 简化版，直接升级为正式记录）
    // TODO Phase 2.3: 添加页面过滤逻辑
    // TODO Phase 2.4: 添加内容提取和分析
    
    // 保存到 confirmedVisits 表
    await db.confirmedVisits.add({
      id: crypto.randomUUID(),
      url: pageInfo.url,
      title: pageInfo.title,
      domain: pageInfo.domain,
      visitTime: pageInfo.visitedAt,
      duration: pageInfo.dwellTime,
      interactionCount: 0, // TODO: 实际记录交互次数
      
      // Phase 2.4 将添加完整的元数据和内容
      meta: null,
      contentSummary: null,
      
      // Phase 2.4 将添加完整的内容分析
      analysis: {
        keywords: [], // 关键词
        topics: [], // 主题分类
        language: 'zh' // 语言检测（默认中文）
      },
      
      status: 'qualified',
      
      // 数据生命周期
      contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000, // 90 天后
      analysisRetainUntil: -1 // 永久保留
    })

    isRecorded = true
    console.log('✅ [PageTracker] 页面访问已记录到数据库')
    
    // 通知 background 更新徽章
    chrome.runtime.sendMessage({
      type: 'PAGE_RECORDED',
      data: pageInfo
    }).catch(err => {
      console.warn('⚠️ [PageTracker] 发送消息到 background 失败', err)
    })
    
  } catch (error) {
    console.error('❌ [PageTracker] 记录页面访问失败', error)
  }
}

/**
 * 检查是否达到阈值
 */
function checkThreshold(): void {
  const dwellTime = calculator.getEffectiveDwellTime()
  const timeSinceInteraction = calculator.getTimeSinceLastInteraction()
  
  console.log('🔍 [PageTracker] 阈值检查', {
    当前停留时间: `${dwellTime.toFixed(1)}秒`,
    距上次交互: `${timeSinceInteraction.toFixed(1)}秒`,
    阈值: `${THRESHOLD_SECONDS}秒`,
    状态: dwellTime >= THRESHOLD_SECONDS ? '✅ 已达到' : `❌ 还需 ${(THRESHOLD_SECONDS - dwellTime).toFixed(1)}秒`
  })

  if (dwellTime >= THRESHOLD_SECONDS && !isRecorded) {
    console.log('🎯 [PageTracker] 达到阈值，开始记录')
    recordPageVisit()
    
    // 停止检查（已记录）
    if (checkTimer) {
      clearInterval(checkTimer)
      checkTimer = null
      console.log('⏸️ [PageTracker] 停止阈值检查')
    }
  }
}

// ==================== 事件监听 ====================

/**
 * 监听页面可见性变化
 */
function setupVisibilityListener(): void {
  document.addEventListener('visibilitychange', () => {
    const isVisible = !document.hidden
    calculator.onVisibilityChange(isVisible)
    
    if (isVisible) {
      console.log('👁️ [PageTracker] 页面激活，恢复追踪')
    } else {
      console.log('🙈 [PageTracker] 页面失活，暂停追踪')
    }
  })
}

/**
 * 监听用户交互（节流）
 */
function setupInteractionListeners(): void {
  let lastScrollTime = 0
  let lastMouseMoveTime = 0
  
  // 滚动（节流：2 秒）
  document.addEventListener('scroll', () => {
    const now = Date.now()
    if (now - lastScrollTime > 2000) {
      calculator.onInteraction('scroll')
      lastScrollTime = now
    }
  }, { passive: true })
  
  // 点击
  document.addEventListener('click', () => {
    calculator.onInteraction('click')
  }, { passive: true })
  
  // 键盘输入
  document.addEventListener('keypress', () => {
    calculator.onInteraction('keypress')
  }, { passive: true })
  
  // 鼠标移动（节流：5 秒）
  document.addEventListener('mousemove', () => {
    const now = Date.now()
    if (now - lastMouseMoveTime > 5000) {
      calculator.onInteraction('mousemove')
      lastMouseMoveTime = now
    }
  }, { passive: true })
}

/**
 * 启动定时检查
 */
function startThresholdChecking(): void {
  checkTimer = setInterval(checkThreshold, CHECK_INTERVAL_MS)
  console.log('⏰ [PageTracker] 启动定时检查（每 5 秒）')
}

/**
 * 页面卸载时保存数据
 */
function setupUnloadListener(): void {
  window.addEventListener('beforeunload', () => {
    const dwellTime = calculator.getEffectiveDwellTime()
    
    console.log('👋 [PageTracker] 页面卸载', {
      最终停留时间: `${dwellTime.toFixed(1)}秒`,
      是否已记录: isRecorded ? '✅ 是' : '❌ 否'
    })
    
    // 如果达到阈值但还没记录，尝试记录（可能失败）
    if (dwellTime >= THRESHOLD_SECONDS && !isRecorded) {
      console.log('⚡ [PageTracker] 页面卸载前记录')
      recordPageVisit() // 注意：可能因为页面关闭而失败
    }
  })
}

// ==================== 初始化 ====================

function init(): void {
  console.log('🚀 [PageTracker] 页面访问追踪已启动', {
    页面: document.title,
    URL: window.location.href,
    域名: window.location.hostname,
    时间: new Date().toLocaleTimeString()
  })

  // 设置监听器
  setupVisibilityListener()
  setupInteractionListeners()
  setupUnloadListener()
  
  // 启动定时检查
  startThresholdChecking()
  
  console.log('✅ [PageTracker] 所有监听器已设置')
  console.log(`📋 [PageTracker] 阈值: ${THRESHOLD_SECONDS} 秒，检查间隔: ${CHECK_INTERVAL_MS / 1000} 秒`)
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
