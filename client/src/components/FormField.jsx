/**
 * components/FormField.jsx - Label + input + validation message in one component.
 *   <FormField label="Email" type="email" {...form.field('email')} />
 * Supports text-like inputs, textarea, select (options=[{value,label}]) and switch.
 * The error text comes from the shared validation rules (or the server).
 */
import { useId } from 'react';

export default function FormField({ label, type = 'text', error, hint, options, className = '', span, children, switchText, ...input }) {
  const id = useId();
  let control;
  if (type === 'textarea') control = <textarea id={id} className="textarea" {...input} />;
  else if (type === 'select') {
    control = (
      <select id={id} className="select" {...input}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  } else if (type === 'switch') {
    const { value, ...rest } = input;
    control = (
      <label className="switch"><input type="checkbox" checked={Boolean(value)} {...rest} /><span className="track" /><span className="text-small">{switchText}</span></label>
    );
  } else control = <input id={id} className="input" type={type} {...input} />;

  return (
    <div className={`field ${span === 2 ? 'span-2' : ''} ${error ? 'has-error' : ''} ${className}`.trim()}>
      {label && <label htmlFor={id}>{label}</label>}
      {children || control}
      {hint && <span className="hint">{hint}</span>}
      {error && <div className="field-error" role="alert">{error}</div>}
    </div>
  );
}
