/**
 * 主题定义和关键词映射
 */

/**
 * 支持的主题枚举
 */
export enum Topic {
  TECHNOLOGY = 'technology',        // 技术
  SCIENCE = 'science',              // 科学
  BUSINESS = 'business',            // 商业
  DESIGN = 'design',                // 设计
  ARTS = 'arts',                    // 艺术
  HEALTH = 'health',                // 健康
  SPORTS = 'sports',                // 体育
  ENTERTAINMENT = 'entertainment',   // 娱乐
  NEWS = 'news',                    // 新闻
  EDUCATION = 'education',          // 教育
  OTHER = 'other'                   // 其他
}

/**
 * 主题中文名称映射
 */
export const TOPIC_NAMES: Record<Topic, string> = {
  [Topic.TECHNOLOGY]: '技术',
  [Topic.SCIENCE]: '科学',
  [Topic.BUSINESS]: '商业',
  [Topic.DESIGN]: '设计',
  [Topic.ARTS]: '艺术',
  [Topic.HEALTH]: '健康',
  [Topic.SPORTS]: '体育',
  [Topic.ENTERTAINMENT]: '娱乐',
  [Topic.NEWS]: '新闻',
  [Topic.EDUCATION]: '教育',
  [Topic.OTHER]: '其他'
}

/**
 * 主题动物emoji映射
 */
export const TOPIC_ANIMALS: Record<Topic, string> = {
  [Topic.TECHNOLOGY]: '🤖',      // 机器人 - 代表技术创新
  [Topic.SCIENCE]: '🐧',         // 企鹅 - 代表科学探索
  [Topic.BUSINESS]: '🦁',        // 狮子 - 代表商业领导力
  [Topic.DESIGN]: '🦋',          // 蝴蝶 - 代表设计美感
  [Topic.ARTS]: '🎨',            // 调色板 - 代表艺术创作
  [Topic.HEALTH]: '🐶',          // 狗狗 - 代表健康活力
  [Topic.SPORTS]: '🐎',          // 马 - 代表运动速度
  [Topic.ENTERTAINMENT]: '🐱',   // 猫咪 - 代表娱乐休闲
  [Topic.NEWS]: '🐦',            // 鸟类 - 代表信息传播
  [Topic.EDUCATION]: '🦉',       // 猫头鹰 - 代表智慧学习
  [Topic.OTHER]: '🐼'            // 熊猫 - 代表其他内容
}

/**
 * 主题动物性格描述
 */
export const TOPIC_PERSONALITIES: Record<Topic, string> = {
  [Topic.TECHNOLOGY]: '科技极客，总是追求最新的技术趋势',
  [Topic.SCIENCE]: '理性探索者，对世界充满好奇心',
  [Topic.BUSINESS]: '商业领袖，具有敏锐的市场嗅觉',
  [Topic.DESIGN]: '美感追求者，注重视觉和用户体验',
  [Topic.ARTS]: '艺术鉴赏家，欣赏各种创意表达',
  [Topic.HEALTH]: '健康生活倡导者，关注身心wellness',
  [Topic.SPORTS]: '运动爱好者，享受竞技和健身乐趣',
  [Topic.ENTERTAINMENT]: '娱乐达人，热爱轻松有趣的内容',
  [Topic.NEWS]: '信息收集者，关注时事和社会动态',
  [Topic.EDUCATION]: '终身学习者，持续自我提升',
  [Topic.OTHER]: '兴趣广泛的探索者'
}

/**
 * 主题关键词映射（规则引擎）
 */
