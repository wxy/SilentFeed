/**
 * 临时测试脚本：添加页面访问数据
 * 用于快速达到100页门槛，测试推荐UI
 * 
 * 使用方法：
 * 1. 在浏览器中加载扩展
 * 2. 打开开发者工具
 * 3. 在Console中运行此脚本
 */

async function addTestPageData() {
  console.log('[测试脚本] 开始添加测试页面数据...')
  
  try {
    // 创建150条测试页面访问记录，确保超过100页门槛
    const testPages = []
    const domains = ['vue.js.com', 'react.dev', 'github.com', 'stackoverflow.com', 'mdn.dev']
    const topics = ['Vue.js', 'React', '前端开发', 'JavaScript', 'TypeScript']
    
    for (let i = 1; i <= 150; i++) {
      const domain = domains[i % domains.length]
      const topic = topics[i % topics.length]
      
      testPages.push({
        url: `https://${domain}/article-${i}`,
        title: `${topic} 教程 ${i}: 深入学习现代前端技术`,
        domain: domain,
        visitedAt: Date.now() - (i * 60 * 1000), // 每分钟一个
        dwellTime: Math.random() * 300 + 60, // 60-360秒
        scrollDepth: Math.random() * 0.8 + 0.2, // 20%-100%
        isValidVisit: true
      })
    }
    
    // 使用extension的API添加数据
    for (const page of testPages) {
      await chrome.storage.local.set({
        [`page_${page.url}`]: page
      })
    }
    
    console.log(`[测试脚本] 成功添加 ${testPages.length} 条测试页面数据`)
    console.log('[测试脚本] 请刷新popup查看推荐界面')
    
  } catch (error) {
    console.error('[测试脚本] 添加测试数据失败:', error)
  }
}

// 检查当前页面数量
async function checkPageCount() {
  try {
    const storage = await chrome.storage.local.get(null)
    const pageKeys = Object.keys(storage).filter(key => key.startsWith('page_'))
    console.log(`[测试脚本] 当前页面数量: ${pageKeys.length}`)
    
    if (pageKeys.length < 100) {
      console.log('[测试脚本] 页面数量不足100，需要添加测试数据')
      return false
    } else {
      console.log('[测试脚本] 页面数量足够，应该能看到推荐界面')
      return true
    }
  } catch (error) {
    console.error('[测试脚本] 检查页面数量失败:', error)
    return false
  }
}

// 清理测试数据
async function clearTestData() {
  try {
    const storage = await chrome.storage.local.get(null)
    const pageKeys = Object.keys(storage).filter(key => key.startsWith('page_'))
    
    for (const key of pageKeys) {
      await chrome.storage.local.remove(key)
    }
    
    console.log(`[测试脚本] 已清理 ${pageKeys.length} 条测试数据`)
  } catch (error) {
    console.error('[测试脚本] 清理测试数据失败:', error)
  }
}

// 导出到全局
window.addTestPageData = addTestPageData
window.checkPageCount = checkPageCount  
window.clearTestData = clearTestData

console.log('[测试脚本] 已加载，可用函数：')
console.log('- addTestPageData(): 添加150条测试页面数据')
console.log('- checkPageCount(): 检查当前页面数量')
console.log('- clearTestData(): 清理所有测试数据')