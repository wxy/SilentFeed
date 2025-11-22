/**
 * 玻璃拟态卡片组件
 * 
 * 特点：
 * - 半透明背景 + 背景模糊
 * - 渐变边框
 * - 内部光泽效果
 * - 支持深色模式
 */

interface GlassCardProps {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'info' // 卡片变体
  hover?: boolean // 是否启用 hover 效果
  className?: string
}

const variantStyles = {
  primary: {
    bg: 'from-indigo-50/90 to-cyan-50/90 dark:from-indigo-900/20 dark:to-cyan-900/20',
    border: 'border-indigo-200/50 dark:border-indigo-700/50',
    glow: 'from-indigo-500/10 to-cyan-500/10'
  },
  secondary: {
    bg: 'from-green-50/90 to-emerald-50/90 dark:from-green-900/20 dark:to-emerald-900/20',
    border: 'border-green-200/50 dark:border-green-700/30',
    glow: 'from-green-500/10 to-emerald-500/10'
  },
  info: {
    bg: 'from-blue-50/90 to-cyan-50/90 dark:from-blue-900/20 dark:to-cyan-900/20',
    border: 'border-blue-200/50 dark:border-blue-700/30',
    glow: 'from-blue-500/10 to-cyan-500/10'
  }
}

export function GlassCard({
  children,
  variant = 'primary',
  hover = false,
  className = ''
}: GlassCardProps) {
  const styles = variantStyles[variant]
  
  return (
    <div className={`relative group ${className}`}>
      {/* 背景光晕（仅在 hover 时显示） */}
      {hover && (
        <div 
          className={`
            absolute -inset-0.5 
            bg-gradient-to-br ${styles.glow}
            rounded-xl blur opacity-0 
            group-hover:opacity-100 
            transition-opacity duration-300
          `}
        />
      )}
      
      {/* 玻璃卡片主体 */}
      <div
        className={`
          relative
          bg-gradient-to-br ${styles.bg}
          backdrop-blur-xl
          rounded-xl
          border ${styles.border}
          shadow-lg
          overflow-hidden
          transition-all duration-300
          ${hover ? 'group-hover:shadow-xl group-hover:-translate-y-0.5' : ''}
        `}
      >
        {/* 内部光泽 */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
        
        {/* 内容 */}
        <div className="relative z-10 p-4">
          {children}
        </div>
      </div>
    </div>
  )
}
