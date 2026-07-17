import i18n from '@/i18n/config'

/**
 * Format timestamps with the active application locale.
 *
 * Short intervals use translation resources so wording remains consistent with
 * the UI; older timestamps use the platform's locale-aware date formatting.
 */
export function formatRelativeTime(timestamp: number): string {
  const diff = Math.max(0, Date.now() - timestamp)
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return i18n.t('time.justNow')
  if (minutes < 60) return i18n.t('time.minutesAgo', { count: minutes })
  if (hours < 24) return i18n.t('time.hoursAgo', { count: hours })
  if (days < 7) return i18n.t('time.daysAgo', { count: days })

  return new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
    month: '2-digit',
    day: '2-digit',
  }).format(timestamp)
}
