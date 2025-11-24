/**
 * 调试脚本：检查用户画像数据
 * 运行方法：node debug-profile.js
 */

import Dexie from 'dexie'

// 打开数据库
const db = new Dexie('SilentFeedDB')

db.version(14).stores({
  userProfile: 'id, lastUpdated, version'
})

async function checkProfile() {
  try {
    console.log('📊 正在检查用户画像数据...\n')
    
    const profile = await db.table('userProfile').get('singleton')
    
    if (!profile) {
      console.log('❌ 未找到用户画像数据')
      console.log('\n💡 建议：在扩展中浏览一些页面，触发画像生成')
      return
    }
    
    console.log('✅ 找到用户画像数据')
    console.log('='.repeat(50))
    
    // 基本信息
    console.log('\n📌 基本信息:')
    console.log(`  版本: ${profile.version}`)
    console.log(`  总页面数: ${profile.totalPages}`)
    console.log(`  最后更新: ${new Date(profile.lastUpdated).toLocaleString('zh-CN')}`)
    
    // AI 画像
    console.log('\n🤖 AI 语义画像:')
    if (profile.aiSummary) {
      console.log(`  ✅ 已生成`)
      console.log(`  Provider: ${profile.aiSummary.metadata?.provider || '未知'}`)
      console.log(`  Model: ${profile.aiSummary.metadata?.model || '未知'}`)
      console.log(`  生成时间: ${new Date(profile.aiSummary.metadata?.timestamp || 0).toLocaleString('zh-CN')}`)
      console.log(`\n  💭 兴趣理解:`)
      console.log(`    "${profile.aiSummary.interests}"`)
      console.log(`\n  ⭐ 内容偏好 (${profile.aiSummary.preferences.length}个):`)
      profile.aiSummary.preferences.forEach((p, i) => console.log(`    ${i + 1}. ${p}`))
      console.log(`\n  🚫 避免主题 (${profile.aiSummary.avoidTopics.length}个):`)
      profile.aiSummary.avoidTopics.forEach((t, i) => console.log(`    ${i + 1}. ${t}`))
      console.log(`\n  📊 数据来源:`)
      console.log(`    浏览: ${profile.aiSummary.metadata?.basedOn?.browses || 0}`)
      console.log(`    阅读: ${profile.aiSummary.metadata?.basedOn?.reads || 0}`)
      console.log(`    拒绝: ${profile.aiSummary.metadata?.basedOn?.dismisses || 0}`)
      if (profile.aiSummary.metadata?.cost) {
        console.log(`  💰 成本: ¥${profile.aiSummary.metadata.cost.toFixed(4)}`)
      }
    } else {
      console.log(`  ❌ 未生成`)
      console.log(`  原因可能：`)
      console.log(`    1. AI 未配置（需要在设置中配置 API Key）`)
      console.log(`    2. 浏览页面不足 20 页（当前: ${profile.totalPages}）`)
      console.log(`    3. 阅读/拒绝数据不足`)
    }
    
    // 行为数据
    console.log('\n📈 行为数据:')
    if (profile.behaviors) {
      console.log(`  阅读记录: ${profile.behaviors.reads?.length || 0} 条`)
      console.log(`  拒绝记录: ${profile.behaviors.dismisses?.length || 0} 条`)
      console.log(`  总阅读数: ${profile.behaviors.totalReads || 0}`)
      console.log(`  总拒绝数: ${profile.behaviors.totalDismisses || 0}`)
    } else {
      console.log(`  ❌ 无行为数据`)
    }
    
    // 展示关键词
    console.log('\n🔑 展示关键词:')
    if (profile.displayKeywords && profile.displayKeywords.length > 0) {
      console.log(`  ${profile.displayKeywords.slice(0, 10).map(k => k.word).join(', ')}`)
    } else {
      console.log(`  ❌ 无关键词数据`)
    }
    
    console.log('\n' + '='.repeat(50))
    console.log('\n💡 如果 AI 画像未生成，请：')
    console.log('  1. 在扩展设置中配置 AI Provider（DeepSeek 或 OpenAI）')
    console.log('  2. 浏览至少 20 个页面（每页停留 30 秒以上）')
    console.log('  3. 或阅读/拒绝至少 5 篇推荐')
    console.log('  4. 系统会自动触发 AI 画像生成\n')
    
  } catch (error) {
    console.error('❌ 检查失败:', error)
  } finally {
    db.close()
  }
}

checkProfile()
