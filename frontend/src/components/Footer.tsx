import { Github, Twitter, MessageCircle, Globe, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

const footerRoutes: Record<string, string> = {
  // Resources
  'How It Works': '/how-it-works',
  'FAQ': '/faq',
  'API Docs': '/api-docs',
  'Brand Kit': '/brand-kit',
  'Bug Bounty': '/bug-bounty',
  // Legal
  'Terms of Service': '/terms',
  'Privacy Policy': '/privacy',
  'Risk Disclosure': '/risk-disclosure',
  'Cookies': '/cookies',
}

export function Footer() {
  return (
    <footer className="relative mt-32 border-t border-white/[0.04]">
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-px bg-gradient-to-r from-transparent via-brand-400/20 to-transparent" />

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-4 lg:col-span-1 mb-4 lg:mb-0">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative w-9 h-9 rounded-xl overflow-hidden">
                <img src="/logo.png" alt="Veiled" className="w-9 h-9 object-cover rounded-xl" />
              </div>
              <span className="font-display text-lg text-white">Veiled Markets</span>
            </div>
            <p className="text-sm text-surface-400 leading-relaxed max-w-xs">
              Privacy-preserving prediction market built on Aleo. Predict freely, bet privately.
            </p>
            <div className="flex items-center gap-3 mt-6">
              {[
                { icon: Twitter, label: 'Twitter', href: '#' },
                { icon: Github, label: 'GitHub', href: '#' },
                { icon: MessageCircle, label: 'Discord', href: '#' },
                { icon: Globe, label: 'Blog', href: '#' },
              ].map(({ icon: Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/[0.04] flex items-center justify-center text-surface-500 hover:text-white hover:bg-white/[0.06] transition-all duration-200"
                  aria-label={label}
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          {[
            {
              title: 'Protocol',
              links: ['Markets', 'Governance', 'Treasury', 'Docs', 'Audits'],
            },
            {
              title: 'Resources',
              links: ['How It Works', 'FAQ', 'API Docs', 'Brand Kit', 'Bug Bounty'],
            },
            {
              title: 'Company',
              links: ['About', 'Blog', 'Careers', 'Press', 'Contact'],
            },
            {
              title: 'Legal',
              links: ['Terms of Service', 'Privacy Policy', 'Risk Disclosure', 'Cookies'],
            },
          ].map((section) => (
            <div key={section.title}>
              <h4 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-4">
                {section.title}
              </h4>
              <ul className="space-y-2.5">
                {section.links.map((link) => {
                  const route = footerRoutes[link]
                  return (
                    <li key={link}>
                      {route ? (
                        <Link
                          to={route}
                          className="text-sm text-surface-500 hover:text-white transition-colors duration-200 flex items-center gap-1 group"
                        >
                          {link}
                          <ArrowUpRight className="w-3 h-3 opacity-0 -translate-y-0.5 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200" />
                        </Link>
                      ) : (
                        <a
                          href="#"
                          className="text-sm text-surface-500 hover:text-white transition-colors duration-200 flex items-center gap-1 group"
                        >
                          {link}
                          <ArrowUpRight className="w-3 h-3 opacity-0 -translate-y-0.5 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200" />
                        </a>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-16 pt-8 border-t border-white/[0.04]">
          <p className="text-xs text-surface-600">
            © 2026 Veiled Markets. Built on Aleo.
          </p>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-yes-400 animate-pulse" />
              <span className="text-xs text-surface-500">All systems operational</span>
            </div>
            <span className="text-xs text-surface-600">Testnet</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
