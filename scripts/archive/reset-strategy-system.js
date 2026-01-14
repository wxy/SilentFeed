/**
 * 重置策略系统脚本
 * 
 * 此脚本会清除所有策略相关的存储键，让系统重新生成策略
 * 
 * 使用方法：
 * 1. 打开扩展的 Service Worker 控制台（chrome://extensions → Silent Feed → Service Worker）
 * 2. 复制整个脚本并粘贴运行
 * 3. 脚本会显示当前策略状态
 * 4. 如果确认要重置，运行：resetStrategySystem()
 * 5. 等待重置完成后重新加载扩展
 * 
 * ⚠️ 注意：
 * - 此操作会清除当前策略，系统将在下次运行时重新生成
 * - 不会删除用户数据（文章、推荐、访问记录等）
 * - 建议在问题严重时使用（例如候选池长期为空）
 */

async function resetStrategySystem() {
  console.log('🔄 开始重置策略系统...\n')
  
  // 1. 列出要删除的键
  const keysToRemove = [
    // 新版策略系统（StrategyDecisionService）
    'current_strategy',           // 当前策略决策
    'strategy_system_context',    // 系统上下文缓存
    
    // 旧版策略系统（PoolStrategyDecider，已废弃但可能仍存在）
    'pool_strategy_decision',     // 池策略决策
    
    // 临时状态标记
    'pool_strategy_generating',   // 策略生成中标记
    
    // 缓存的决策依据（可选清除）
    // 如果保留，系统可能使用缓存的上下文快速重建
    // 如果删除，系统会重新计算所有指标
  ]
  
  console.log('📋 将清除以下存储键:')
  keysToRemove.forEach(key => console.log(`  - ${key}`))
  
  // 2. 检查当前存储状态
  console.log('\n📊 当前策略状态:')
  const current = await chrome.storage.local.get(keysToRemove)
  
  if (current.current_strategy) {
    const strategy = current.current_strategy
    console.log('  ✅ current_strategy 存在')
    console.log('    - ID:', strategy.id)
    console.log('    - 创建时间:', new Date(strategy.decisionMadeAt).toLocaleString('zh-CN'))
    console.log('    - 有效期至:', new Date(strategy.validUntil).toLocaleString('zh-CN'))
    console.log('    - 推荐池目标:', strategy.strategy.recommendation.targetPoolSize)
    console.log('    - 推荐间隔:', strategy.strategy.scheduling.recommendIntervalMinutes, '分钟')
  } else {
    console.log('  ❌ current_strategy 不存在')
  }
  
  if (current.strategy_system_context) {
    const context = current.strategy_system_context
    console.log('  ✅ strategy_system_context 存在')
    console.log('    - 活跃订阅源:', context.activeFeeds)
    console.log('    - 原料池:', context.rawPoolSize)
    console.log('    - 候选池:', context.candidatePoolSize)
    console.log('    - 推荐池:', context.recommendationPoolSize)
    console.log('    - 缓存时间:', new Date(context.timestamp).toLocaleString('zh-CN'))
  } else {
    console.log('  ❌ strategy_system_context 不存在')
  }
  
  if (current.pool_strategy_decision) {
    console.log('  ⚠️ pool_strategy_decision 存在（旧版，应清除）')
    console.log('    - 日期:', current.pool_strategy_decision.date)
  }
  
  if (current.pool_strategy_generating) {
    console.log('  ⚠️ pool_strategy_generating 标记存在（可能导致重复生成）')
  }
  
  console.log('\n⚠️ 即将清除上述策略数据')
  console.log('系统将在下次运行时自动重新生成策略')
  console.log('此操作不会影响用户数据（文章、推荐、访问记录等）')
  console.log('\n⏸️  脚本已暂停。如果确认要继续，请运行：')
  console.log('   executeReset()')
}

async function executeReset() {
  console.log('🔄 执行重置...\n')
  
  const keysToRemove = [
    'current_strategy',
    'strategy_system_context',
    'pool_strategy_decision',
    'pool_strategy_generating'
  ]
  
  console.log('🗑️ 正在清除策略数据...')
  
  try {
    await chrome.storage.local.remove(keysToRemove)
    console.log('✅ 策略数据已清除')
    
    // 5. 验证清除结果
    const afterRemove = await chrome.storage.local.get(keysToRemove)
    const remainingKeys = keysToRemove.filter(key => afterRemove[key] !== undefined)
    
    if (remainingKeys.length > 0) {
      console.warn('⚠️ 以下键未能清除:', remainingKeys)
    } else {
      console.log('✅ 所有策略键已成功清除')
    }
    
    // 6. 停止并重启策略审查调度器（如果可能）
    console.log('\n🔄 正在重启策略审查调度器...')
    try {
      // 清除旧的 alarm
      await chrome.alarms.clear('strategy-review-scheduler')
      console.log('✅ 已清除策略审查调度器')
      
      // 系统会在下次 background 启动时自动重建调度器
      console.log('策略审查调度器将在扩展重新加载后自动重建')
      
    } catch (error) {
      console.warn('⚠️ 重启调度器失败（可能需要手动重新加载扩展）:', error.message)
    }
    
    // 7. 提供下一步建议
    console.log('\n📝 下一步操作建议:')
    console.log('  1. 重新加载扩展（chrome://extensions → 点击刷新按钮）')
    console.log('  2. 打开扩展的 Service Worker 控制台，观察策略生成日志')
    console.log('  3. 等待 1-2 分钟，让系统生成新策略')
    console.log('  4. 运行诊断脚本验证候选池状态：scripts/diagnose-candidate-pool.js')
    
    console.log('\n✅ 策略系统重置完成')
    
  } catch (error) {
    console.error('❌ 清除策略数据失败:', error)
    console.error('请手动检查 chrome.storage.local 中的以下键:')
    keysToRemove.forEach(key => console.log(`  - ${key}`))
  }
}

// 先显示当前状态，让用户确认
console.log('👉 第一步：查看当前策略状态')
console.log('   运行：checkStrategyStatus()\n')
console.log('👉 第二步：如果确认要重置')
console.log('   运行：executeReset()\n')

async function checkStrategyStatus() {
  await resetStrategySystem()
}

// 运行状态检查（不执行重置）
checkStrategyStatus().catch(error => {
  console.error('❌ 检查状态出错:', error)
})
