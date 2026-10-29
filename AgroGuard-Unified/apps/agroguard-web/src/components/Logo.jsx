// The tile stays white in both themes (set inline so the dark mode rules for bg-white do not
// reach it) because the logo's dark green A would disappear on a dark background.
export default function Logo({ className = 'h-12 w-12', rounded = 'rounded-2xl' }) {
  return (
    <span
      className={`grid shrink-0 place-items-center p-1 shadow-sm ring-1 ring-black/5 ${rounded} ${className}`}
      style={{ backgroundColor: '#ffffff' }}
    >
      <img src="/logo.png" alt="" aria-hidden="true" className="h-full w-full object-contain" draggable="false" />
    </span>
  )
}
