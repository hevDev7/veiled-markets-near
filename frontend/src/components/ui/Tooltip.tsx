import * as TooltipPrimitive from '@radix-ui/react-tooltip'

interface TooltipProps {
  children: React.ReactNode
  content: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  delayDuration?: number
}

export function Tooltip({ children, content, side = 'top', delayDuration = 300 }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          {children}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content className="tooltip-content" sideOffset={6} side={side}>
            {content}
            <TooltipPrimitive.Arrow className="fill-surface-800" width={10} height={5} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
