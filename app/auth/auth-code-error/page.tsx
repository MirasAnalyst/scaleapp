import Link from 'next/link'

export default function AuthCodeError() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900 dark:text-white">
            Authentication Error
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            There was an error with your authentication. This could be due to:
          </p>
          <ul className="mt-4 text-sm text-gray-600 dark:text-gray-400 text-left">
            <li>• The confirmation link has expired</li>
            <li>• The link has already been used</li>
            <li>• The link is invalid</li>
          </ul>
          <div className="mt-6">
            <Link
              href="/signup"
              className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
            >
              Try signing up again
            </Link>
            <span className="mx-2 text-gray-400">or</span>
            <Link
              href="/login"
              className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

