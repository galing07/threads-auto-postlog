// Tremor Textarea [v1.0.0]
import React from 'react'
import { cx, focusInput, hasErrorInput } from '@/lib/utils'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, hasError, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cx(
        'flex min-h-[4rem] w-full rounded-md border px-3 py-1.5 shadow-xs outline-hidden transition-colors sm:text-sm',
        'text-gray-900 dark:text-gray-50',
        'border-gray-300 dark:border-gray-800',
        'bg-white dark:bg-gray-950',
        'placeholder-gray-400 dark:placeholder-gray-500',
        'disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-300',
        focusInput,
        hasError ? hasErrorInput : '',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'

export { Textarea, type TextareaProps }
