import * as contactFormService from '../services/contactForm.service.js';

const REQUIRED_FIELDS = ['name', 'email', 'phone', 'callVolume', 'helpWith', 'useCase'];

const validateContactForm = (body) => {
  for (const field of REQUIRED_FIELDS) {
    if (!body[field] || !String(body[field]).trim()) {
      throw Object.assign(new Error(`${field} is required`), { statusCode: 400 });
    }
  }

  // Basic email format check
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(body.email)) {
    throw Object.assign(new Error('Invalid email address'), { statusCode: 400 });
  }
};

export const submitContactForm = async (req, res) => {
  try {
    validateContactForm(req.body);
    const submission = await contactFormService.createContactSubmission(req.body);
    res.status(201).json({ success: true, id: submission.id });
  } catch (err) {
    const status = err.statusCode || 500;
    const message = status < 500 ? err.message : 'Internal server error. Please try again later.';
    console.error('[contactForm] submitContactForm error:', err);
    res.status(status).json({ error: message });
  }
};

export const listContactForms = async (_req, res) => {
  try {
    const submissions = await contactFormService.listContactSubmissions();
    res.json(submissions);
  } catch (err) {
    console.error('[contactForm] listContactForms error:', err);
    res.status(500).json({ error: 'Failed to fetch contact submissions' });
  }
};
