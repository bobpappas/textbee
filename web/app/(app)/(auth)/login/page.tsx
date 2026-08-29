'use client'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import LoginWithGoogle from '../(components)/login-with-google'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-muted">
      <Card className="w-full max-w-[400px] shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-center text-2xl font-bold">
            Welcome back
          </CardTitle>
          <CardDescription className="text-center">
            Sign in with an administrator-approved Google account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center">
            <LoginWithGoogle />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
