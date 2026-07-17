// i18n hook
import { useTranslation } from 'react-i18next'
import { changeLanguage as persistLanguageChange } from './config'

// 自定义 hook，简化翻译调用和语言切换
export const useAppTranslation = () => {
  const { t, i18n } = useTranslation('translation')
  
  const changeLanguage = async (lng: string) => {
    await persistLanguageChange(lng)
  }
  
  return {
    t,
    i18n,
    changeLanguage,
    currentLang: i18n.language,
  }
}

// 导出基础 hook
export { useTranslation }
