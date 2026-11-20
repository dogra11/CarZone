/** hooks/useCopy.js - Copies a coupon code to the clipboard and shows a toast. */
import { useToast } from '../components/Toast.jsx';

export function useCopy() {
  const toast = useToast();
  return async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast.success(`Code ${text} copied. Paste it at checkout.`, 'Copied');
  };
}
