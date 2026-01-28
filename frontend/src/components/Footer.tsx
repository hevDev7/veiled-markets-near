import { motion } from 'framer-motion'
import { Github, Twitter, MessageCircle, ExternalLink } from 'lucide-react'

const footerLinks = {
  Protocol: [
    { name: 'Markets', href: '#markets' },
    { name: 'Create Market', href: '#create' },
    { name: 'Portfolio', href: '#portfolio' },
    { name: 'Leaderboard', href: '#leaderboard' },
  ],
  Resources: [
    { name: 'Documentation', href: '#docs' },
    { name: 'Smart Contracts', href: '#contracts' },
    { name: 'Audit Reports', href: '#audits' },
    { name: 'Brand Kit', href: '#brand' },
  ],
  Community: [
    { name: 'Discord', href: '#discord' },
    { name: 'Twitter', href: '#twitter' },
    { name: 'Blog', href: '#blog' },
    { name: 'Governance', href: '#governance' },
  ],
  Legal: [
    { name: 'Terms of Service', href: '#terms' },
    { name: 'Privacy Policy', href: '#privacy' },
    { name: 'Cookie Policy', href: '#cookies' },
    { name: 'Disclaimers', href: '#disclaimers' },
  ],
}

const socialLinks = [
  { name: 'Twitter', icon: Twitter, href: '#' },
  { name: 'Discord', icon: MessageCircle, href: '#' },
  { name: 'GitHub', icon: Github, href: '#' },
]

export function Footer() {
  return (
    <footer className="relative border-t border-surface-800/30 py-12">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Veiled Markets"
              className="w-8 h-8 rounded-lg"
            />
            <div>
              <h3 className="font-display text-lg font-bold" style={{ letterSpacing: '0.02em' }}>
                <span className="gradient-text">Veiled</span>
                <span className="text-white"> Markets</span>
              </h3>
            </div>
          </div>
          <p className="text-sm text-surface-500 font-mono">
            © 2026 Veiled Markets • Built on Aleo • Open Source
          </p>
        </div>
      </div>
    </footer>
  )
}

// Keep the old footer as FooterDetailed for future use if needed
export function FooterDetailed() {
  return (
    <footer className="relative border-t border-surface-800/50">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-t from-surface-950 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Main Footer Content */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-12">
          {/* Brand Column */}
          <div className="col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="flex items-center gap-3 mb-4"
            >
              <img
                src="/logo.png"
                alt="Veiled Markets"
                className="w-10 h-10 rounded-xl"
              />
              <div>
                <h3 className="font-display text-xl font-bold" style={{ letterSpacing: '0.02em' }}>
                  <span className="gradient-text">Veiled</span>
                  <span className="text-white"> Markets</span>
                </h3>
              </div>
            </motion.div>
            <p className="text-surface-400 text-sm mb-6 max-w-xs">
              The first privacy-preserving prediction market. Built on Aleo with zero-knowledge proofs.
            </p>

            {/* Social Links */}
            <div className="flex gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  className="w-10 h-10 rounded-xl bg-surface-800/50 border border-surface-700/50 flex items-center justify-center text-surface-400 hover:text-white hover:border-brand-500/50 transition-all duration-200"
                  aria-label={social.name}
                >
                  <social.icon className="w-5 h-5" />
                </a>
              ))}
            </div>
          </div>

          {/* Link Columns */}
          {Object.entries(footerLinks).map(([category, links], index) => (
            <motion.div
              key={category}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <h4 className="font-semibold text-white mb-4">{category}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.name}>
                    <a
                      href={link.href}
                      className="text-sm text-surface-400 hover:text-white transition-colors"
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* Aleo Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 p-6 rounded-2xl bg-surface-900/50 border border-surface-800/50 mb-12"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#00D4AA]/20 flex items-center justify-center">
              <span className="text-[#00D4AA] font-bold text-sm">A</span>
            </div>
            <span className="text-surface-300">Powered by</span>
            <span className="font-semibold text-white">Aleo Blockchain</span>
          </div>
          <div className="h-px w-16 sm:h-6 sm:w-px bg-surface-700" />
          <a
            href="https://aleo.org"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-surface-400 hover:text-[#00D4AA] transition-colors"
          >
            <span>Learn about Aleo</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </motion.div>

        {/* Bottom Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-surface-800/50">
          <p className="text-sm text-surface-500">
            © 2026 Veiled Markets. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a href="#terms" className="text-sm text-surface-500 hover:text-surface-300 transition-colors">
              Terms
            </a>
            <a href="#privacy" className="text-sm text-surface-500 hover:text-surface-300 transition-colors">
              Privacy
            </a>
            <a href="#cookies" className="text-sm text-surface-500 hover:text-surface-300 transition-colors">
              Cookies
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

