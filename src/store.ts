import { MongoClient, ServerApiVersion, type Collection, type Db, type Document } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { hash } from './security';
import { HttpError } from './validation';
import type { Capture, CaptureEvent, Note, Project, StoredSession, User } from './types';

interface UserDocument extends User, Document {
    password: string;
    created_at: number;
}

interface AuthSessionDocument extends Document {
    token_hash: string;
    user_id: string;
    expires_at: number;
}

interface SessionDocument extends StoredSession, Document {
    events: CaptureEvent[];
}

interface ShareDocument extends Document {
    token_hash: string;
    session_id: string;
    expires_at: number;
}

interface SourceMapDocument extends Document {
    id: string;
    project_id: string;
    asset: string;
    release: string;
    data: unknown;
    created_at: number;
}

interface LimitDocument extends Document {
    bucket: string;
    count: number;
    resets_at: number;
}

function databaseName() {
    return process.env.MONGODB_DB?.trim() || 'reprolab';
}

function createClient() {
    const uri = process.env.MONGODB_URI;
    if (!uri)
        throw new Error('MONGODB_URI must be configured on the server.');
    return new MongoClient(uri, {
        appName: 'reprolab',
        serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
        serverSelectionTimeoutMS: 10_000
    });
}

declare global {
    var reprolabMongoClientPromise: Promise<MongoClient> | undefined;
    var reprolabStorePromise: Promise<Store> | undefined;
}

async function client() {
    if (!global.reprolabMongoClientPromise)
        global.reprolabMongoClientPromise = createClient().connect();
    return global.reprolabMongoClientPromise;
}

/** MongoDB persistence for the Next.js server runtime. No browser code imports this module. */
export class Store {
    readonly users: Collection<UserDocument>;
    readonly authSessions: Collection<AuthSessionDocument>;
    readonly projects: Collection<Project>;
    readonly sessions: Collection<SessionDocument>;
    readonly notes: Collection<Note>;
    readonly shares: Collection<ShareDocument>;
    readonly sourceMaps: Collection<SourceMapDocument>;
    readonly limits: Collection<LimitDocument>;

    private constructor(private readonly db: Db) {
        this.users = db.collection<UserDocument>('users');
        this.authSessions = db.collection<AuthSessionDocument>('auth_sessions');
        this.projects = db.collection<Project>('projects');
        this.sessions = db.collection<SessionDocument>('sessions');
        this.notes = db.collection<Note>('notes');
        this.shares = db.collection<ShareDocument>('shares');
        this.sourceMaps = db.collection<SourceMapDocument>('source_maps');
        this.limits = db.collection<LimitDocument>('limits');
    }

    static async connect() {
        const db = (await client()).db(databaseName());
        const store = new Store(db);
        await store.ensureIndexes();
        return store;
    }

    private async ensureIndexes() {
        await Promise.all([
            this.users.createIndex({ email: 1 }, { unique: true }),
            this.authSessions.createIndex({ token_hash: 1 }, { unique: true }),
            this.authSessions.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
            this.projects.createIndex({ owner_id: 1, created_at: -1 }),
            this.projects.createIndex({ key_hash: 1 }, { unique: true }),
            this.sessions.createIndex({ project_id: 1, client_id: 1 }, { unique: true }),
            this.sessions.createIndex({ project_id: 1, created_at: -1 }),
            this.sessions.createIndex({ project_id: 1, fingerprint: 1 }),
            this.notes.createIndex({ session_id: 1, created_at: 1 }),
            this.shares.createIndex({ token_hash: 1 }, { unique: true }),
            this.shares.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
            this.sourceMaps.createIndex({ project_id: 1, asset: 1, release: 1 }, { unique: true }),
            this.limits.createIndex({ bucket: 1 }, { unique: true }),
            this.limits.createIndex({ resets_at: 1 }, { expireAfterSeconds: 3600 })
        ]);
    }

    async ping() {
        await this.db.command({ ping: 1 });
    }

    async userForToken(token: string): Promise<User | undefined> {
        if (!token)
            return undefined;
        const auth = await this.authSessions.findOne({ token_hash: hash(token), expires_at: { $gt: Date.now() } });
        if (!auth)
            return undefined;
        const user = await this.users.findOne({ id: auth.user_id }, { projection: { _id: 0, id: 1, email: 1, name: 1 } });
        return user ? { id: user.id, email: user.email, name: user.name } : undefined;
    }

    async ownerProject(id: string, userId: string): Promise<Project> {
        const project = await this.projects.findOne({ id, owner_id: userId }, { projection: { _id: 0 } });
        if (!project)
            throw new HttpError(404, 'Project not found.');
        return project;
    }

