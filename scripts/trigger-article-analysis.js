/**
 * 手动触发文章分析脚本
 * 
 * 此脚本会触发一次性的文章分析任务，将 raw 池中的文章分析并评分
 * 
 * 使用方法：
 * 1. 打开扩展的 Service Worker 控制台
 * 2. 复制整个脚本并粘贴运行
 * 3. 观察分析进度日志
 * 
 * ⚠️ 注意：
 * - 这是临时解决方案，用于诊断问题
 * - 正式版本应该有自动的文章分析调度器
 * - 分析会消耗 AI API 配额
 */

async function triggerArticleAnalysis() {
  console.log('🔍 开始手动触发文章分析...\n')
  
  try {
    // 1. 检查数据库
    const dbRequest = indexedDB.open('SilentFeedDB')
    
    dbRequest.onerror = () => {
      console.error('❌ 无法打开数据库')
    }
    
    dbRequest.onsuccess = async (event) => {
      const db = event.target.result
      
      // 2. 获取 raw 状态的文章
      const tx = db.transaction(['feedArticles'], 'readonly')
      const store = tx.objectStore('feedArticles')
      const statusIndex = store.index('poolStatus')
      
      console.log('📊 检查原料池...')
      const rawArticles = await getAllByIndex(statusIndex, 'raw')
      
      console.log(`✅ 找到 ${rawArticles.length} 篇待分析文章\n`)
      
      if (rawArticles.length === 0) {
        console.log('⚠️ 原料池为空，无需分析')
        db.close()
        return
      }
      
      // 3. 显示一些样本
      console.log('📋 前 5 篇文章样本:')
      rawArticles.slice(0, 5).forEach((article, i) => {
        console.log(`  ${i + 1}. ${article.title?.substring(0, 50)}...`)
        console.log(`     发布于: ${new Date(article.published).toLocaleString('zh-CN')}`)
      })
      
      // 4. 检查 AI 配置
      console.log('\n🤖 检查 AI 配置...')
      chrome.storage.local.get(['ai_config'], (result) => {
        if (!result.ai_config || !result.ai_config.configured) {
          console.error('❌ AI 未配置！请先在选项页配置 AI Provider')
          console.log('   无法进行文章分析')
          db.close()
          return
        }
        
        console.log('✅ AI 已配置')
        console.log(`   Provider: ${result.ai_config.provider}`)
        
        // 5. 发送分析请求
        console.log('\n📤 向 Background 发送分析请求...')
        console.log('⚠️ 注意：实际的分析逻辑需要 Background Service 实现')
        console.log('   当前系统可能缺少处理此消息的代码\n')
        
        // 尝试发送消息（如果 Background 有监听器）
        chrome.runtime.sendMessage({
          type: 'TRIGGER_ARTICLE_ANALYSIS',
          batchSize: 20  // 每次分析 20 篇
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('❌ 发送消息失败:', chrome.runtime.lastError.message)
            console.log('\n💡 诊断结果：')
            console.log('   系统缺少文章分析调度器')
            console.log('   需要实现以下功能：')
            console.log('   1. Background Service 监听 TRIGGER_ARTICLE_ANALYSIS 消息')
            console.log('   2. 批量读取 raw 状态文章')
            console.log('   3. 调用 AI 分析每篇文章的内容和相关性')
            console.log('   4. 根据评分将文章移到 candidate 池或 analyzed-not-qualified 池')
            console.log('   5. 定期自动运行（例如每 5 分钟）')
          } else {
            console.log('✅ 分析请求已发送')
            if (response) {
              console.log('   响应:', response)
            }
          }
          
          db.close()
        })
      })
    }
  } catch (error) {
    console.error('❌ 触发分析失败:', error)
  }
}

// 辅助函数
function getAllByIndex(index, value) {
  return new Promise((resolve, reject) => {
    const request = index.getAll(value)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// 运行诊断
console.log('🔧 文章分析诊断工具')
console.log('此工具会尝试触发文章分析流程\n')
triggerArticleAnalysis()
