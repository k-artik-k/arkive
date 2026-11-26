import { useMemo } from 'react';
import { toSvg } from 'jdenticon';

export default function Identicon({ value, size = 32, className = '' }) {
  const svgMarkup = useMemo(
    () => toSvg(value || 'default', size),
    [value, size]
  );

  return (
    <div
      className={`arkive-identicon ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
    />
  );
}
