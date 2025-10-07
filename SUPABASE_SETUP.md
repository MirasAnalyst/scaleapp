# Supabase Authentication Setup

This Next.js app now includes Supabase authentication with email/password login. Here's how to set it up:

## 1. Create a Supabase Project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Create a new project or select an existing one
3. Wait for the project to be ready

## 2. Get Your Supabase Credentials

1. In your Supabase dashboard, go to **Settings > API**
2. Copy the following values:
   - **Project URL** (e.g., `https://your-project-id.supabase.co`)
   - **anon/public key** (starts with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)

## 3. Set Up Environment Variables

Create a `.env.local` file in your project root with:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
```

## 4. Configure Authentication in Supabase

1. In your Supabase dashboard, go to **Authentication > Settings**
2. Make sure **Enable email confirmations** is turned ON
3. Configure your **Site URL** to `http://localhost:3000` for development
4. Add `http://localhost:3000/auth/callback` to **Redirect URLs**

## 5. Test the Authentication

1. Start your development server: `npm run dev`
2. Visit `http://localhost:3000`
3. Click "Sign up" to create a new account
4. Check your email for the confirmation link
5. Click the confirmation link to activate your account
6. Sign in with your credentials

## How It Works

- **Public Routes**: Home page (`/`) is accessible without login
- **Protected Routes**: All other pages require authentication
- **Automatic Redirects**: 
  - Unauthenticated users are redirected to `/login`
  - Authenticated users trying to access `/login` or `/signup` are redirected to `/`

## Features Included

- ✅ Email/password authentication
- ✅ Email confirmation
- ✅ Protected routes with middleware
- ✅ Automatic session management
- ✅ Sign out functionality
- ✅ Responsive login/signup forms
- ✅ Error handling and validation

## File Structure

```
lib/supabase/
├── client.ts          # Browser client
└── server.ts          # Server client

app/
├── login/page.tsx     # Login page
├── signup/page.tsx    # Signup page
└── auth/
    ├── callback/route.ts        # Email confirmation handler
    └── auth-code-error/page.tsx # Error page

middleware.ts          # Route protection
components/AuthButton.tsx # Auth UI component
```

## Troubleshooting

- **"Invalid login credentials"**: Make sure you've confirmed your email
- **Redirect loops**: Check your Site URL and Redirect URLs in Supabase settings
- **Environment variables not working**: Make sure `.env.local` is in the project root and restart your dev server

