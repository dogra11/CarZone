/** hooks/useDocumentTitle.js - Sets the browser tab title for the current page. */
import { useEffect } from 'react';

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} - CarZone` : 'CarZone - Premium Car Wash & Detailing in Pune';
  }, [title]);
}
