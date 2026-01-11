/**
 * 测试策略集成脚本
 * 
 * 此脚本用于验证候选池准入阈值的 AI 策略是否正常工作
 * 
 * 使用方法：
 * 1. 打开扩展的 Service Worker 控制台（chrome://extensions → Silent Feed → Service Worker）
 * 2. 复制整个脚本并粘贴运行
 * 3. 查看输出结果验证策略是否生效
 */

async function testStrategyIntegration() {
  console.log('🧪 测试策略集成...\n')
  
  // 1. 检查当前策略
  console.log('1️⃣ 检查当前策略:')
  const result = await chrome.storage.local.get('current_strategy')
  const currentStrategy = result.current_strategy
  
  if (!currentStrategy) {
    console.log('  ❌ 当前没有策略（可能尚未生成）')
    console.log('  💡 策略会在以下情况生成：')
    console.log('     - 首次启动扩展后（如果状态为 ready）')
    console.log('     - 每24小时自动检查和生成（strategy-review alarm）')
    console.log('     - 手动触发策略生成')
    return
  }
  
  console.log('  ✅ 找到当前策略')
  console.log('    - 策略ID:', currentStrategy.id)
  console.log('    - 创建时间:', new Date(currentStrategy.decisionMadeAt).toLocaleString('zh-CN'))
  console.log('    - 有效期至:', new Date(currentStrategy.validUntil).toLocaleString('zh-CN'))
  console.log('    - 下次审查:', new Date(currentStrategy.nextReview).toLocaleString('zh-CN'))
  
  // 2. 检查候选池准入阈值
  console.log('\n2️⃣ 检查候选池准入阈值:')
  const entryThreshold = currentStrategy.strategy?.candidatePool?.entryThreshold
  
  if (entryThreshold === undefined) {
    console.log('  ⚠️  策略中没有 candidatePool.entryThreshold 字段')
    console.log('  💡 这可能是旧策略，请等待下次策略更新')
    console.log('  💡 或者手动触发策略生成：')
    console.log('     chrome.runtime.sendMessage({ type: "GENERATE_STRATEGY" })')
    return
  }
  
  console.log('  ✅ 找到 entryThreshold:', entryThreshold)
  console.log('  📊 有效范围: 0.5 - 0.9')
  console.log('  📝 AI 决策说明:')
  console.log('     - 候选池充足 (>80%): 提高阈值 (0.75-0.9)')
  console.log('     - 候选池不足 (<50%): 降低阈值 (0.6-0.75)')
  console.log('     - 候选池适中: 标准阈值 (0.7-0.8)')
  
  // 3. 检查候选池状态
  console.log('\n3️⃣ 检查候选池状态:')
  const poolConfig = currentStrategy.strategy?.candidatePool
  if (poolConfig) {
    console.log('  - 目标大小:', poolConfig.targetSize)
    console.log('  - 最大大小:', poolConfig.maxSize)
    console.log('  - 过期时间:', poolConfig.expiryHours, '小时')
    console.log('  - 准入阈值:', poolConfig.entryThreshold, '⭐')
  }
  
  // 4. 检查推荐配置
  console.log('\n4️⃣ 检查推荐配置（作为回退）:')
  const recConfigResult = await chrome.storage.local.get('recommendationConfig')
  const recConfig = recConfigResult.recommendationConfig
  
  if (recConfig?.qualityThreshold) {
    console.log('  - 配置的 qualityThreshold:', recConfig.qualityThreshold)
    console.log('  💡 如果策略没有 entryThreshold，会使用此值作为回退')
  } else {
    console.log('  - 没有配置 qualityThreshold，将使用默认值 0.7')
  }
  
  // 5. 验证优先级
  console.log('\n5️⃣ 验证阈值优先级:')
  const effectiveThreshold = entryThreshold ?? recConfig?.qualityThreshold ?? 0.7
  console.log('  🎯 最终使用的阈值:', effectiveThreshold)
  console.log('  📋 优先级: AI策略 > 配置 > 默认值(0.7)')
  
  // 6. 检查策略审查调度器
  console.log('\n6️⃣ 检查策略审查调度器:')
  const alarms = await chrome.alarms.getAll()
  const strategyAlarm = alarms.find(a => a.name === 'strategy-review')
  
  if (strategyAlarm) {
    console.log('  ✅ 策略审查定时器已设置')
    console.log('    - 下次触发:', new Date(strategyAlarm.scheduledTime).toLocaleString('zh-CN'))
    console.log('    - 间隔:', strategyAlarm.periodInMinutes, '分钟')
  } else {
    console.log('  ⚠️  策略审查定时器未设置')
    console.log('  💡 请确保扩展已完全启动')
  }
  
  // 7. 总结
  console.log('\n📊 测试结果总结:')
  const hasStrategy = !!currentStrategy
  const hasEntryThreshold = entryThreshold !== undefined
  const hasAlarm = !!strategyAlarm
  
  if (hasStrategy && hasEntryThreshold && hasAlarm) {
    console.log('  ✅ 策略系统运行正常')
    console.log('  ✅ 候选池准入阈值已集成到 AI 策略')
    console.log('  ✅ 推荐服务会优先使用策略的 entryThreshold')
    console.log('  🎉 集成成功！')
  } else {
    console.log('  ⚠️  部分功能未就绪:')
    if (!hasStrategy) console.log('     - 缺少当前策略')
    if (!hasEntryThreshold) console.log('     - 策略中没有 entryThreshold')
    if (!hasAlarm) console.log('     - 策略审查定时器未设置')
  }
  
  console.log('\n💡 下一步:')
  console.log('  1. 等待推荐服务运行（recommendation alarm）')
  console.log('  2. 查看 Service Worker 日志，寻找:')
  console.log('     "🎯 候选池准入阈值: { 来源: \'AI策略\', 阈值: X.X, ... }"')
  console.log('  3. 观察候选池文章数量变化')
}

// 自动运行
testStrategyIntegration()
