import * as reportIssueService from '../services/reportIssue.service.js';

const validateReportIssue = (body) => {
  const REQUIRED = ['issueTitle', 'description'];
  for (const field of REQUIRED) {
    if (!body[field] || !String(body[field]).trim()) {
      throw Object.assign(new Error(`${field} is required`), { statusCode: 400 });
    }
  }
};

export const submitReportIssue = async (req, res) => {
  try {
    validateReportIssue(req.body);
    const issue = await reportIssueService.createReportIssue(req.body);
    res.status(201).json({ success: true, id: issue.id });
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json({ success: false, error: err.message });
  }
};

export const listReportIssues = async (_req, res) => {
  try {
    const issues = await reportIssueService.listReportIssues();
    res.json(issues);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
