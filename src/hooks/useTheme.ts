/**
 * 主题管理 Hook
 * 自动跟随系统主题
 */

import { useState, useEffect } from "react"
import {
  getSystemTheme,
  watchSystemTheme,
} from "@/storage/ui-config"

/**
 * 使用系统主题 Hook
 * 
 * @returns 当前系统主题
 */
export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light")
  
  // 初始化主题
  useEffect(() => {
    setTheme(getSystemTheme())
  }, [])
  
  // 监听系统主题变化
  useEffect(() => {
    const unwatch = watchSystemTheme((isDark) => {
      setTheme(isDark ? "dark" : "light")
    })
    
    return unwatch
  }, [])
  
  // 应用主题到 DOM（添加 .dark 类）
  useEffect(() => {
    if (typeof document !== "undefined") {
      const root = document.documentElement
      
      if (theme === "dark") {
        root.classList.add("dark")
      } else {
        root.classList.remove("dark")
      }
    }
  }, [theme])
  
  return {
    theme,           // 当前主题 (light/dark)
    isDark: theme === "dark",
  }
}
