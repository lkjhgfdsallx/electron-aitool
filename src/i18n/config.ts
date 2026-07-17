// i18n configuration
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { zhCN } from './locales/zh-CN'
import { enUS } from './locales/en-US'

// 语言配置
export const languages = [
  { code: 'zh-CN', name: '简体中文', label: '中文' },
  { code: 'en-US', name: 'English', label: 'EN' },
]

// 获取默认语言
export const getDefaultLanguage = (): string => {
  // 优先从 localStorage 读取
  const savedLanguage = localStorage.getItem('localforge-language')
  if (savedLanguage) {
    return savedLanguage
  }

  // 其次检测浏览器语言
  const browserLang = navigator.language.toLowerCase()
  if (browserLang.startsWith('zh')) {
    return 'zh-CN'
  }

  // 默认中文
  return 'zh-CN'
}

// 切换语言、持久化并同步文档语言标记
export const changeLanguage = async (lang: string) => {
  localStorage.setItem('localforge-language', lang)
  await i18n.changeLanguage(lang)
  document.documentElement.lang = lang
}

i18n
  // 浏览器语言检测
  .use(LanguageDetector)
  // react-i18next
  .use(initReactI18next)
  // 初始化配置
  .init({
    resources: {
      'zh-CN': zhCN,
      'en-US': enUS,
    },
    fallbackLng: 'zh-CN',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false, // react 已经做了 XSS 防护
    },
  })

// 初始化与外部语言切换时，同步 <html lang>，供浏览器和辅助技术读取。
i18n.on('languageChanged', (lang) => {
  document.documentElement.lang = lang
})

export default i18n
