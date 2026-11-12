import { Link } from 'react-router-dom'
import { Container, Reveal, Rule, Stagger, StaggerItem } from './shared'
import { Wordmark } from './LandingNav'
import { LINKS } from './data'

type FooterLink = { label: string; to?: string; href?: string }

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Live markets', href: '#markets' },
      { label: 'Turbo', to: '/turbo' },
      { label: 'Governance', to: '/governance' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { label: 'How it works', to: '/how-it-works' },
      { label: 'Docs', to: '/docs' },
      { label: 'FAQ', to: '/faq' },
      { label: 'API', to: '/api-docs' },
    ],
  },
  {
    title: 'Verify',
    links: [
      { label: 'Contract', href: LINKS.contract },
      { label: 'Oracle audit log', href: LINKS.auditLog },
      { label: 'Source code', href: LINKS.github },
      { label: 'Brand kit', to: '/brand-kit' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms', to: '/terms' },
      { label: 'Privacy', to: '/privacy' },
      { label: 'Risk disclosure', to: '/risk-disclosure' },
      { label: 'Cookies', to: '/cookies' },
    ],
  },
]

const linkClass = 'text-[14px] text-[#8b919e] transition-colors hover:text-[#f3efe6]'

export function LandingFooter() {
  return (
    <footer className="relative pb-10 pt-16">
      <Rule />
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
          <Reveal from="fade">
            <Wordmark />
            <p className="mt-5 max-w-xs text-[14px] leading-relaxed text-[#8b919e]">
              Private prediction markets on NEAR. Predict freely, bet privately.
            </p>
          </Reveal>
          <nav aria-label="Footer">
            <Stagger gap={0.08} className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLUMNS.map((col) => (
              <StaggerItem key={col.title}>
                <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-[#c4c8d0]">{col.title}</p>
                <ul className="mt-4 space-y-3">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      {l.to ? (
                        <Link to={l.to} className={linkClass}>
                          {l.label}
                        </Link>
                      ) : l.href?.startsWith('#') ? (
                        <a href={l.href} className={linkClass}>
                          {l.label}
                        </a>
                      ) : (
                        <a href={l.href} target="_blank" rel="noreferrer" className={linkClass}>
                          {l.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </StaggerItem>
            ))}
            </Stagger>
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-white/[0.06] pt-6 text-[13px] text-[#8b919e] sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Veiled Markets. Built on NEAR.</p>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em]">NEAR testnet · test tokens only</p>
        </div>
      </Container>
    </footer>
  )
}
