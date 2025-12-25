/**
 * 订阅源标准分类
 * 
 * 定义统一的分类 key，用于 AI 分析返回和 UI 显示
 * UI 显示时通过 i18n 翻译
 */

/**
 * 标准分类 key
 */
export const FEED_CATEGORIES = [
  'tech',          // 技术
  'news',          // 新闻
  'finance',       // 财经
  'lifestyle',     // 生活
  'entertainment', // 娱乐
  'education',     // 教育
  'science',       // 科学
  'sports',        // 体育
  'gaming',        // 游戏
  'design',        // 设计
  'business',      // 商业
  'health',        // 健康
  'travel',        // 旅行
  'food',          // 美食
  'photography',   // 摄影
  'music',         // 音乐
  'art',           // 艺术
  'politics',      // 政治
  'culture',       // 文化
  'other'          // 其他
] as const

export type FeedCategoryKey = typeof FEED_CATEGORIES[number]

/**
 * 检查是否为有效的分类 key
 */
export function isValidCategoryKey(key: string): key is FeedCategoryKey {
  return FEED_CATEGORIES.includes(key as FeedCategoryKey)
}

/**
 * 将 AI 返回的分类名称映射到标准 key
 * 
 * AI 可能返回中文或英文分类名，需要统一映射
 */
const CATEGORY_ALIASES: Record<string, FeedCategoryKey> = {
  // 中文别名
  '技术': 'tech',
  '科技': 'tech',
  '编程': 'tech',
  '开发': 'tech',
  '软件': 'tech',
  '互联网': 'tech',
  'IT': 'tech',
  '新闻': 'news',
  '资讯': 'news',
  '时事': 'news',
  '财经': 'finance',
  '金融': 'finance',
  '投资': 'finance',
  '经济': 'finance',
  '股票': 'finance',
  '理财': 'finance',
  '生活': 'lifestyle',
  '日常': 'lifestyle',
  '娱乐': 'entertainment',
  '影视': 'entertainment',
  '综艺': 'entertainment',
  '明星': 'entertainment',
  '教育': 'education',
  '学习': 'education',
  '教程': 'education',
  '课程': 'education',
  '科学': 'science',
  '研究': 'science',
  '学术': 'science',
  '体育': 'sports',
  '运动': 'sports',
  '足球': 'sports',
  '篮球': 'sports',
  '游戏': 'gaming',
  '电竞': 'gaming',
  '手游': 'gaming',
  '设计': 'design',
  'UI': 'design',
  'UX': 'design',
  '美术': 'design',
  '商业': 'business',
  '创业': 'business',
  '管理': 'business',
  '健康': 'health',
  '医疗': 'health',
  '养生': 'health',
  '旅行': 'travel',
  '旅游': 'travel',
  '美食': 'food',
  '餐饮': 'food',
  '烹饪': 'food',
  '摄影': 'photography',
  '图片': 'photography',
  '音乐': 'music',
  '艺术': 'art',
  '政治': 'politics',
  '时政': 'politics',
  '文化': 'culture',
  '人文': 'culture',
  '历史': 'culture',
  '其他': 'other',
  '综合': 'other',
  
  // 英文别名（小写）
  'technology': 'tech',
  'programming': 'tech',
  'development': 'tech',
  'software': 'tech',
  'internet': 'tech',
  'finance': 'finance',
  'investment': 'finance',
  'economy': 'finance',
  'lifestyle': 'lifestyle',
  'life': 'lifestyle',
  'entertainment': 'entertainment',
  'movie': 'entertainment',
  'movies': 'entertainment',
  'education': 'education',
  'learning': 'education',
  'tutorial': 'education',
  'tutorials': 'education',
  'science': 'science',
  'research': 'science',
  'sports': 'sports',
  'sport': 'sports',
  'gaming': 'gaming',
  'games': 'gaming',
  'game': 'gaming',
  'design': 'design',
  'business': 'business',
  'startup': 'business',
  'health': 'health',
  'medical': 'health',
  'travel': 'travel',
  'food': 'food',
  'cooking': 'food',
  'photography': 'photography',
  'photo': 'photography',
  'music': 'music',
  'art': 'art',
  'arts': 'art',
  'politics': 'politics',
  'political': 'politics',
  'culture': 'culture',
  'history': 'culture',
  'other': 'other',
  'general': 'other',
  'misc': 'other'
}

