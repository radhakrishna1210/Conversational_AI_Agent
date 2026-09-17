/**
 * One email address is one account, however the person signs in.
 *
 * Nothing normalised addresses before, and `User.email` is a case-sensitive
 * unique column: signing up as `Krishna@Gmail.com` and later pressing
 * "Continue with Google" (which reports `krishna@gmail.com`) missed the
 * existing row and created a second account with its own workspace.
 * Every address is trimmed and lower-cased before it is stored or looked up.
 */
export const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');
