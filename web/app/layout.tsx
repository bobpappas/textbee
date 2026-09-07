import { PropsWithChildren } from 'react'
import '@/styles/main.css'
import { Metadata } from 'next'
import { Inter } from 'next/font/google'
import ThemeProvider from './theme-provider'
import { CANONICAL_SITE_ORIGIN } from '@/config/routes'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'textbee.dev - sms gateway - dashboard',

  metadataBase: new URL(CANONICAL_SITE_ORIGIN),
}

export default async function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang='en' suppressHydrationWarning className={inter.variable}>
      {/* No <main> here: the (app) layout renders its own, and nesting
          <main> inside <main> is invalid HTML. */}
      <body className='font-sans antialiased'>
        <ThemeProvider
          attribute='class'
          defaultTheme='system'
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