/**
 * 将 AI 返回的分类名称标准化为 key
 */
export function normalizeCategoryToKey(category: string): FeedCategoryKey {
  if (!category) return 'other'
  
  // 先检查是否已经是标准 key
  const lowerCategory = category.toLowerCase().trim()
  if (isValidCategoryKey(lowerCategory)) {
    return lowerCategory
  }
  
  // 查找别名映射
  const trimmed = category.trim()
  if (CATEGORY_ALIASES[trimmed]) {
    return CATEGORY_ALIASES[trimmed]
  }
  
  // 尝试小写匹配
  if (CATEGORY_ALIASES[lowerCategory]) {
    return CATEGORY_ALIASES[lowerCategory]
  }
  
  // 默认返回 other
  return 'other'
}

/**
 * 标准语言代码
 */
export const FEED_LANGUAGES = [
  'zh-CN',  // 简体中文
  'zh-TW',  // 繁体中文
  'en',     // 英语
  'ja',     // 日语
  'ko',     // 韩语
  'fr',     // 法语
  'de',     // 德语
  'es',     // 西班牙语
  'ru',     // 俄语
  'pt',     // 葡萄牙语
  'it',     // 意大利语
  'ar',     // 阿拉伯语
  'hi',     // 印地语
  'vi',     // 越南语
  'th',     // 泰语
  'id',     // 印尼语
  'unknown' // 未知
] as const

export type FeedLanguageKey = typeof FEED_LANGUAGES[number]

/**
 * 语言别名映射
 */
const LANGUAGE_ALIASES: Record<string, FeedLanguageKey> = {
  // 中文变体
  'zh': 'zh-CN',
  'zh-cn': 'zh-CN',
  'zh-hans': 'zh-CN',
  'chinese': 'zh-CN',
  '中文': 'zh-CN',
  '简体中文': 'zh-CN',
  'zh-tw': 'zh-TW',
  'zh-hant': 'zh-TW',
  '繁体中文': 'zh-TW',
  '繁體中文': 'zh-TW',
  
  // 英语变体
  'en-us': 'en',
  'en-gb': 'en',
  'english': 'en',
  '英语': 'en',
  '英文': 'en',
  
  // 日语
  'jp': 'ja',
  'japanese': 'ja',
  '日语': 'ja',
  '日文': 'ja',
  
  // 韩语
  'korean': 'ko',
  '韩语': 'ko',
  '韩文': 'ko',
  
  // 其他
  'french': 'fr',
  '法语': 'fr',
  'german': 'de',
  '德语': 'de',
  'spanish': 'es',
  '西班牙语': 'es',
  'russian': 'ru',
  '俄语': 'ru',
  'portuguese': 'pt',
  '葡萄牙语': 'pt',
  'italian': 'it',
  '意大利语': 'it',
  'arabic': 'ar',
  '阿拉伯语': 'ar'
}

/**
 * 标准化语言代码
 */
export function normalizeLanguageCode(lang: string | undefined): FeedLanguageKey {
  if (!lang) return 'unknown'
  
  const lower = lang.toLowerCase().trim()
  
  // 检查是否已经是标准代码
  if (FEED_LANGUAGES.includes(lower as FeedLanguageKey)) {
    return lower as FeedLanguageKey
  }
  
  // 查找别名
  if (LANGUAGE_ALIASES[lower]) {
    return LANGUAGE_ALIASES[lower]
  }
  
  // 尝试只取前两个字符（如 en-US -> en）
  const prefix = lower.split('-')[0]
  if (FEED_LANGUAGES.includes(prefix as FeedLanguageKey)) {
    return prefix as FeedLanguageKey
  }
  
  return 'unknown'
}
