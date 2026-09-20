/** Local server-operator password recovery. Never expose this as an HTTP endpoint. */
import { getStore } from '../src/store';
import { passwordHash } from '../src/security';
const email = process.env.REPRO_RESET_EMAIL?.toLowerCase(), password = process.env.REPRO_RESET_PASSWORD;
if (!email || !password || password.length < 12 || password.length > 128)
    throw new Error('Set REPRO_RESET_EMAIL and REPRO_RESET_PASSWORD (12–128 chars).');
const store = await getStore();
const user = await store.users.findOne({ email }, { projection: { id: 1 } });
if (!user)
    throw new Error('Account not found.');
await Promise.all([
    store.users.updateOne({ id: user.id }, { $set: { password: passwordHash(password) } }),
    store.authSessions.deleteMany({ user_id: user.id })
]);
console.log('Password reset. Existing sessions revoked.');
