import type { ColumnType } from 'kysely';
export type Generated<T> = T extends ColumnType<infer S, infer I, infer U> ? ColumnType<S, I | undefined, U> : ColumnType<T, T | undefined, T>;
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export type account = {
    id: Generated<number>;
    username: string;
    password: string;
    email: string | null;
    registration_ip: string | null;
    registration_date: Generated<Timestamp>;
    logged_in: Generated<number>;
    login_time: Timestamp | null;
    logged_out: Generated<number>;
    logout_time: Timestamp | null;
    muted_until: Timestamp | null;
    banned_until: Timestamp | null;
    staffmodlevel: Generated<number>;
    notes: string | null;
    notes_updated: Timestamp | null;
    members: Generated<number>;
};
export type account_session = {
    id: Generated<number>;
    account_id: number;
    world: Generated<number>;
    profile: Generated<string>;
    session_uuid: string;
    timestamp: Timestamp;
    coord: number;
    event: string;
    event_type: Generated<number>;
};
export type friendlist = {
    account_id: number;
    friend_account_id: number;
    created: Generated<Timestamp>;
};
export type hiscore = {
    account_id: number;
    profile: Generated<string>;
    type: number;
    level: number;
    value: number;
    date: Generated<Timestamp>;
};
export type hiscore_large = {
    account_id: number;
    profile: Generated<string>;
    type: number;
    level: number;
    value: number;
    date: Generated<Timestamp>;
};
export type ignorelist = {
    account_id: number;
    value: string;
    created: Generated<Timestamp>;
};
export type input_report = {
    id: Generated<number>;
    account_id: number;
    timestamp: Timestamp;
    session_uuid: string;
};
export type input_report_event = {
    input_report_id: number;
    seq: number;
    input_type: Generated<number>;
    delta: number;
    coord: number;
    mouse_x: number | null;
    mouse_y: number | null;
    key_code: number | null;
};
export type input_report_event_raw = {
    input_report_id: number;
    seq: number;
    coord: number;
    data: Buffer;
};
export type ipban = {
    ip: string;
};
export type login = {
    uuid: string;
    account_id: number;
    world: number;
    timestamp: Timestamp;
    uid: number;
    ip: string | null;
};
export type newspost = {
    id: Generated<number>;
    category: number;
    title: string;
    content: string;
    slug: string | null;
    created: Generated<Timestamp>;
    updated: Generated<Timestamp>;
};
export type player_saves = {
    id: Generated<number>;
    username: string;
    save_data: Buffer;
    last_updated: Generated<Timestamp>;
};
export type private_chat = {
    id: Generated<number>;
    account_id: number;
    profile: string;
    timestamp: Timestamp;
    coord: number;
    to_account_id: number;
    message: string;
};
export type public_chat = {
    id: Generated<number>;
    account_id: number;
    profile: string;
    world: number;
    timestamp: Timestamp;
    coord: number;
    message: string;
};
export type report = {
    id: Generated<number>;
    account_id: number;
    profile: string;
    world: number;
    timestamp: Timestamp;
    coord: number;
    offender: string;
    reason: number;
};
export type session = {
    uuid: string;
    account_id: number;
    profile: string;
    world: number;
    timestamp: Timestamp;
    uid: number;
    ip: string | null;
};
export type DB = {
    account: account;
    account_session: account_session;
    friendlist: friendlist;
    hiscore: hiscore;
    hiscore_large: hiscore_large;
    ignorelist: ignorelist;
    input_report: input_report;
    input_report_event: input_report_event;
    input_report_event_raw: input_report_event_raw;
    ipban: ipban;
    login: login;
    newspost: newspost;
    player_saves: player_saves;
    private_chat: private_chat;
    public_chat: public_chat;
    report: report;
    session: session;
};
