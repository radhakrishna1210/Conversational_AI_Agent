import * as messageService from '../services/message.service.js';

export const listMessages = async (req, res) => {
  const messages = await messageService.listMessages(
    req.params.workspaceId, req.params.convId, req.query
  );
  res.json(messages);
};

export const sendMessage = async (req, res) => {
  const message = await messageService.createMessage(
    req.params.workspaceId,
    req.params.convId,
    { ...req.body, senderUserId: req.user.userId ?? null }
  );
  res.status(201).json(message);
};
