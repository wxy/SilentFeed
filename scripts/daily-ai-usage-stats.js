/**
 * 按天统计 AI 用量
 * 
 * 输出格式与 DeepSeek 提供商报表一致，便于对比
 * 
 * 使用方法：
 * 1. 在浏览器扩展页面打开控制台
 * 2. 复制粘贴此脚本并运行
 */

(async function dailyAIUsageStats() {
  console.log('📊 AI 用量按天统计\n')
  console.log('='.repeat(80))
  
  try {
    // 导入数据库
    const { db } = await import('/src/storage/db/index.ts')
    
    // 获取所有记录
    const records = await db.aiUsage.toArray()
    console.log(`📦 总记录数: ${records.length}\n`)
    
    if (records.length === 0) {
      console.log('⚠️ 没有 AI 用量记录')
      return
    }
    
    // 按日期分组
    const dailyStats = {}
    
    records.forEach(record => {
      // 转换为本地日期（YYYY-MM-DD）
      const date = new Date(record.timestamp).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).replace(/\//g, '-')
      
      if (!dailyStats[date]) {
        dailyStats[date] = {
          // 总计
          total: {
            requests: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            cost: 0
          },
          // 推理模式
          reasoning: {
            requests: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            cost: 0
          },
          // 非推理模式
          nonReasoning: {
            requests: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            cost: 0
          },
          // 未记录 reasoning 的（问题记录）
          undefined: {
            requests: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            cost: 0
          },
          // 按任务类型
          byPurpose: {}
        }
      }
      
      const stats = dailyStats[date]
      const tokens = record.tokens || { input: 0, output: 0, total: 0 }
      const cost = record.cost?.total || 0
      
      // 总计
      stats.total.requests++
      stats.total.inputTokens += tokens.input
      stats.total.outputTokens += tokens.output
      stats.total.totalTokens += tokens.total || (tokens.input + tokens.output)
      stats.total.cost += cost
      
      // 按 reasoning 分类
      if (record.reasoning === true) {
        stats.reasoning.requests++
        stats.reasoning.inputTokens += tokens.input
        stats.reasoning.outputTokens += tokens.output
        stats.reasoning.totalTokens += tokens.total || (tokens.input + tokens.output)
        stats.reasoning.cost += cost
      } else if (record.reasoning === false) {
        stats.nonReasoning.requests++
        stats.nonReasoning.inputTokens += tokens.input
        stats.nonReasoning.outputTokens += tokens.output
        stats.nonReasoning.totalTokens += tokens.total || (tokens.input + tokens.output)
        stats.nonReasoning.cost += cost
      } else {
        stats.undefined.requests++
        stats.undefined.inputTokens += tokens.input
        stats.undefined.outputTokens += tokens.output
        stats.undefined.totalTokens += tokens.total || (tokens.input + tokens.output)
        stats.undefined.cost += cost
      }
      
      // 按任务类型
      const purpose = record.purpose || 'unknown'
      if (!stats.byPurpose[purpose]) {
        stats.byPurpose[purpose] = {
          requests: 0,
          reasoning: 0,
          nonReasoning: 0
        }
      }
      stats.byPurpose[purpose].requests++
      if (record.reasoning === true) {
        stats.byPurpose[purpose].reasoning++
      } else if (record.reasoning === false) {
        stats.byPurpose[purpose].nonReasoning++
      }
    })
    
    // 按日期降序排序
    const sortedDates = Object.keys(dailyStats).sort((a, b) => b.localeCompare(a))
    
    // 打印每日统计
    sortedDates.forEach(date => {
      const stats = dailyStats[date]
      
      console.log(`\n📅 ${date}`)
      console.log('─'.repeat(80))
      
      // 总计
      console.log(`总计: ${stats.total.requests} 次请求 | ${stats.total.totalTokens.toLocaleString()} tokens | ¥${stats.total.cost.toFixed(4)}`)
      console.log(`  输入: ${stats.total.inputTokens.toLocaleString()} tokens`)
      console.log(`  输出: ${stats.total.outputTokens.toLocaleString()} tokens`)
      
      // 推理 vs 非推理
      console.log(`\n推理模式: ${stats.reasoning.requests} 次 (${(stats.reasoning.requests / stats.total.requests * 100).toFixed(1)}%)`)
      console.log(`  输入: ${stats.reasoning.inputTokens.toLocaleString()} tokens`)
      console.log(`  输出: ${stats.reasoning.outputTokens.toLocaleString()} tokens`)
      console.log(`  成本: ¥${stats.reasoning.cost.toFixed(4)}`)
      
      console.log(`\n非推理模式: ${stats.nonReasoning.requests} 次 (${(stats.nonReasoning.requests / stats.total.requests * 100).toFixed(1)}%)`)
      console.log(`  输入: ${stats.nonReasoning.inputTokens.toLocaleString()} tokens`)
      console.log(`  输出: ${stats.nonReasoning.outputTokens.toLocaleString()} tokens`)
      console.log(`  成本: ¥${stats.nonReasoning.cost.toFixed(4)}`)
      
      if (stats.undefined.requests > 0) {
        console.log(`\n⚠️ 未记录 reasoning: ${stats.undefined.requests} 次 (${(stats.undefined.requests / stats.total.requests * 100).toFixed(1)}%)`)
        console.log(`  输入: ${stats.undefined.inputTokens.toLocaleString()} tokens`)
        console.log(`  输出: ${stats.undefined.outputTokens.toLocaleString()} tokens`)
        console.log(`  成本: ¥${stats.undefined.cost.toFixed(4)}`)
      }
      
      // 按任务类型
      console.log(`\n任务类型分布:`)
      Object.entries(stats.byPurpose)
        .sort((a, b) => b[1].requests - a[1].requests)
        .forEach(([purpose, purposeStats]) => {
          console.log(`  ${purpose}: ${purposeStats.requests} 次 (推理 ${purposeStats.reasoning}, 非推理 ${purposeStats.nonReasoning})`)
        })
    })
    
    // 汇总统计
    console.log('\n' + '='.repeat(80))
    console.log('📈 汇总统计（全部时间）\n')
    
    const totalStats = {
      requests: 0,
      reasoning: 0,
      nonReasoning: 0,
      undefined: 0,
      tokens: 0,
      cost: 0
    }
    
    sortedDates.forEach(date => {
      const stats = dailyStats[date]
      totalStats.requests += stats.total.requests
      totalStats.reasoning += stats.reasoning.requests
      totalStats.nonReasoning += stats.nonReasoning.requests
      totalStats.undefined += stats.undefined.requests
      totalStats.tokens += stats.total.totalTokens
      totalStats.cost += stats.total.cost
    })
    
    console.log(`时间范围: ${sortedDates[sortedDates.length - 1]} 至 ${sortedDates[0]} (${sortedDates.length} 天)`)
    console.log(`总请求数: ${totalStats.requests.toLocaleString()}`)
    console.log(`  推理模式: ${totalStats.reasoning.toLocaleString()} (${(totalStats.reasoning / totalStats.requests * 100).toFixed(1)}%)`)
    console.log(`  非推理模式: ${totalStats.nonReasoning.toLocaleString()} (${(totalStats.nonReasoning / totalStats.requests * 100).toFixed(1)}%)`)
    if (totalStats.undefined > 0) {
      console.log(`  ⚠️ 未记录: ${totalStats.undefined.toLocaleString()} (${(totalStats.undefined / totalStats.requests * 100).toFixed(1)}%)`)
    }
    console.log(`总 tokens: ${totalStats.tokens.toLocaleString()}`)
    console.log(`总成本: ¥${totalStats.cost.toFixed(4)}`)
    console.log(`日均请求: ${(totalStats.requests / sortedDates.length).toFixed(1)} 次`)
    console.log(`日均成本: ¥${(totalStats.cost / sortedDates.length).toFixed(4)}`)
    
    console.log('\n' + '='.repeat(80))
    console.log('✅ 统计完成\n')
    console.log('💡 提示: 复制以上数据与 DeepSeek 控制台的"用量统计"页面对比')
    console.log('💡 特别关注: 推理/非推理的请求数和 token 数是否匹配\n')
    
    // 返回数据供进一步分析
    return {
      dailyStats,
      summary: totalStats,
      dateRange: {
        start: sortedDates[sortedDates.length - 1],
        end: sortedDates[0],
        days: sortedDates.length
      }
    }
    
  } catch (error) {
    console.error('❌ 统计失败:', error)
    throw error
  }
})()
