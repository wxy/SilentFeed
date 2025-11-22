/**
 * 带光晕效果的图标容器
 * 
 * 特点：
 * - 渐变背景光晕
 * - 玻璃拟态效果
 * - 支持脉冲动画（RSS 发现时）
 * - 支持点击交互
 */

interface IconContainerProps {
  icon: string
  size?: 'sm' | 'md' | 'lg'
  pulse?: boolean // 是否显示脉冲动画
  onClick?: () => void
  className?: string
}

const sizeClasses = {
  sm: 'w-16 h-16 text-3xl',
  md: 'w-24 h-24 text-5xl',
  lg: 'w-32 h-32 text-6xl'
}

export function IconContainer({
  icon,
  size = 'md',
  pulse = false,
  onClick,
  className = ''
}: IconContainerProps) {
  const containerClass = sizeClasses[size]
  const isClickable = !!onClick
  
  return (
    <div className={`relative ${className}`}>
      {/* 背景光晕 - 双层渐变（靛青→青色） */}
      <div 
        className={`
          absolute inset-0 
          bg-gradient-to-br from-indigo-200 via-cyan-200 to-teal-200
          dark:from-indigo-900/40 dark:via-cyan-900/40 dark:to-teal-900/40
          rounded-3xl blur-2xl opacity-60
          ${pulse ? 'animate-pulse-glow' : ''}
        `}
      />
      
      {/* 外层光环（脉冲动画） */}
      {pulse && (
        <div className="absolute -inset-2 rounded-3xl bg-gradient-to-br from-indigo-400/30 to-cyan-400/30 animate-ping" />
      )}
      
      {/* 图标主体 - 玻璃拟态 */}
      <div
        className={`
          relative ${containerClass}
          rounded-2xl
          bg-gradient-to-br from-white/80 to-gray-50/80
          dark:from-gray-800/80 dark:to-gray-900/80
          backdrop-blur-xl
          shadow-lg
          border border-white/20 dark:border-gray-700/30
          flex items-center justify-center
          transition-all duration-300
          ${isClickable ? 'cursor-pointer hover:scale-105 hover:shadow-xl' : ''}
        `}
        onClick={onClick}
      >
        {/* 内部光泽 */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
        
        {/* 图标 */}
        <span className="relative z-10">{icon}</span>
      </div>
    </div>
  )
}
