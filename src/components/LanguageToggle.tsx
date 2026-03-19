import { useI18n } from '#/lib/i18n'

export default function LanguageToggle() {
  const { language, setLanguage, messages } = useI18n()

  const nextLanguage = language === 'zh' ? 'en' : 'zh'
  const label = messages.language.switchTo[nextLanguage]

  return (
    <button
      type="button"
      onClick={() => setLanguage(nextLanguage)}
      aria-label={label}
      title={label}
      className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm font-semibold text-[var(--sea-ink)] shadow-[0_8px_22px_rgba(30,90,72,0.08)] transition hover:-translate-y-0.5"
    >
      {nextLanguage === 'zh' ? '中文' : 'EN'}
    </button>
  )
}
