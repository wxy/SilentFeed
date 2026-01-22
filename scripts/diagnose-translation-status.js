/**
 * 诊断候选池文章翻译状态
 * 
 * 使用方法：
 * 1. 在 Service Worker 控制台运行
 * 2. 检查候选池文章是否有翻译数据
 */

// 在 Service Worker 控制台中运行此代码
(async function diagnoseTranslationStatus() {
  console.log('🔍 开始诊断候选池文章翻译状态...')
  
  try {
    // 1. 检查翻译配置
    const uiConfig = await getUIConfig()
    console.log('\n⚙️ 翻译配置:')
    console.log(`  - 自动翻译: ${uiConfig.autoTranslate ? '✅ 启用' : '❌ 禁用'}`)
    
    const chromeLanguage = chrome.i18n.getUILanguage()
    console.log(`  - 界面语言: ${chromeLanguage}`)
    
    // 2. 查询候选池文章
    const candidates = await db.feedArticles
      .filter(a => a.poolStatus === 'candidate')
      .toArray()
    
    console.log(`\n📦 候选池文章总数: ${candidates.length}`)
    
    // 3. 统计翻译情况
    const withTranslation = candidates.filter(a => a.translation)
    const withoutTranslation = candidates.filter(a => !a.translation)
    
    console.log(`\n📊 翻译统计:`)
    console.log(`  - 有翻译: ${withTranslation.length} 篇 (${((withTranslation.length / candidates.length) * 100).toFixed(1)}%)`)
    console.log(`  - 无翻译: ${withoutTranslation.length} 篇 (${((withoutTranslation.length / candidates.length) * 100).toFixed(1)}%)`)
    
    // 4. 分析有翻译的文章
    if (withTranslation.length > 0) {
      console.log(`\n✅ 有翻译的文章示例 (前5篇):`)
      withTranslation.slice(0, 5).forEach((a, i) => {
        console.log(`\n  ${i + 1}. ${a.title}`)
        console.log(`     - 源语言: ${a.translation.sourceLanguage}`)
        console.log(`     - 目标语言: ${a.translation.targetLanguage}`)
        console.log(`     - 有翻译标题: ${!!a.translation.translatedTitle}`)
        console.log(`     - 翻译标题: ${a.translation.translatedTitle || 'N/A'}`)
        
        // 语言匹配检查
        const currentLanguage = chromeLanguage.toLowerCase()
        const targetLang = a.translation.targetLanguage
        const sourceLang = a.translation.sourceLanguage
        
        const langMatches = targetLang.toLowerCase().startsWith(currentLanguage.split('-')[0]) ||
                          currentLanguage.startsWith(targetLang.toLowerCase().split('-')[0])
        const needsTranslation = !sourceLang.toLowerCase().startsWith(targetLang.toLowerCase().split('-')[0])
        
        console.log(`     - 语言匹配: ${langMatches ? '✅' : '❌'}`)
        console.log(`     - 需要翻译: ${needsTranslation ? '✅' : '❌'}`)
        console.log(`     - 应使用翻译链接: ${langMatches && needsTranslation ? '✅ 是' : '❌ 否'}`)
      })
    }
    
    // 5. 分析无翻译的文章
    if (withoutTranslation.length > 0) {
      console.log(`\n❌ 无翻译的文章示例 (前5篇):`)
      withoutTranslation.slice(0, 5).forEach((a, i) => {
        console.log(`\n  ${i + 1}. ${a.title}`)
        console.log(`     - ID: ${a.id}`)
        console.log(`     - 链接: ${a.link}`)
        console.log(`     - 分析时间: ${a.analyzedAt ? new Date(a.analyzedAt).toLocaleString() : 'N/A'}`)
        console.log(`     - 有分析数据: ${!!a.analysis}`)
      })
    }
    
    // 6. 检查推荐池文章
    const recommended = await db.feedArticles
      .filter(a => a.poolStatus === 'recommended')
      .toArray()
    
    console.log(`\n🎯 推荐池文章:`)
    console.log(`  - 总数: ${recommended.length}`)
    
    if (recommended.length > 0) {
      const recWithTranslation = recommended.filter(a => a.translation)
      console.log(`  - 有翻译: ${recWithTranslation.length} 篇`)
      console.log(`  - 无翻译: ${recommended.length - recWithTranslation.length} 篇`)
    }
    
    // 7. 检查最近补充的文章
    const recentRecommended = await db.feedArticles
      .filter(a => a.poolStatus === 'recommended')
      .toArray()
    
    const sortedByTime = recentRecommended.sort((a, b) => 
      (b.popupAddedAt || 0) - (a.popupAddedAt || 0)
    )
    
    if (sortedByTime.length > 0) {
      console.log(`\n⏰ 最近补充的文章 (前3篇):`)
      sortedByTime.slice(0, 3).forEach((a, i) => {
        console.log(`\n  ${i + 1}. ${a.title}`)
        console.log(`     - 补充时间: ${a.popupAddedAt ? new Date(a.popupAddedAt).toLocaleString() : 'N/A'}`)
        console.log(`     - 有翻译: ${a.translation ? '✅' : '❌'}`)
        if (a.translation) {
          console.log(`     - 源语言: ${a.translation.sourceLanguage}`)
          console.log(`     - 目标语言: ${a.translation.targetLanguage}`)
          console.log(`     - 翻译标题: ${a.translation.translatedTitle}`)
        }
      })
    }
    
    console.log(`\n✅ 诊断完成！`)
    
    // 给出建议
    if (withoutTranslation.length > 0 && uiConfig.autoTranslate) {
      console.log(`\n💡 建议:`)
      console.log(`  - 有 ${withoutTranslation.length} 篇候选文章缺少翻译`)
      console.log(`  - 这些文章可能是在翻译功能启用前添加的`)
      console.log(`  - 可以考虑触发重新分析来补充翻译`)
    }
    
  } catch (error) {
    console.error('❌ 诊断失败:', error)
  }
})()
