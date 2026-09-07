import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import DownloadPage from './page'

describe('DownloadPage', () => {
  it('does not fabricate an unreviewed APK download', () => {
    render(<DownloadPage />)

    expect(
      screen.getByRole('heading', { name: 'Administrator-provided APK' })
    ).toBeVisible()
    expect(
      screen.getByText(/No public APK is currently distributed from this page/)
    ).toBeVisible()
    expect(screen.queryByRole('link', { name: /download.*apk/i })).toBeNull()
  })
})
