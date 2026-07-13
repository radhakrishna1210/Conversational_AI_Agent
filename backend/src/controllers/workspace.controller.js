import * as workspaceService from '../services/workspace.service.js';

export const getWorkspace = async (req, res) => {
  res.json(req.workspace);
};

export const updateWorkspace = async (req, res) => {
  const workspace = await workspaceService.updateWorkspace(req.params.workspaceId, req.body);
  res.json(workspace);
};

export const listMembers = async (req, res) => {
  const members = await workspaceService.listMembers(req.params.workspaceId);
  res.json(members);
};

export const inviteMember = async (req, res) => {
  const { email, role } = req.body;
  const invite = await workspaceService.createInvite(req.params.workspaceId, email, role);
  res.status(201).json(invite);
};

export const updateMemberRole = async (req, res) => {
  const member = await workspaceService.updateMemberRole(
    req.params.workspaceId, req.params.userId, req.body.role
  );
  res.json(member);
};

export const removeMember = async (req, res) => {
  await workspaceService.removeMember(req.params.workspaceId, req.params.userId);
  res.json({ message: 'Member removed' });
};
