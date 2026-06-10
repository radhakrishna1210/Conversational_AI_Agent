import { FormEvent, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export type ContactFormData = {
  name: string;
  email: string;
  phone: string;
  monthlyCallVolume: string;
  helpTopic: string;
  useCase: string;
  referralSource: string;
};

type FormField = keyof ContactFormData;
type FormErrors = Partial<Record<FormField | 'submit', string>>;
type TouchedFields = Partial<Record<FormField, boolean>>;

const initialForm: ContactFormData = {
  name: '',
  email: '',
  phone: '',
  monthlyCallVolume: '',
  helpTopic: '',
  useCase: '',
  referralSource: '',
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COUNTRY_CODES = [
  { flag: '🇺🇸', code: '+1', label: '🇺🇸 +1' },
  { flag: '🇬🇧', code: '+44', label: '🇬🇧 +44' },
  { flag: '🇮🇳', code: '+91', label: '🇮🇳 +91' },
  { flag: '🇦🇺', code: '+61', label: '🇦🇺 +61' },
  { flag: '🇩🇪', code: '+49', label: '🇩🇪 +49' },
  { flag: '🇫🇷', code: '+33', label: '🇫🇷 +33' },
];

const REQUIRED_FIELDS: FormField[] = [
  'name',
  'email',
  'phone',
  'monthlyCallVolume',
  'helpTopic',
  'useCase',
];

function RequiredMark() {
  return <span className="contact-required">*</span>;
}

export default function ContactForm() {
  const [form, setForm] = useState<ContactFormData>(initialForm);
  const [countryCode, setCountryCode] = useState('+1');
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<TouchedFields>({});
  const [invalidFields, setInvalidFields] = useState<Set<FormField>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (field: FormField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, submit: undefined }));
    setInvalidFields((current) => {
      const next = new Set(current);
      next.delete(field);
      return next;
    });
  };

  const handlePhoneChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '');
    updateField('phone', digitsOnly);
  };

  const validateEmail = (email: string) => {
    if (!email.trim()) return 'Email is required.';
    if (!emailPattern.test(email.trim())) return 'Enter a valid email address.';
    return undefined;
  };

  const validateField = (field: FormField, value: string): string | undefined => {
    if (field === 'email') return validateEmail(value);
    if (REQUIRED_FIELDS.includes(field) && !value.trim()) {
      const labels: Record<FormField, string> = {
        name: 'Name',
        email: 'Email',
        phone: 'Phone number',
        monthlyCallVolume: 'Monthly call volume',
        helpTopic: 'Topic',
        useCase: 'Use case',
        referralSource: 'Referral source',
      };
      return `${labels[field]} is required.`;
    }
    return undefined;
  };

  const validateAll = () => {
    const nextErrors: FormErrors = {};
    const nextInvalid = new Set<FormField>();

    for (const field of REQUIRED_FIELDS) {
      const error = validateField(field, form[field]);
      if (error) {
        nextErrors[field] = error;
        nextInvalid.add(field);
      }
    }

    return { nextErrors, nextInvalid };
  };

  const handleBlur = (field: FormField) => {
    setTouched((current) => ({ ...current, [field]: true }));
    if (field === 'email') {
      const error = validateEmail(form.email);
      setErrors((current) => ({ ...current, email: error }));
      if (error) {
        setInvalidFields((current) => new Set(current).add('email'));
      }
    }
  };

  const fieldClass = (field: FormField) =>
    invalidFields.has(field) ? 'contact-input contact-input-error' : 'contact-input';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { nextErrors, nextInvalid } = validateAll();

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setInvalidFields(nextInvalid);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    const fullPhone = `${countryCode}${form.phone}`;

    try {
      const response = await fetch('/api/v1/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          phone: fullPhone,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Unable to submit your request right now.');
      }

      setForm(initialForm);
      setCountryCode('+1');
      setTouched({});
      setInvalidFields(new Set());
      toast.success("Request submitted! We'll be in touch within 24 hours.", {
        style: {
          background: '#12171f',
          border: '1px solid #00c2c2',
          color: '#ffffff',
        },
      });
    } catch (error) {
      setErrors({
        submit: error instanceof Error ? error.message : 'Unable to submit your request right now.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="contact-form-card" aria-label="Contact form">
      <form className="contact-form" onSubmit={handleSubmit} noValidate>
        <div className="contact-form-grid">
          <label className="contact-label">
            Name <RequiredMark />
            <input
              type="text"
              className={fieldClass('name')}
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="John Smith"
              autoComplete="name"
            />
            {errors.name && <em className="contact-field-error">{errors.name}</em>}
          </label>

          <label className="contact-label">
            Email <RequiredMark />
            <input
              type="email"
              className={fieldClass('email')}
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              onBlur={() => handleBlur('email')}
              placeholder="john@company.com"
              autoComplete="email"
            />
            {touched.email && errors.email && (
              <em className="contact-field-error">{errors.email}</em>
            )}
          </label>

          <label className="contact-label">
            Phone Number <RequiredMark />
            <div className={`contact-phone-group ${invalidFields.has('phone') ? 'contact-input-error' : ''}`}>
              <select
                className="contact-country-select"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                aria-label="Country code"
              >
                {COUNTRY_CODES.map(({ code, label }) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                className="contact-phone-input"
                value={form.phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="555 014 5678"
                autoComplete="tel-national"
                inputMode="numeric"
              />
            </div>
            {errors.phone && <em className="contact-field-error">{errors.phone}</em>}
          </label>

          <label className="contact-label">
            Monthly Call Volume <RequiredMark />
            <select
              className={fieldClass('monthlyCallVolume')}
              value={form.monthlyCallVolume}
              onChange={(e) => updateField('monthlyCallVolume', e.target.value)}
            >
              <option value="" disabled>
                Select volume
              </option>
              <option value="< 1,000">&lt; 1,000</option>
              <option value="1,000–10,000">1,000–10,000</option>
              <option value="10,000–50,000">10,000–50,000</option>
              <option value="50,000+">50,000+</option>
            </select>
            {errors.monthlyCallVolume && (
              <em className="contact-field-error">{errors.monthlyCallVolume}</em>
            )}
          </label>

          <label className="contact-label contact-label-full">
            What can we help you with? <RequiredMark />
            <select
              className={fieldClass('helpTopic')}
              value={form.helpTopic}
              onChange={(e) => updateField('helpTopic', e.target.value)}
            >
              <option value="" disabled>
                Select a topic
              </option>
              <option value="General inquiry">General inquiry</option>
              <option value="Enterprise pricing">Enterprise pricing</option>
              <option value="Technical support">Technical support</option>
              <option value="Partnership">Partnership</option>
            </select>
            {errors.helpTopic && <em className="contact-field-error">{errors.helpTopic}</em>}
          </label>

          <label className="contact-label contact-label-full">
            Describe your use case <RequiredMark />
            <textarea
              className={fieldClass('useCase')}
              value={form.useCase}
              onChange={(e) => updateField('useCase', e.target.value)}
              placeholder="I need a WhatsApp AI Agent for customer support..."
              rows={5}
            />
            {errors.useCase && <em className="contact-field-error">{errors.useCase}</em>}
          </label>

          <label className="contact-label contact-label-full">
            How did you hear about us? <span className="contact-optional">(optional)</span>
            <select
              className="contact-input"
              value={form.referralSource}
              onChange={(e) => updateField('referralSource', e.target.value)}
            >
              <option value="">Select an option</option>
              <option value="Google Search">Google Search</option>
              <option value="LinkedIn">LinkedIn</option>
              <option value="Twitter/X">Twitter/X</option>
              <option value="Referral">Referral</option>
              <option value="Product Hunt">Product Hunt</option>
              <option value="Other">Other</option>
            </select>
          </label>
        </div>

        {errors.submit && <p className="contact-submit-error">{errors.submit}</p>}

        <p className="contact-recaptcha">
          This site is protected by reCAPTCHA and the{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
            Google Privacy Policy
          </a>{' '}
          and{' '}
          <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer">
            Terms of Service
          </a>{' '}
          apply.
        </p>

        <hr className="contact-divider" />

        <button className="contact-submit-btn" type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              Submitting...
            </>
          ) : (
            'Submit request'
          )}
        </button>
      </form>
    </section>
  );
}
