import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginWithGoogle from './login-with-google'

const { signIn } = vi.hoisted(() => ({ signIn: vi.fn() }))

vi.mock('next-auth/react', () => ({ signIn }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))
vi.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  GoogleLogin: ({ onSuccess }: { onSuccess: (value: unknown) => void }) => (
    <button onClick={() => onSuccess({ credential: 'opaque-id-token' })}>
      Continue with Google
    </button>
  ),
}))

describe('LoginWithGoogle', () => {
  beforeEach(() => signIn.mockReset())

  it('sends the ID token only through the approval-gated NextAuth provider', async () => {
    signIn.mockResolvedValue(undefined)
    render(<LoginWithGoogle />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with Google' }),
    )

    expect(signIn).toHaveBeenCalledWith(
      'google-approved-login',
      expect.objectContaining({
        idToken: 'opaque-id-token',
        redirect: true,
      }),
    )
  })
})
