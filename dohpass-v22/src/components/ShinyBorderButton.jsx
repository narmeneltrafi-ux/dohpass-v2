// Gold conic-gradient border that spins continuously around a solid gold pill.
// Used as the primary CTA on the marketing pages. Disabled state mutes the
// spinner and the inner gradient so the same shape can read as "intentionally
// not yet available" without looking broken.
export default function ShinyBorderButton({
  children,
  onClick,
  className = '',
  disabled = false,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`lp-shiny${disabled ? ' lp-shiny--disabled' : ''} ${className}`}
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      {...props}
    >
      <span className="lp-shiny__inner">{children}</span>
    </button>
  )
}
