import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../constants/limits.js';

export const getPaginationArgs = (query) => {
  const limit = Math.min(parseInt(query.limit ?? String(DEFAULT_PAGE_LIMIT), 10), MAX_PAGE_LIMIT);
  const cursor = query.cursor;
  const page = parseInt(query.page ?? '1', 10);

  if (cursor) {
    return { take: limit, skip: 1, cursor: { id: cursor } };
  }

  return { take: limit, skip: (page - 1) * limit };
};

export const paginatedResponse = (data, total, limit, page) => ({
  data,
  meta: {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNext: page * limit < total,
  },
});
