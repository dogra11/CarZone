/**
 * components/FormModal.jsx - A modal form generated from a field list. Used for every
 * admin create/edit screen and the customer's vehicle/address forms, so all of them share
 * the same validation (shared schemas), error display and loading behaviour.
 *
 *   <FormModal title="Edit add-on" fields={[{ name, label, type, options, span }]}
 *              initial={values} schema={schemas.adminAddon} onSubmit={async (data) => ...} onClose={...} />
 */
import { useForm } from '../hooks/useForm.js';
import Modal from './Modal.jsx';
import FormField from './FormField.jsx';

export default function FormModal({ title, fields, initial = {}, schema, onSubmit, onClose, submitText = 'Save', size = '', transform, intro }) {
  const form = useForm(schema, initial);
  const submit = form.handleSubmit(async (data) => { await onSubmit(data); onClose(); }, { transform });

  return (
    <Modal title={title} size={size} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
        <button className={`btn btn-primary ${form.submitting ? 'is-loading' : ''}`} type="submit" form="form-modal" disabled={form.submitting}>{submitText}</button>
      </>}>
      <form id="form-modal" onSubmit={submit} noValidate>
        {intro}
        <div className="form-grid">
          {fields.map((f) => {
            if (f.type === 'checkboxes') {
              const selected = (form.values[f.name] || []).map(String);
              const toggle = (v) => form.setValue(f.name, selected.includes(String(v)) ? selected.filter((x) => x !== String(v)) : [...selected, String(v)]);
              return (
                <FormField key={f.name} label={f.label} span={2} error={form.errors[f.name]} hint={f.hint}>
                  <div className="chips">{f.options.map((o) => (
                    <label key={o.value} className={`chip ${selected.includes(String(o.value)) ? 'active' : ''}`}>
                      <input type="checkbox" className="sr-only" checked={selected.includes(String(o.value))} onChange={() => toggle(o.value)} /> {o.label}
                    </label>))}
                  </div>
                </FormField>
              );
            }
            return <FormField key={f.name} label={f.label} type={f.type} options={f.options} span={f.span} hint={f.hint}
              placeholder={f.placeholder} min={f.min} max={f.max} step={f.step} rows={f.rows} switchText={f.text} {...form.field(f.name)} />;
          })}
        </div>
      </form>
    </Modal>
  );
}
