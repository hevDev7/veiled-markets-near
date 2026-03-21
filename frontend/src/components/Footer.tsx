import { Github, Twitter, MessageCircle, ExternalLink } from 'lucide-react'

const socialLinks = [
  { name: 'Twitter', icon: Twitter, href: '#' },
  { name: 'Discord', icon: MessageCircle, href: '#' },
  { name: 'GitHub', icon: Github, href: '#' },
]

export function Footer() {
  return (
    <footer className="relative py-10">
      {/* Divider */}
      <div className="divider mb-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo + Tagline */}
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Veiled Markets"
              className="h-8 w-8 object-cover rounded-lg"
            />
            <div>
              <h3 className="font-display text-sm font-bold tracking-tight">
                <span className="gradient-text">Veiled</span>
                <span className="text-white"> Markets</span>
              </h3>
              <p className="text-[10px] text-surface-500">Privacy-First Predictions</p>
            </div>
          </div>

          {/* Social Links */}
          <div className="flex items-center gap-2">
            {socialLinks.map((social) => (
              <a
                key={social.name}
                href={social.href}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-surface-500 hover:text-white transition-all duration-200"
                style={{ border: '1px solid rgba(48, 40, 71, 0.3)' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(124, 58, 237, 0.3)'; e.currentTarget.style.background = 'rgba(124, 58, 237, 0.06)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(48, 40, 71, 0.3)'; e.currentTarget.style.background = 'transparent' }}
                aria-label={social.name}
              >
                <social.icon className="w-4 h-4" />
              </a>
            ))}
          </div>

          {/* Copyright */}
          <p className="text-xs text-surface-500">
            © 2026 Veiled Markets · Built on{' '}
            <a
              href="https://aleo.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-surface-400 hover:text-accent-400 transition-colors inline-flex items-center gap-1"
            >
              Aleo <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}

// Detailed footer variant for future use
export function FooterDetailed() {
  return (
    <footer className="relative py-16">
      <div className="divider mb-16" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <img src="/logo.png" alt="Veiled Markets" className="h-9 w-9 object-cover rounded-xl" />
              <div>
                <h3 className="font-display text-lg font-bold tracking-tight">
                  <span className="gradient-text">Veiled</span>
                  <span className="text-white"> Markets</span>
                </h3>
              </div>
            </div>
            <p className="text-sm text-surface-400 mb-6 max-w-xs leading-relaxed">
              The first privacy-preserving prediction market. Built on Aleo with zero-knowledge proofs.
            </p>
            <div className="flex gap-2">
              {socialLinks.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-surface-500 hover:text-white transition-all duration-200"
                  style={{ border: '1px solid rgba(48, 40, 71, 0.3)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(124, 58, 237, 0.3)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(48, 40, 71, 0.3)' }}
                  aria-label={social.name}
                >
                  <social.icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          {[
            { title: 'Protocol', links: ['Markets', 'Create Market', 'Portfolio'] },
            { title: 'Resources', links: ['Documentation', 'Smart Contracts', 'Audit Reports'] },
            { title: 'Legal', links: ['Terms of Service', 'Privacy Policy'] },
          ].map((section) => (
            <div key={section.title}>
              <h4 className="text-sm font-semibold text-white mb-4">{section.title}</h4>
              <ul className="space-y-2.5">
                {section.links.map((link) => (
                  <li key={link}>
                    <a
                      href={`#${link.toLowerCase().replace(/\s+/g, '-')}`}
                      className="text-sm text-surface-400 hover:text-white transition-colors"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Aleo Badge */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 p-5 rounded-xl mb-12"
          style={{ background: 'rgba(14, 10, 31, 0.4)', border: '1px solid rgba(48, 40, 71, 0.4)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(0, 212, 170, 0.1)', border: '1px solid rgba(0, 212, 170, 0.15)' }}
            >
              <span className="text-[#00D4AA] font-bold text-sm">A</span>
            </div>
            <span className="text-surface-300 text-sm">Powered by</span>
            <span className="font-semibold text-white text-sm">Aleo</span>
          </div>
          <div className="h-px w-12 sm:h-5 sm:w-px bg-surface-700/50" />
          <a
            href="https://aleo.org"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-surface-400 hover:text-[#00D4AA] transition-colors"
          >
            Learn about Aleo <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8" style={{ borderTop: '1px solid rgba(48, 40, 71, 0.3)' }}>
          <p className="text-xs text-surface-500">© 2026 Veiled Markets. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <a href="#terms" className="text-xs text-surface-500 hover:text-surface-300 transition-colors">Terms</a>
            <a href="#privacy" className="text-xs text-surface-500 hover:text-surface-300 transition-colors">Privacy</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
