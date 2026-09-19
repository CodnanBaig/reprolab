/** Local server-operator password recovery. Never expose this as an HTTP endpoint. */
import { Store } from '../src/store.ts';
import { passwordHash } from '../src/security.ts';
const email = process.env.REPRO_RESET_EMAIL?.toLowerCase(), password = process.env.REPRO_RESET_PASSWORD;
if (!email || !password || password.length < 12 || password.length > 128)
    throw new Error('Set REPRO_RESET_EMAIL and REPRO_RESET_PASSWORD (12–128 chars).');
const store = new Store(process.env.DATABASE_PATH ?? '.data/reprolab.sqlite');
try {
    const user = store.db.prepare('SELECT id FROM users WHERE email=?').get(email);
    if (!user)
        throw new Error('Account not found.');
    store.db.exec('BEGIN IMMEDIATE');
    store.db.prepare('UPDATE users SET password=? WHERE id=?').run(passwordHash(password), user.id);
    store.db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(user.id);
    store.db.exec('COMMIT');
    console.log('Password reset. Existing sessions revoked.');
}
finally {
    store.close();
}
