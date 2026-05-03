// Tremor Select [v1.0.0] — simplified native wrapper
import React from 'react'
import { cx, focusInput } from '@/lib/utils'

interface SelectNativeProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean
}

const SelectNative = React.forwardRef<HTMLSelectElement, SelectNativeProps>(
  ({ className, hasError, ...props }, ref) => (
    <select
      ref={ref}
      className={cx(
        'w-full appearance-none rounded-md border px-3 py-2 shadow-xs outline-hidden transition sm:text-sm',
        'border-gray-300 dark:border-gray-800',
        'text-gray-900 dark:text-gray-50',
        'bg-white dark:bg-gray-950',
        'disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-400',
        focusInput,
        className,
      )}
      {...props}
    />
  ),
)
SelectNative.displayName = 'SelectNative'

export { SelectNative, type SelectNativeProps }
