/**
 * DwellTimeCalculator 演示 Content Script
 * 
 * 用途：在实际浏览器环境中测试停留时间计算器
 * 
 * 功能：
 * - 监听页面激活/失活
 * - 监听用户交互（scroll, click, keypress, mousemove）
 * - 每 5 秒报告一次当前状态
 * - 显示浮动调试面板
 */

import type { PlasmoCSConfig } from "plasmo"
import { DwellTimeCalculator } from "~core/tracker/DwellTimeCalculator"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: false
}

// 创建计算器实例
const calculator = new DwellTimeCalculator()

console.log('🚀 [Demo] DwellTimeCalculator 演示已启动')

// 1. 监听页面可见性变化
document.addEventListener('visibilitychange', () => {
  const isVisible = !document.hidden
  calculator.onVisibilityChange(isVisible)
})

// 2. 监听滚动（节流：2 秒）
let lastScrollTime = 0
document.addEventListener('scroll', () => {
  const now = Date.now()
  if (now - lastScrollTime > 2000) {
    calculator.onInteraction('scroll')
    lastScrollTime = now
  }
}, { passive: true })

// 3. 监听点击
document.addEventListener('click', () => {
  calculator.onInteraction('click')
}, { passive: true })

// 4. 监听键盘输入
document.addEventListener('keypress', () => {
  calculator.onInteraction('keypress')
}, { passive: true })

// 5. 监听鼠标移动（节流：5 秒）
let lastMouseMoveTime = 0
document.addEventListener('mousemove', () => {
  const now = Date.now()
  if (now - lastMouseMoveTime > 5000) {
    calculator.onInteraction('mousemove')
    lastMouseMoveTime = now
  }
}, { passive: true })

// 6. 定时报告状态（每 5 秒）
setInterval(() => {
  const dwellTime = calculator.getEffectiveDwellTime()
  const timeSinceInteraction = calculator.getTimeSinceLastInteraction()
  const isActive = calculator.isActive()
  
  console.log('📊 [Demo] 状态报告', {
    页面: document.title,
    URL: location.href,
    有效停留时间: `${dwellTime.toFixed(1)}秒`,
    距上次交互: `${timeSinceInteraction.toFixed(1)}秒`,
    页面状态: isActive ? '✅ 激活' : '⏸️ 失活',
    是否超过阈值: dwellTime >= 30 ? '✅ 是（已达到记录标准）' : `❌ 否（还需 ${(30 - dwellTime).toFixed(1)}秒）`
  })
  
  // 更新浮动面板
  updateDebugPanel(dwellTime, timeSinceInteraction, isActive)
}, 5000)

// 7. 创建浮动调试面板
function createDebugPanel(): HTMLDivElement {
  const panel = document.createElement('div')
  panel.id = 'dwell-time-debug-panel'
  panel.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.9);
    color: #fff;
    padding: 15px;
    border-radius: 8px;
    font-family: 'Monaco', 'Courier New', monospace;
    font-size: 12px;
    z-index: 999999;
    min-width: 280px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(10px);
  `
  
  panel.innerHTML = `
    <div style="font-size: 14px; font-weight: bold; margin-bottom: 10px; color: #4CAF93;">
      🕐 停留时间监控
    </div>
    <div id="panel-content">
      <div>有效停留: <span id="dwell-time">0.0秒</span></div>
      <div>距上次交互: <span id="since-interaction">0.0秒</span></div>
      <div>页面状态: <span id="page-status">激活</span></div>
      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #333;">
        <span id="threshold-status">❌ 未达到阈值</span>
      </div>
    </div>
    <div style="margin-top: 10px; font-size: 10px; opacity: 0.6;">
      点击面板可隐藏/显示
    </div>
  `
  
  // 点击切换折叠
  let isCollapsed = false
  panel.addEventListener('click', () => {
    isCollapsed = !isCollapsed
    const content = panel.querySelector('#panel-content') as HTMLElement
    if (isCollapsed) {
      content.style.display = 'none'
    } else {
      content.style.display = 'block'
    }
  })
  
  document.body.appendChild(panel)
  return panel
}

// 8. 更新调试面板
function updateDebugPanel(dwellTime: number, timeSinceInteraction: number, isActive: boolean): void {
  let panel = document.getElementById('dwell-time-debug-panel')
  if (!panel) {
    panel = createDebugPanel()
  }
  
  const dwellTimeEl = panel.querySelector('#dwell-time')
  const sinceInteractionEl = panel.querySelector('#since-interaction')
  const pageStatusEl = panel.querySelector('#page-status')
  const thresholdStatusEl = panel.querySelector('#threshold-status')
  
  if (dwellTimeEl) {
    dwellTimeEl.textContent = `${dwellTime.toFixed(1)}秒`
    dwellTimeEl.setAttribute('style', dwellTime >= 30 ? 'color: #4CAF50; font-weight: bold;' : '')
  }
  
  if (sinceInteractionEl) {
    sinceInteractionEl.textContent = `${timeSinceInteraction.toFixed(1)}秒`
    sinceInteractionEl.setAttribute('style', timeSinceInteraction > 30 ? 'color: #ff9800;' : '')
  }
  
  if (pageStatusEl) {
    pageStatusEl.textContent = isActive ? '✅ 激活' : '⏸️ 失活'
  }
  
  if (thresholdStatusEl) {
    if (dwellTime >= 30) {
      thresholdStatusEl.textContent = '✅ 已达到阈值（30秒）'
      thresholdStatusEl.setAttribute('style', 'color: #4CAF50; font-weight: bold;')
    } else {
      thresholdStatusEl.textContent = `❌ 还需 ${(30 - dwellTime).toFixed(1)}秒`
      thresholdStatusEl.setAttribute('style', 'color: #ff9800;')
    }
  }
}

// 初始创建面板
createDebugPanel()

console.log('✅ [Demo] 所有监听器已设置，浮动面板已创建')
