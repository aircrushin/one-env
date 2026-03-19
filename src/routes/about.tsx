import { createFileRoute } from '@tanstack/react-router'
import { useI18n } from '#/lib/i18n'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  const { messages } = useI18n()

  return (
    <main className="page-wrap px-4 py-12">
      <section className="island-shell rounded-2xl p-6 sm:p-8">
        <p className="island-kicker mb-2">{messages.about.kicker}</p>
        <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          {messages.about.title}
        </h1>
        <p className="m-0 max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
          {messages.about.description}
        </p>
      </section>
    </main>
  )
}
