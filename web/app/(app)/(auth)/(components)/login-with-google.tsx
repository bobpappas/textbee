'use client'

import { Routes } from '@/config/routes'
import { toast } from '@/hooks/use-toast'
import {
  CredentialResponse,
  GoogleLogin,
  GoogleOAuthProvider,
} from '@react-oauth/google'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { useTheme } from 'next-themes'

// The provider lives here rather than in the app-wide tree so the Google
// Identity SDK is only loaded on the two pages that render this button
// (login and register) instead of on every dashboard page.
export default function LoginWithGoogle() {
  return (
    <GoogleOAuthProvider
      clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''}
    >
      <GoogleLoginButton />
    </GoogleOAuthProvider>
  )
}

function GoogleLoginButton() {
  const { resolvedTheme } = useTheme()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect')

  const onGoogleLoginSuccess = async (
    credentialResponse: CredentialResponse,
  ) => {
    if (!credentialResponse.credential) return onGoogleLoginError()
    await signIn('google-approved-login', {
      redirect: true,
      callbackUrl: redirect ? decodeURIComponent(redirect) : Routes.dashboard,
      idToken: credentialResponse.credential,
    })
  }

  const onGoogleLoginError = () => {
    toast({
      title: 'Error',
      description: 'Something went wrong',
      variant: 'destructive',
    })
  }
  return (
    <GoogleLogin
      onSuccess={onGoogleLoginSuccess}
      onError={onGoogleLoginError}
      useOneTap={false}
      size="large"
      shape="pill"
      locale="en"
      theme={resolvedTheme === 'dark' ? 'filled_black' : 'outline'}
      // Match the Google iframe's light canvas scheme so it stays transparent
      // around the button, even when the surrounding page uses dark mode.
      containerProps={{ style: { colorScheme: 'light' } }}
      text="continue_with"
    />
  )
}
