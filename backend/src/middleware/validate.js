/**
 * Zod validation middleware factory.
 * Usage: validate(MyZodSchema) or validate(MyZodSchema, 'params')
 */
export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    return next(result.error);
  }
  req[source] = result.data;
  next();
};
