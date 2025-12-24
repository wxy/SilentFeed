/**
 * 环形进度条组件
 * 
 * 特点：
 * - 渐变色进度圈（靛青→青色）
 * - 中心显示图标和数字
 * - 平滑动画过渡
 * - 支持深色模式
 * - 支持手绘风格
 * - 支持图标点击
 * - 支持百分比或自定义文本显示
 */

interface CircularProgressProps {
  progress: number // 0-100
  icon: string
  current?: number  // 可选，用于显示 current/total
  total?: number    // 可选，用于显示 current/total
  progressText?: string  // 可选，自定义进度文本（优先于 current/total）
  size?: number // 直径（像素）
  isSketchyStyle?: boolean // 是否使用手绘风格
  onIconClick?: () => void // 图标点击事件
  iconClickable?: boolean // 图标是否可点击（显示悬停效果）
}

export function CircularProgress({
  progress,
  icon,
  current,
  total,
  progressText,
  size = 128,
  isSketchyStyle = false,
  onIconClick,
  iconClickable = false
}: CircularProgressProps) {
  const radius = (size - 16) / 2 // 留出边距
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (progress / 100) * circumference
  
  // 决定显示的文本
  const displayText = progressText ?? (current !== undefined && total !== undefined ? `${current}/${total}` : `${Math.round(progress)}%`)
  
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      {/* SVG 环形进度条 */}
      <svg
        className="transform -rotate-90"
        width={size}
        height={size}
      >
        {/* 渐变定义 - 靛青到青色 */}
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" className="text-indigo-500" stopColor="currentColor" />
            <stop offset="50%" className="text-cyan-500" stopColor="currentColor" />
            <stop offset="100%" className="text-teal-400" stopColor="currentColor" />
          </linearGradient>
          
          {/* 发光滤镜 */}
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* 背景圆环 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
          className="text-gray-200 dark:text-gray-700"
        />
        
        {/* 进度圆环 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#progressGradient)"
          strokeWidth="8"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          filter="url(#glow)"
          className="transition-all duration-500 ease-out"
        />
      </svg>
      
      {/* 中心内容 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div 
          className={`text-5xl mb-1 ${
            iconClickable ? 'cursor-pointer hover:scale-110 transition-transform' : ''
          } ${
            isSketchyStyle ? 'sketchy-emoji' : ''
          }`}
          onClick={onIconClick}
        >
          {icon}
        </div>
        <div className={`text-sm font-semibold ${
          isSketchyStyle ? 'sketchy-text' : 'text-gray-600 dark:text-gray-400'
        }`}>
          {displayText}
        </div>
      </div>
    </div>
  )
}
