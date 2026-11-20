/**
 * components/Icon.jsx - Renders an icon from the shared SVG sprite
 * (public/assets/icons/sprite.svg). Colour follows the text colour (currentColor).
 *   <Icon name="calendar" size="sm" />
 */
export default function Icon({ name, size = '', className = '' }) {
  const sizeClass = size ? `icon-${size}` : '';
  return (
    <svg className={`icon ${sizeClass} ${className}`.trim()} aria-hidden="true">
      <use href={`/assets/icons/sprite.svg#${name}`} />
    </svg>
  );
}
