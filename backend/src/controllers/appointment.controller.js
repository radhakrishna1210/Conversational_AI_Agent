import * as appointmentService from '../services/appointment.service.js';

const REQUIRED = ['name', 'email', 'phone', 'projectType', 'role', 'reason', 'callVolume', 'userType', 'industry', 'useCase'];

const validate = (body) => {
  for (const field of REQUIRED) {
    if (!body[field] || !String(body[field]).trim()) {
      throw Object.assign(new Error(`${field} is required`), { statusCode: 400 });
    }
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(body.email)) {
    throw Object.assign(new Error('Invalid email address'), { statusCode: 400 });
  }
};

export const submitAppointment = async (req, res) => {
  validate(req.body);
  const booking = await appointmentService.createAppointment(req.body);
  res.status(201).json({ success: true, id: booking.id });
};

export const listAppointments = async (_req, res) => {
  const bookings = await appointmentService.listAppointments();
  res.json(bookings);
};
