import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main className="page-wrap px-4 py-12">
      <section className="island-shell rounded-2xl p-6 sm:p-8">
        <p className="island-kicker mb-2">About oneenv</p>
        <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          Lightweight env management for real teams.
        </h1>
        <p className="m-0 max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
          oneenv is a practical middle ground between ad-hoc `.env` files and full secret platforms.
          It centralizes project variables, supports import/export, and keeps a rollback-capable history.
        </p>
      </section>
    </main>
  )
}
