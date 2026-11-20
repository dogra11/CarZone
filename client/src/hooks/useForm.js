/**
 * hooks/useForm.js - Form state + validation in one reusable hook.
 *
 *   const form = useForm(schemas.login, { email: '', password: '' });
 *   <FormField label="Email" {...form.field('email')} />
 *   <form onSubmit={form.handleSubmit(async (values) => api.post(...))}>
 *
 * - Values live in React state (controlled inputs).
 * - A field is validated when it loses focus, then live while it has an error.
 * - On submit the WHOLE form is validated with the shared schema (same rules as the
 *   server); server-side field errors (ApiError.fields) are shown the same way.
 */
import { useState } from 'react';
import { validate, validateField } from '../utils/shared.js';
import { useToast } from '../components/Toast.jsx';

export function useForm(schema, initialValues = {}) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const check = (name, value) => (schema?.[name] ? validateField(schema, name, value) : null);

  const setValue = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: check(name, value) }));
  };

  /** Props for <FormField>: value, onChange, onBlur, error. */
  const field = (name) => ({
    name,
    value: values[name] ?? '',
    error: errors[name],
    onChange: (e) => setValue(name, e.target.type === 'checkbox' ? e.target.checked : e.target.value),
    onBlur: () => setErrors((e) => ({ ...e, [name]: check(name, values[name]) })),
  });

  const handleSubmit = (onValid, { transform } = {}) => async (e) => {
    e?.preventDefault();
    const data = transform ? transform(values) : values;
    if (schema) {
      const result = validate(schema, data);
      if (!result.valid) {
        setErrors(result.errors);
        toast.warning('Please correct the highlighted fields.', 'Check your details');
        return;
      }
    }
    setErrors({});
    setSubmitting(true);
    try {
      await onValid(data);
    } catch (err) {
      if (err.fields) setErrors(err.fields);
      toast.error(err.message, err.fields ? 'Please check the form' : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return { values, setValues, setValue, errors, setErrors, field, handleSubmit, submitting, reset: () => setValues(initialValues) };
}
