export type EventKind = 'click' | 'input' | 'navigation' | 'console' | 'error' | 'network' | 'snapshot' | 'scroll' | 'marker';
export interface VisualNode {
    tag: string;
    x: number;
    y: number;
    w: number;
    h: number;
    text: string;
    color: string;
    bg: string;
    size: number;
    weight: number;
    radius: number;
    masked: boolean;
}
export interface VisualFrame {
    width: number;
    height: number;
    scrollY: number;
    nodes: VisualNode[];
}
export interface CaptureEvent {
    kind: EventKind;
    at: number;
    data: Record<string, unknown>;
}
export interface Capture {
    version: 1;
    clientId: string;
    title: string;
    url: string;
    release: string;
    browser: string;
    viewport: {
        width: number;
        height: number;
    };
    duration: number;
    events: CaptureEvent[];
}
export interface Project {
    id: string;
    owner_id: string;
    name: string;
    origins: string[];
    key_hash: string;
    repo: string;
    created_at: number;
}
export interface User {
    id: string;
    email: string;
    name: string;
}
export interface StoredSession {
    id: string;
    project_id: string;
    title: string;
    url: string;
    release: string;
    browser: string;
    viewport_width: number;
    viewport_height: number;
    duration: number;
    status: string;
    error_count: number;
    event_count: number;
    fingerprint: string;
    created_at: number;
    client_id: string;
    github_url: string | null;
}

export interface Note {
    id: string;
    session_id: string;
    body: string;
    created_at: number;
}