    async ownerSession(id: string, userId: string): Promise<StoredSession> {
        const session = await this.sessions.aggregate<StoredSession>([
            { $match: { id } },
            { $lookup: { from: 'projects', localField: 'project_id', foreignField: 'id', as: 'project' } },
            { $match: { 'project.owner_id': userId } },
            { $project: { _id: 0, events: 0, project: 0 } }
        ]).next();
        if (!session)
            throw new HttpError(404, 'Session not found.');
        return session;
    }

    async session(id: string): Promise<SessionDocument | undefined> {
        return (await this.sessions.findOne({ id }, { projection: { _id: 0 } })) ?? undefined;
    }

    async events(id: string): Promise<CaptureEvent[]> {
        return (await this.session(id))?.events ?? [];
    }

    async notesFor(id: string): Promise<Note[]> {
        return this.notes.find({ session_id: id }, { projection: { _id: 0 } }).sort({ created_at: 1 }).toArray();
    }

    async saveCapture(projectId: string, capture: Capture) {
        if (await this.sessions.countDocuments({ project_id: projectId }) >= 1000)
            throw new HttpError(429, 'Project limit reached. Delete old sessions first.');
        const errors = capture.events.filter(event => event.kind === 'error');
        const first = errors[0];
        const fingerprint = hash(first ? `${first.data.name}:${first.data.message}`.replace(/\d+/g, '#') : `no-error:${capture.url}`).slice(0, 16);
        const id = randomUUID();
        const session: SessionDocument = {
            id,
            project_id: projectId,
            client_id: capture.clientId,
            title: capture.title,
            url: capture.url,
            release: capture.release,
            browser: capture.browser,
            viewport_width: capture.viewport.width,
            viewport_height: capture.viewport.height,
            duration: capture.duration,
            status: 'new',
            error_count: errors.length,
            event_count: capture.events.length,
            fingerprint,
            created_at: Date.now(),
            github_url: null,
            events: capture.events
        };
        try {
            await this.sessions.insertOne(session);
            return { id, duplicate: false };
        } catch (error) {
            if (!(error instanceof Error) || !('code' in error) || error.code !== 11000)
                throw error;
            const existing = await this.sessions.findOne({ project_id: projectId, client_id: capture.clientId }, { projection: { id: 1 } });
            if (!existing)
                throw error;
            return { id: existing.id, duplicate: true };
        }
    }

    async rateLimit(bucket: string, max: number, windowMs = 60_000) {
        const now = Date.now();
        const result = await this.limits.findOneAndUpdate(
            { bucket, $or: [{ resets_at: { $lte: now } }, { count: { $lt: max } }] },
            [{
                $set: {
                    bucket,
                    count: { $cond: [{ $lte: ['$resets_at', now] }, 1, { $add: ['$count', 1] }] },
                    resets_at: { $cond: [{ $lte: ['$resets_at', now] }, now + windowMs, '$resets_at'] }
                }
            }],
            { upsert: true, returnDocument: 'after' }
        );
        if (!result)
            throw new HttpError(429, 'Too many requests. Try again shortly.');
    }

    async deleteProject(id: string) {
        const sessionIds = (await this.sessions.find({ project_id: id }, { projection: { _id: 0, id: 1 } }).toArray()).map(session => session.id);
        await Promise.all([
            this.projects.deleteOne({ id }),
            this.sessions.deleteMany({ project_id: id }),
            this.sourceMaps.deleteMany({ project_id: id }),
            sessionIds.length ? this.notes.deleteMany({ session_id: { $in: sessionIds } }) : Promise.resolve(),
            sessionIds.length ? this.shares.deleteMany({ session_id: { $in: sessionIds } }) : Promise.resolve()
        ]);
    }

    async deleteSession(id: string) {
        await Promise.all([this.sessions.deleteOne({ id }), this.notes.deleteMany({ session_id: id }), this.shares.deleteMany({ session_id: id })]);
    }

    async purge(days: number) {
        const now = Date.now();
        const expiredSessionIds = (await this.sessions.find({ created_at: { $lt: now - days * 86_400_000 } }, { projection: { _id: 0, id: 1 } }).toArray()).map(session => session.id);
        await Promise.all([
            this.authSessions.deleteMany({ expires_at: { $lte: now } }),
            this.shares.deleteMany({ expires_at: { $lte: now } }),
            this.limits.deleteMany({ resets_at: { $lt: now - 3_600_000 } }),
            this.sessions.deleteMany({ created_at: { $lt: now - days * 86_400_000 } }),
            expiredSessionIds.length ? this.notes.deleteMany({ session_id: { $in: expiredSessionIds } }) : Promise.resolve()
        ]);
    }
}

export async function getStore() {
    if (!global.reprolabStorePromise)
        global.reprolabStorePromise = Store.connect();
    return global.reprolabStorePromise;
}
