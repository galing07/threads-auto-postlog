import React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { RiLoader2Fill } from '@remixicon/react'
import { tv, type VariantProps } from 'tailwind-variants'
import { cx, focusRing } from '@/lib/utils'

const buttonVariants = tv({
  base: [
    'relative inline-flex items-center justify-center whitespace-nowrap rounded-md border px-3 py-2 text-center text-sm font-medium shadow-xs transition-all duration-100 ease-in-out',
    'disabled:pointer-events-none disabled:shadow-none',
    focusRing,
  ],
  variants: {
    variant: {
      primary: [
        'border-transparent text-white',
        'bg-[#00A3BF] hover:bg-[#008CA8]',
        'disabled:bg-[#99F2FF] disabled:text-white',
      ],
      secondary: [
        'border-[#e5edf5] text-slate-700 bg-white',
        'hover:bg-[#F8FAFC] hover:border-[#c8d8e8]',
        'disabled:text-gray-400',
      ],
      light: [
        'shadow-none border-transparent',
        'text-slate-700 bg-[#E9F7F9]',
        'hover:bg-[#D5F0F4]',
        'disabled:bg-gray-100 disabled:text-gray-400',
      ],
      ghost: [
        'shadow-none border-transparent',
        'text-slate-700 bg-transparent',
        'hover:bg-[#F8FAFC]',
        'disabled:text-gray-400',
      ],
      destructive: [
        'text-white border-transparent',
        'bg-red-600 hover:bg-red-700',
        'disabled:bg-red-300 disabled:text-white',
      ],
    },
  },
  defaultVariants: { variant: 'primary' },
})

interface ButtonProps
  extends React.ComponentPropsWithoutRef<'button'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  isLoading?: boolean
  loadingText?: string
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild, isLoading = false, loadingText, className, disabled, variant, children, ...props }, ref) => {
    const Component = asChild ? Slot : 'button'
    return (
      <Component
        ref={ref}
        className={cx(buttonVariants({ variant }), className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <span className="pointer-events-none flex shrink-0 items-center justify-center gap-1.5">
            <RiLoader2Fill className="size-4 shrink-0 animate-spin" aria-hidden="true" />
            <span className="sr-only">{loadingText ?? 'Loading'}</span>
            {loadingText ?? children}
          </span>
        ) : children}
      </Component>
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants, type ButtonProps }
