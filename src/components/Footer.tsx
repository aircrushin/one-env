import { useI18n } from '#/lib/i18n'

export default function Footer() {
  const { messages } = useI18n()
  const year = new Date().getFullYear()

  return (
    <footer className="mt-20 border-t border-[var(--line)] px-4 pb-14 pt-10 text-[var(--sea-ink-soft)]">
      <div className="page-wrap flex flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
        <p className="m-0 text-sm">{messages.footer.rights(year)}</p>
        <p className="island-kicker m-0">{messages.footer.tagline}</p>
      </div>
    </footer>
  )
}
