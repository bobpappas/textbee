import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-6 sm:px-6 lg:px-8">
        <Image src="/images/logo.png" alt="TextBee logo" width={20} height={20} className="h-5 w-5 shrink-0 rounded-full bg-white" />
        <span className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} Bob Pappas · Built with TextBee
        </span>
      </div>
    </footer>
  )
}
