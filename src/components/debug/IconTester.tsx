import { useState } from "react"
import { LEARNING_COMPLETE_PAGES } from "@/constants/progress"

/**
 * 图标测试组件 - 开发环境专用
 * 用于在浏览器中测试所有图标状态
 */
export function IconTester() {
  const [status, setStatus] = useState<string>("")

  // 测试学习进度(0-100页)
  const testLearning = async (pages: number) => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DEBUG_SET_LEARNING',
        pages
      })
      setStatus(`✅ 学习进度已设置: ${pages}/${LEARNING_COMPLETE_PAGES} 页`)
    } catch (error) {
      setStatus(`❌ 错误: ${error instanceof Error ? error instanceof Error ? error.message : String(error) : String(error)}`)
    }
  }

  // 测试推荐阅读(1-3条)
  const testRecommend = async (count: number) => {
    try {
      await chrome.runtime.sendMessage({
        type: 'DEBUG_SET_RECOMMEND',
        count
      })
      setStatus(`✅ 推荐阅读已设置: ${count} 条`)
    } catch (error) {
      setStatus(`❌ 错误: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // 测试RSS发现动画
  const testDiscover = async () => {
    try {
      await chrome.runtime.sendMessage({
        type: 'DEBUG_START_DISCOVER'
      })
      setStatus(`✅ RSS发现动画已启动 (循环3次, 共4.5秒)`)
    } catch (error) {
      setStatus(`❌ 错误: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // 测试后台抓取(圆点呼吸)
  const testFetching = async (enable: boolean) => {
    try {
      await chrome.runtime.sendMessage({
        type: 'DEBUG_SET_FETCHING',
        enable
      })
      setStatus(enable ? `✅ 后台抓取动画已启动` : `✅ 后台抓取动画已停止`)
    } catch (error) {
      setStatus(`❌ 错误: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // 测试暂停状态(灰度滤镜)
  const testPaused = async (enable: boolean) => {
    try {
      await chrome.runtime.sendMessage({
        type: 'DEBUG_SET_PAUSED',
        enable
      })
      setStatus(enable ? `✅ 暂停状态已启用 (灰度滤镜)` : `✅ 暂停状态已关闭`)
    } catch (error) {
      setStatus(`❌ 错误: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // 测试错误状态
  const testError = async (enable: boolean) => {
    try {
      await chrome.runtime.sendMessage({
        type: 'DEBUG_SET_ERROR',
        enable
      })
      setStatus(enable ? `✅ 错误状态已启用` : `✅ 错误状态已关闭`)
    } catch (error) {
      setStatus(`❌ 错误: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // 重置到默认状态
  const resetIcon = async () => {
    try {
      await chrome.runtime.sendMessage({
        type: 'DEBUG_RESET_ICON'
      })
      setStatus(`✅ 图标已重置`)
    } catch (error) {
      setStatus(`❌ 错误: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-3">🎨 图标状态测试</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          在浏览器工具栏中查看图标变化。状态优先级: 发现 &gt; 暂停 &gt; 抓取 &gt; 推荐 &gt; 学习
        </p>
      </div>

      {/* 状态显示 */}
      {status && (
        <div className={`p-3 rounded-lg text-sm ${
          status.startsWith('✅') 
            ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
            : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
        }`}>
          {status}
        </div>
      )}

      {/* 学习进度 */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
  <h4 className="font-medium mb-3">📚 学习进度 (0-100页)</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          从上往下的圆角遮罩,逐渐揭开图标
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => testLearning(0)}
            className="px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            0 页
          </button>
          <button
            onClick={() => testLearning(25)}
            className="px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            25 页
          </button>
          <button
            onClick={() => testLearning(50)}
            className="px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            50 页
          </button>
          <button
            onClick={() => testLearning(75)}
            className="px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            75 页
          </button>
          <button
            onClick={() => testLearning(LEARNING_COMPLETE_PAGES)}
            className="px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            {LEARNING_COMPLETE_PAGES} 页 (完成)
          </button>
        </div>
      </div>

      {/* 推荐阅读 */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h4 className="font-medium mb-3">📖 推荐阅读 (1-3条波纹)</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          点亮1-3条橙色波纹
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => testRecommend(1)}
            className="px-3 py-2 text-sm bg-orange-500 text-white rounded hover:bg-orange-600"
          >
            1 条推荐
          </button>
          <button
            onClick={() => testRecommend(2)}
            className="px-3 py-2 text-sm bg-orange-500 text-white rounded hover:bg-orange-600"
          >
            2 条推荐
          </button>
          <button
            onClick={() => testRecommend(3)}
            className="px-3 py-2 text-sm bg-orange-500 text-white rounded hover:bg-orange-600"
          >
            3 条推荐
          </button>
        </div>
      </div>

      {/* RSS发现动画 */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h4 className="font-medium mb-3">📡 RSS发现动画</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          波纹逐渐点亮(0→1→2→3),循环3次,总时长6秒
        </p>
        <button
          onClick={testDiscover}
          className="px-4 py-2 text-sm bg-purple-500 text-white rounded hover:bg-purple-600"
        >
          启动发现动画
        </button>
      </div>

      {/* 后台抓取 */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h4 className="font-medium mb-3">💫 后台抓取 (三波纹呼吸)</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          三个波纹蒙版呼吸动画,1.5秒周期,透明度0.2-1.0
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => testFetching(true)}
            className="px-4 py-2 text-sm bg-green-500 text-white rounded hover:bg-green-600"
          >
            启动
          </button>
          <button
            onClick={() => testFetching(false)}
            className="px-4 py-2 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            停止
          </button>
        </div>
      </div>

      {/* 暂停状态 */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h4 className="font-medium mb-3">⏸️ 暂停状态 (灰度滤镜)</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          整个图标变为灰色
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => testPaused(true)}
            className="px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            启用暂停
          </button>
          <button
            onClick={() => testPaused(false)}
            className="px-4 py-2 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            取消暂停
          </button>
        </div>
      </div>

      {/* 错误状态 */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h4 className="font-medium mb-3">❌ 错误状态 (红色圆点闪动)</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          左下角红色圆点闪动,1秒周期
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => testError(true)}
            className="px-4 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600"
          >
            显示错误
          </button>
          <button
            onClick={() => testError(false)}
            className="px-4 py-2 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            清除错误
          </button>
        </div>
      </div>

      {/* 重置按钮 */}
      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={resetIcon}
          className="w-full px-4 py-3 text-sm bg-gray-700 dark:bg-gray-600 text-white rounded-lg hover:bg-gray-800 dark:hover:bg-gray-700 font-medium"
        >
          🔄 重置图标到默认状态
        </button>
      </div>
    </div>
  )
}
