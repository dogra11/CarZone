/**
 * components/Img.jsx - <img> with an automatic FALLBACK.
 * If the file is missing or fails to load, onError swaps it for a branded SVG
 * placeholder (only once, so a broken fallback can never loop).
 */
export const FALLBACK = '/assets/images/fallback.svg';
export const AVATAR_FALLBACK = '/assets/images/avatar-fallback.svg';

export default function Img({ src, alt = '', fallback = FALLBACK, ...rest }) {
  const onError = (e) => {
    if (e.currentTarget.dataset.failed) return;
    e.currentTarget.dataset.failed = '1';
    e.currentTarget.src = fallback;
  };
  return <img src={src || fallback} alt={alt} onError={onError} {...rest} />;
}
