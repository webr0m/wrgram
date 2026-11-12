/** Same foreground paths and colors as Android's adaptive launcher icon. */
export function Brand({ className = 'brand' }: { className?: string }) {
  return <span className={className} aria-hidden="true"><svg viewBox="44 44 112 100" focusable="false">
    <path fill="#F0C65C" d="M56,70h17l11,35 12,-25h12l10,24 10,-34h17L126,126H112L101,101 89,126H75L56,70Z"/>
    <path fill="#FFE9AF" d="m106,65 4,-10 4,10 10,4 -10,4 -4,10 -4,-10 -10,-4 10,-4Z"/>
  </svg></span>;
}
