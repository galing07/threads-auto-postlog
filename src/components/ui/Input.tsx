// Tremor Input [v2.0.0]
import React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cx, focusInput, hasErrorInput } from '@/lib/utils'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, hasError, type, ...props }, ref) => {
    const [typeState, setTypeState] = React.useState(type)
    const isPassword = type === 'password'

    return (
      <div className={cx('relative w-full', className)}>
        <input
          ref={ref}
          type={isPassword ? typeState : type}
          className={cx(
            'relative block w-full appearance-none rounded-md border px-2.5 py-2 shadow-xs outline-hidden transition sm:text-sm',
            'border-gray-300 dark:border-gray-800',
            'text-gray-900 dark:text-gray-50',
            'placeholder-gray-400 dark:placeholder-gray-500',
            'bg-white dark:bg-gray-950',
            'disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-400',
            focusInput,
            hasError ? hasErrorInput : '',
            isPassword ? 'pr-10' : '',
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            aria-label={typeState === 'password' ? 'パスワードを表示' : 'パスワードを隠す'}
            className="absolute bottom-0 right-0 flex h-full items-center px-3 text-gray-400 hover:text-gray-600"
            onClick={() => setTypeState(s => s === 'password' ? 'text' : 'password')}
          >
            {typeState === 'password' ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        )}
      </div>
    )
  },
)
Input.displayName = 'Input'

export { Input, type InputProps }
