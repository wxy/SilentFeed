/**
 * 诊断候选池为空的问题
 * 
 * 使用方法：
 * 1. 打开扩展的 Service Worker 控制台
 * 2. 复制此脚本并运行
 */

async function diagnoseCandidatePool() {
  console.log('🔍 开始诊断候选池问题...\n')
  
  // 1. 检查数据库连接
  console.log('1️⃣ 检查数据库...')
  const db = await indexedDB.databases()
  const silentFeedDB = db.find(d => d.name === 'SilentFeedDB')
  if (!silentFeedDB) {
    console.error('❌ 数据库不存在！')
    return
  }
  console.log('✅ 数据库存在，版本:', silentFeedDB.version)
  
  // 2. 检查 feedArticles 表
  console.log('\n2️⃣ 检查 feedArticles 表...')
  const request = indexedDB.open('SilentFeedDB', silentFeedDB.version)
  
  request.onsuccess = async (event) => {
    const db = event.target.result
    const tx = db.transaction(['feedArticles'], 'readonly')
    const store = tx.objectStore('feedArticles')
    
    // 统计各状态的文章数
    const statusIndex = store.index('poolStatus')
    
    const rawCount = await countByStatus(statusIndex, 'raw')
    const analyzedNotQualifiedCount = await countByStatus(statusIndex, 'analyzed-not-qualified')
    const candidateCount = await countByStatus(statusIndex, 'candidate')
    const recommendedCount = await countByStatus(statusIndex, 'recommended')
    
    console.log('📊 池统计:')
    console.log(`  - raw: ${rawCount}`)
    console.log(`  - analyzed-not-qualified: ${analyzedNotQualifiedCount}`)
    console.log(`  - candidate: ${candidateCount}`)
    console.log(`  - recommended: ${recommendedCount}`)
    console.log(`  - 总计: ${rawCount + analyzedNotQualifiedCount + candidateCount + recommendedCount}`)
    
    if (rawCount > 0) {
      console.log('\n⚠️ 有', rawCount, '篇文章处于 raw 状态（未分析）')
      
      // 检查一些样本
      console.log('\n3️⃣ 检查前 5 篇 raw 文章...')
      const rawArticles = await getByStatus(statusIndex, 'raw', 5)
      rawArticles.forEach((article, i) => {
        console.log(`\n文章 ${i + 1}:`)
        console.log('  - ID:', article.id)
        console.log('  - 标题:', article.title?.substring(0, 50) + '...')
        console.log('  - 发布时间:', new Date(article.publishedAt).toLocaleString('zh-CN'))
        console.log('  - 添加时间:', new Date(article.addedAt).toLocaleString('zh-CN'))
        console.log('  - analysisScore:', article.analysisScore)
        console.log('  - analysisResult:', article.analysisResult)
      })
    }
    
    if (analyzedNotQualifiedCount > 0) {
      console.log('\n✅ 有', analyzedNotQualifiedCount, '篇文章已分析但评分低（analyzed-not-qualified）')
      console.log('   这是正常的，说明分析流程在运行')
    }
    
    if (candidateCount === 0 && rawCount > 0) {
      console.log('\n❌ 问题确认：有 raw 文章但没有 candidate 文章')
      console.log('\n可能原因：')
      console.log('  1. 文章分析调度器未运行')
      console.log('  2. AI 配置未完成或失效')
      console.log('  3. 所有文章评分都低于阈值')
      console.log('  4. 分析过程出错但被静默忽略')
    }
    
    // 4. 检查 AI 配置
    console.log('\n4️⃣ 检查 AI 配置...')
    chrome.storage.local.get(['ai_config'], (result) => {
      if (!result.ai_config) {
        console.error('❌ AI 配置不存在！')
        console.log('   请先在选项页配置 AI Provider')
        return
      }
      
      const config = result.ai_config
      console.log('✅ AI 配置存在')
      console.log('  - Provider:', config.provider)
      console.log('  - 已配置:', config.configured ? '是' : '否')
      
      if (!config.configured) {
        console.error('❌ AI 未配置完成！')
        console.log('   请在选项页完成 AI Provider 配置')
      }
    })
    
    // 5. 检查调度器状态
    console.log('\n5️⃣ 检查调度器状态...')
    chrome.alarms.getAll((alarms) => {
      console.log('⏰ 活动的调度器:')
      alarms.forEach(alarm => {
        console.log(`  - ${alarm.name}: 下次运行 ${new Date(alarm.scheduledTime).toLocaleString('zh-CN')}`)
      })
      
      const analysisAlarm = alarms.find(a => a.name.includes('article-analysis'))
      if (!analysisAlarm) {
        console.error('❌ 文章分析调度器未运行！')
        console.log('   这可能是候选池为空的主要原因')
      } else {
        console.log('✅ 文章分析调度器正在运行')
      }
    })
    
    // 6. 检查引导状态
    console.log('\n6️⃣ 检查引导状态...')
    chrome.storage.local.get(['onboarding_state'], (result) => {
      if (!result.onboarding_state) {
        console.warn('⚠️ 引导状态不存在')
        return
      }
      
      const state = result.onboarding_state
      console.log('引导状态:', state.currentState)
      
      if (state.currentState === 'setup' || state.currentState === 'learning-passive') {
        console.warn('⚠️ 当前处于引导阶段')
        console.log('   在引导完成前，文章分析可能不会运行')
        console.log('   需要收集至少', state.config?.minPagesForComplete || 50, '个页面访问')
      }
    })
    
    console.log('\n✅ 诊断完成')
    db.close()
  }
  
  request.onerror = () => {
    console.error('❌ 打开数据库失败:', request.error)
  }
}

// 辅助函数
function countByStatus(statusIndex, status) {
  return new Promise((resolve, reject) => {
    const request = statusIndex.count(status)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function getByStatus(statusIndex, status, limit = 5) {
  return new Promise((resolve, reject) => {
    const request = statusIndex.getAll(status, limit)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// 运行诊断
diagnoseCandidatePool()