export const TOPIC_KEYWORDS: Record<Topic, string[]> = {
  [Topic.TECHNOLOGY]: [
    // 编程语言
    'javascript', 'python', 'java', 'typescript', 'react', 'vue', 'angular',
    'node.js', 'golang', 'rust', 'kotlin', 'swift', 'php', 'ruby',
    
    // 技术概念
    'programming', 'code', 'software', 'developer', 'algorithm', 'api',
    'database', 'frontend', 'backend', 'fullstack', 'devops', 'cloud',
    'docker', 'kubernetes', 'microservices', 'aws', 'azure', 'gcp',
    
    // 中文
    '编程', '代码', '软件', '开发', '算法', '前端', '后端', '全栈',
    '架构', '框架', '数据库', '云计算', '人工智能', '机器学习',
    '深度学习', '区块链', '物联网', '大数据'
  ],
  
  [Topic.SCIENCE]: [
    // 学科
    'research', 'study', 'experiment', 'scientific', 'theory', 'physics',
    'chemistry', 'biology', 'mathematics', 'psychology', 'medicine',
    'astronomy', 'genetics', 'neuroscience', 'ecology',
    
    // 中文
    '研究', '实验', '科学', '理论', '物理', '化学', '生物', '数学',
    '心理学', '医学', '天文', '基因', '神经', '生态', '论文', '学术'
  ],
  
  [Topic.BUSINESS]: [
    // 商业概念
    'business', 'marketing', 'finance', 'management', 'strategy',
    'startup', 'entrepreneurship', 'investment', 'sales', 'economics',
    'analysis', 'market', 'revenue', 'profit', 'growth',
    
    // 中文
    '商业', '营销', '金融', '管理', '战略', '创业', '投资', '销售',
    '经济', '分析', '市场', '收入', '利润', '增长', '企业', '公司'
  ],
  
  [Topic.DESIGN]: [
    // 设计概念
    'design', 'ui', 'ux', 'interface', 'typography', 'color', 'layout',
    'visual', 'graphic', 'web design', 'mobile design', 'branding',
    'illustration', 'photography', 'animation', 'prototype',
    
    // 中文
    '设计', '界面', '视觉', '交互', '排版', '颜色', '布局', '图形',
    '品牌', '插画', '摄影', '动画', '原型', '用户体验', '产品设计'
  ],
  
  [Topic.ARTS]: [
    // 艺术形式
    'art', 'music', 'painting', 'sculpture', 'theater', 'dance',
    'literature', 'poetry', 'novel', 'gallery', 'museum', 'exhibition',
    'artist', 'creative', 'culture', 'aesthetic',
    
    // 中文
    '艺术', '音乐', '绘画', '雕塑', '戏剧', '舞蹈', '文学', '诗歌',
    '小说', '画廊', '博物馆', '展览', '艺术家', '创意', '文化', '美学'
  ],
  
  [Topic.HEALTH]: [
    // 健康概念
    'health', 'fitness', 'nutrition', 'exercise', 'diet', 'wellness',
    'medical', 'doctor', 'hospital', 'treatment', 'medicine', 'therapy',
    'mental health', 'yoga', 'meditation', 'sleep',
    
    // 中文
    '健康', '健身', '营养', '运动', '饮食', '医疗', '医生', '医院',
    '治疗', '药物', '心理健康', '瑜伽', '冥想', '睡眠', '养生'
  ],
  
  [Topic.SPORTS]: [
    // 体育项目
    'sports', 'football', 'basketball', 'soccer', 'tennis', 'golf',
    'swimming', 'running', 'cycling', 'baseball', 'volleyball',
    'olympic', 'competition', 'athlete', 'training', 'championship',
    
    // 中文
    '体育', '足球', '篮球', '网球', '高尔夫', '游泳', '跑步', '骑行',
    '棒球', '排球', '奥运', '比赛', '运动员', '训练', '冠军', '体育赛事'
  ],
  
  [Topic.ENTERTAINMENT]: [
    // 娱乐内容
    'movie', 'film', 'tv', 'series', 'anime', 'game', 'gaming',
    'celebrity', 'entertainment', 'music', 'concert', 'festival',
    'streaming', 'netflix', 'youtube', 'social media',
    
    // 中文
    '电影', '电视', '电视剧', '动漫', '游戏', '娱乐', '明星', '演唱会',
    '音乐节', '流媒体', '社交媒体', '抖音', '微博', '综艺', '娱乐圈'
  ],
  
  [Topic.NEWS]: [
    // 新闻概念
    'news', 'politics', 'government', 'policy', 'election', 'economy',
    'international', 'domestic', 'breaking', 'current', 'affairs',
    'journalism', 'reporter', 'press', 'media',
    
    // 中文
    '新闻', '政治', '政府', '政策', '选举', '经济', '国际', '国内',
    '时事', '新闻业', '记者', '媒体', '报道', '头条', '热点'
  ],
  
  [Topic.EDUCATION]: [
    // 教育概念
    'education', 'school', 'university', 'college', 'student', 'teacher',
    'learning', 'course', 'tutorial', 'lesson', 'knowledge', 'skill',
    'training', 'certificate', 'degree', 'academic',
    
    // 中文
    '教育', '学校', '大学', '学院', '学生', '老师', '学习', '课程',
    '教程', '课堂', '知识', '技能', '培训', '证书', '学位', '学术'
  ],
  
  [Topic.OTHER]: []
}

/**
 * 主题图标映射
 */
export const TOPIC_ICONS: Record<Topic, string> = {
  [Topic.TECHNOLOGY]: '💻',
  [Topic.SCIENCE]: '🔬',
  [Topic.BUSINESS]: '📈',
  [Topic.DESIGN]: '🎨',
  [Topic.ARTS]: '🎭',
  [Topic.HEALTH]: '🏥',
  [Topic.SPORTS]: '⚽',
  [Topic.ENTERTAINMENT]: '🎬',
  [Topic.NEWS]: '📰',
  [Topic.EDUCATION]: '🎓',
  [Topic.OTHER]: '📂'
}