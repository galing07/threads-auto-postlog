import React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cx } from '@/lib/utils'

interface CardProps extends React.ComponentPropsWithoutRef<'div'> {
  asChild?: boolean
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, asChild, style, ...props }, ref) => {
    const Component = asChild ? Slot : 'div'
    return (
      <Component
        ref={ref}
        className={cx('relative w-full rounded-lg bg-white p-5 text-left', className)}
        style={{
          border: '1px solid #e5edf5',
          boxShadow: 'rgba(50,50,93,0.08) 0px 8px 20px -8px, rgba(0,0,0,0.05) 0px 5px 10px -5px',
          ...style,
        }}
        {...props}
      />
    )
  },
)
Card.displayName = 'Card'

export { Card, type CardProps }
