/* DOHPass mark: a medical cross cut out of a brass tile. Same geometry as
   public/favicon.svg so the tab icon and the in-page logo match. */
export default function BrandMark({ size = 28, className = '' }) {
  return (
    <svg
      className={`brand-mark ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="8" fill="var(--brass-500, #C9A84C)" />
      <path
        d="M13.5 6.5h5a1 1 0 0 1 1 1v5h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h5v-5a1 1 0 0 1 1-1z"
        fill="var(--ink-950, #0F1215)"
      />
    </svg>
  )
}
