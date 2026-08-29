import CredentialsProvider from 'next-auth/providers/credentials'
import { httpServerClient } from './httpServerClient'
import type { DefaultSession, NextAuthOptions } from 'next-auth'
import { ApiEndpoints } from '@/config/api'
import { Routes } from '@/config/routes'

// add custom fields to the session and user interfaces
declare module 'next-auth' {
  interface Session {
    user: {
      id?: string
      role?: string
      phone?: string
      avatar?: string
      accessToken?: string
    } & DefaultSession['user']
  }

  interface User {
    // The backend returns Mongo documents, so the id arrives as _id and is
    // copied onto the token below.
    _id?: string
    role?: string
    phone?: string
    avatar?: string
    accessToken?: string
  }
}

// The jwt/session callbacks read and write these, so the token has to declare
// them or every callback parameter falls back to an implicit any.
declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    role?: string
    phone?: string
    avatar?: string
    accessToken?: string
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: 'google-approved-login',
      name: 'google-approved-login',
      credentials: {
        idToken: { label: 'idToken', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials) return null
        const { idToken } = credentials
        try {
          const res = await httpServerClient.post(
            ApiEndpoints.auth.oauthLogin(),
            {
              provider: 'google',
              idToken,
            },
          )

          const user = res.data.data.user
          const accessToken = res.data.data.accessToken

          return {
            ...user,
            accessToken,
          }
        } catch {
          return null
        }
      },
    }),
  ],
  pages: {
    signIn: Routes.login,
  },
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (trigger === 'update') {
        if (session.name !== token.name) {
          token.name = session.name
        }
        if (session.phone !== token.phone) {
          token.phone = session.phone
        }
        return token
      }

      if (user) {
        token.id = user._id
        token.role = user.role
        token.accessToken = user.accessToken
        token.avatar = user.avatar
        token.phone = user.phone
      }
      return token
    },
    async session({ session, token }): Promise<any> {
      session.user.id = token.id
      session.user.role = token.role
      session.user.accessToken = token.accessToken
      session.user.avatar = token.avatar
      session.user.phone = token.phone
      return session
    },
  },
}
