import { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import { Loader2 } from 'lucide-react';

interface InputModalProps {
  title: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  submitText?: string;
  maxLength?: number;
  restrictPattern?: RegExp;
  onSubmit: (value: string) => void | Promise<void>;
  onCancel: () => void;
}

export default function InputModal({
  title,
  label,
  placeholder = '',
  defaultValue = '',
  submitText = 'Create',
  maxLength,
  restrictPattern,
  onSubmit,
  onCancel,
}: InputModalProps) {
  const [value, setValue] = useState(defaultValue);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus with slight delay for animation
    const timer = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(timer);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (restrictPattern) {
      val = val.replace(restrictPattern, '');
    }
    setValue(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      setIsSubmitting(true);
      try {
        await onSubmit(value.trim());
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <Modal onClose={onCancel}>
      <form onSubmit={handleSubmit}>
        <h3 style={styles.title}>{title}</h3>
        {label && <p style={styles.label}>{label}</p>}
        <input
          ref={inputRef}
          type="text"
          value={value}
          maxLength={maxLength}
          onChange={handleChange}
          placeholder={placeholder}
          style={styles.input}
          id="modal-input"
          disabled={isSubmitting}
        />
        <div style={styles.actions}>
          <button type="button" onClick={onCancel} style={styles.cancelBtn} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" disabled={!value.trim() || isSubmitting} style={{
            ...styles.submitBtn,
            opacity: (!value.trim() || isSubmitting) ? 0.5 : 1,
            cursor: isSubmitting ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            {isSubmitting ? (
              <>
                <Loader2 size={14} className="spin" />
                Creating...
              </>
            ) : submitText}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: {
    margin: '0 0 4px 0',
    fontSize: '17px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    letterSpacing: '-0.3px',
  },
  label: {
    margin: '0 0 16px 0',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    fontSize: '14px',
    fontFamily: 'var(--font-sans)',
    border: '1px solid rgba(0, 0, 0, 0.12)',
    borderRadius: '10px',
    outline: 'none',
    background: 'rgba(0, 0, 0, 0.03)',
    color: 'var(--color-text-primary)',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '20px',
  },
  cancelBtn: {
    padding: '8px 18px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    borderRadius: '10px',
    border: '1px solid rgba(0, 0, 0, 0.1)',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  submitBtn: {
    padding: '8px 22px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    borderRadius: '10px',
    border: 'none',
    background: 'var(--color-accent)',
    color: '#FFF',
    cursor: 'pointer',
    transition: 'opacity 0.15s, transform 0.1s',
  },
};
