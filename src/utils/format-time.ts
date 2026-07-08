/**
 * 相对时间格式化工具
 *
 * 统一各处（WorkspaceChatPanel、WorkspacePage 等）的 formatRelativeTime 实现。
 */

/**
 * 将时间戳格式化为相对时间字符串（中文）。
 *
 * 规则：
 * - < 1 分钟 → "刚刚"
 * - < 1 小时 → "N 分钟前"
 * - < 1 天   → "N 小时前"
 * - < 7 天   → "N 天前"
 * - ≥ 7 天   → "MM/DD" 格式
 *
 * @param timestamp 毫秒时间戳
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`

  const date = new Date(timestamp)
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${month}/${day}`
}
