import { Routes } from '@/config/routes'
import Link from 'next/link'
import Image from 'next/image'

// A logged-in user is already converted, so the app footer stays a single slim
// bar rather than the marketing site's multi-column link farm. It borrows that
// footer's visual language (muted surface, muted-to-foreground link hovers,
// green status pill) so the two still read as one product.
const links = [
  { label: 'Quick start', href: Routes.quickstart },
  { label: 'Download app', href: Routes.downloadAndroidApp },
  { label: 'Contribute', href: Routes.contribute },
]

const linkClass =
  'text-sm text-muted-foreground transition-colors hover:text-foreground'

export default function Footer() {
  return (
    <footer className='border-t border-border bg-muted/30'>
      {/* Left-aligned on mobile: centred links in a single column read as a
          ragged stack with no common edge to scan down. */}
      <div className='mx-auto flex max-w-7xl flex-col items-start gap-4 px-4 py-6 sm:items-center sm:px-6 md:flex-row md:justify-between lg:px-8'>
        <div className='flex items-center gap-2'>
          <Image
            src='/images/logo.png'
            alt='textbee logo'
            width={20}
            height={20}
            className='h-5 w-5 rounded-full bg-white'
          />
          <span className='text-sm text-muted-foreground'>
            © {new Date().getFullYear()} textbee.dev
          </span>
        </div>

        {/* Stacked on mobile: wrapped inline links produced a ragged two-line
            block that was hard to scan and gave small tap targets. */}
        <nav
          aria-label='Footer'
          className='flex w-full flex-col items-start gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-5 sm:gap-y-2'
        >
          {links.map((link) => (
            <Link key={link.label} href={link.href} className={linkClass}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
