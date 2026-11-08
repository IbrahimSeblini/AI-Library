import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Friendship, ReadingEvent, FriendsInsights, FriendRequestOut } from '../types';
import {
    getFriends, getFriendsFeed, getFriendsInsights, getFriendsCount,
    getIncomingRequests, getSentRequests, sendConnectionRequest,
    acceptConnectionRequest, rejectConnectionRequest, cancelConnectionRequest,
    disconnectUser, searchUsers,
} from '../services/apiService';
import { LoaderIcon } from './icons/LoaderIcon';
import { SearchIcon } from './icons/SearchIcon';
import { XIcon } from './icons/XIcon';

interface FriendsActivityProps {
    user: User;
    onSelectPaper: (id: string) => void;
    onRefreshNotifications?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(dateStr).toLocaleDateString();
}

function actionLabel(action: string): string {
    switch (action) {
        case 'opened': return 'started reading';
        case 'finished': return 'finished';
        case 'highlighted': return 'highlighted in';
        default: return 'read';
    }
}

// Small inline SVG icons for feed activity badges
const ActionBadge: React.FC<{ action: string }> = ({ action }) => {
    const base = 'w-3.5 h-3.5';
    if (action === 'opened') return (
        <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
    );
    if (action === 'finished') return (
        <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
    if (action === 'highlighted') return (
        <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
    );
    return (
        <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        </svg>
    );
};

// Avatar with gradient background based on name initial
const AVATAR_GRADIENTS = [
    'from-violet-500 to-indigo-500',
    'from-rose-500 to-pink-500',
    'from-amber-500 to-orange-500',
    'from-emerald-500 to-teal-500',
    'from-sky-500 to-blue-500',
    'from-fuchsia-500 to-purple-500',
];
function avatarGradient(name: string) {
    return AVATAR_GRADIENTS[name.charCodeAt(0) % AVATAR_GRADIENTS.length];
}

const Avatar: React.FC<{ name: string; size?: 'sm' | 'md' }> = ({ name, size = 'md' }) => {
    const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
    return (
        <div className={`${sz} rounded-full bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center font-bold text-white flex-shrink-0`}>
            {name.charAt(0).toUpperCase()}
        </div>
    );
};

type Tab = 'feed' | 'insights' | 'manage';

const FriendsActivity: React.FC<FriendsActivityProps> = ({ user, onSelectPaper, onRefreshNotifications }) => {
    const [tab, setTab] = useState<Tab>('feed');
    const [feed, setFeed] = useState<ReadingEvent[]>([]);
    const [insights, setInsights] = useState<FriendsInsights | null>(null);
    const [friends, setFriends] = useState<Friendship[]>([]);
    const [friendsCount, setFriendsCount] = useState({ friends: 0, pending_incoming: 0, pending_sent: 0 });
    const [incomingRequests, setIncomingRequests] = useState<FriendRequestOut[]>([]);
    const [sentRequests, setSentRequests] = useState<FriendRequestOut[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<User[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [friendsSet, setFriendsSet] = useState<Set<string>>(new Set());
    const [pendingSentSet, setPendingSentSet] = useState<Set<string>>(new Set());
    const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
    const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

    const fetchAll = useCallback(async (showLoader = true) => {
        if (showLoader) setIsLoading(true);
        try {
            const [feedData, insightsData, friendsData, countData, incomingData, sentData] = await Promise.all([
                getFriendsFeed(user.id), getFriendsInsights(user.id), getFriends(user.id),
                getFriendsCount(), getIncomingRequests(), getSentRequests(),
            ]);
            setFeed(feedData); setInsights(insightsData); setFriends(friendsData);
            setFriendsCount(countData); setIncomingRequests(incomingData); setSentRequests(sentData);
            setFriendsSet(new Set(friendsData.map(f => f.friendId)));
            setPendingSentSet(new Set(sentData.map(r => String(r.to_user_id))));
        } catch (err) { console.error(err); }
        finally { setIsLoading(false); }
    }, [user.id]);

    useEffect(() => { fetchAll(); }, [fetchAll]);
    useEffect(() => { const t = setInterval(() => fetchAll(false), 60_000); return () => clearInterval(t); }, [fetchAll]);
    useEffect(() => {
        const fn = () => { if (document.visibilityState === 'visible') fetchAll(false); };
        document.addEventListener('visibilitychange', fn);
        return () => document.removeEventListener('visibilitychange', fn);
    }, [fetchAll]);

    useEffect(() => {
        if (!searchQuery.trim()) { setSearchResults([]); return; }
        const t = setTimeout(async () => {
            setIsSearching(true);
            try { setSearchResults(await searchUsers(searchQuery, user)); }
            catch { setSearchResults([]); }
            finally { setIsSearching(false); }
        }, 400);
        return () => clearTimeout(t);
    }, [searchQuery, user]);

    const setLoad = (id: string, on: boolean) => setActionLoading(p => { const s = new Set(p); on ? s.add(id) : s.delete(id); return s; });
    const setErr = (id: string, msg: string | null) => setActionErrors(p => msg ? { ...p, [id]: msg } : Object.fromEntries(Object.entries(p).filter(([k]) => k !== id)));

    const handleConnect = async (targetId: string) => {
        setLoad(targetId, true); setErr(targetId, null);
        try { await sendConnectionRequest(targetId); setPendingSentSet(p => new Set(p).add(targetId)); await fetchAll(); }
        catch (err: any) { setErr(targetId, err?.message?.includes('{') ? 'Failed to send request' : (err?.message || 'Failed')); }
        finally { setLoad(targetId, false); }
    };
    const handleDisconnect = async (targetId: string) => {
        setLoad(targetId, true); setErr(targetId, null);
        try { await disconnectUser(targetId); setFriendsSet(p => { const s = new Set(p); s.delete(targetId); return s; }); await fetchAll(); }
        catch (err: any) { setErr(targetId, err?.message?.includes('{') ? 'Failed to disconnect' : (err?.message || 'Failed')); }
        finally { setLoad(targetId, false); }
    };
    const handleAccept = async (id: number) => { try { await acceptConnectionRequest(id); await fetchAll(); onRefreshNotifications?.(); } catch {} };
    const handleReject = async (id: number) => { try { await rejectConnectionRequest(id); await fetchAll(); onRefreshNotifications?.(); } catch {} };
    const handleCancel = async (reqId: number, toId: string) => {
        setLoad(toId, true);
        try { await cancelConnectionRequest(reqId); setPendingSentSet(p => { const s = new Set(p); s.delete(toId); return s; }); await fetchAll(); }
        finally { setLoad(toId, false); }
    };

    const totalNotif = incomingRequests.length;

    return (
        <div className="max-w-[1440px] mx-auto px-6 sm:px-8 md:px-10 py-10">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="mb-8 flex items-end justify-between">
                <div>
                    <h1 className="text-4xl font-extrabold text-[var(--text)] tracking-tight font-display">Friends</h1>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">See what your network is reading.</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <span className="font-semibold text-[var(--text)]">{friendsCount.friends}</span> friends
                </div>
            </div>

            {/* ── Tabs ────────────────────────────────────────────────────── */}
            <div className="flex gap-1 mb-8 border-b border-[var(--border)]">
                {(['feed', 'insights', 'manage'] as Tab[]).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`relative px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
                            tab === t ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                        }`}
                    >
                        {t}
                        {t === 'manage' && totalNotif > 0 && (
                            <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-[var(--danger)] text-[10px] font-bold text-white">{totalNotif}</span>
                        )}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <div className="flex justify-center items-center h-40">
                    <LoaderIcon className="w-8 h-8 animate-spin text-[var(--primary)]" />
                </div>
            ) : (
                <AnimatePresence mode="wait">
                    <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>

                        {/* ── Feed ──────────────────────────────────────────── */}
                        {tab === 'feed' && (
                            feed.length === 0 ? (
                                <div className="text-center py-20">
                                    <svg className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                    <p className="text-base font-semibold text-[var(--text)]">Nothing yet</p>
                                    <p className="text-sm text-[var(--text-muted)] mt-1">
                                        Connect with people from the{' '}
                                        <button onClick={() => setTab('manage')} className="text-[var(--primary)] underline">Manage</button> tab.
                                    </p>
                                </div>
                            ) : (
                                <div className="divide-y divide-[var(--border)]/50">
                                    {feed.map((event, i) => (
                                        <motion.div
                                            key={event.id}
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.03 }}
                                            className="flex items-start gap-3 py-3.5 px-2 hover:bg-[var(--surface)] rounded-xl transition-colors group"
                                        >
                                            <div className="relative flex-shrink-0">
                                                <Avatar name={event.userName} />
                                                <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)]">
                                                    <ActionBadge action={event.action} />
                                                </span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm leading-snug">
                                                    <span className="font-semibold text-[var(--text)]">{event.userName}</span>
                                                    <span className="text-[var(--text-muted)]"> {actionLabel(event.action)} </span>
                                                    <button
                                                        onClick={() => onSelectPaper(event.paperId)}
                                                        className="font-medium text-[var(--text)] hover:text-[var(--primary)] transition-colors"
                                                    >
                                                        {event.paperTitle}
                                                    </button>
                                                </p>
                                            </div>
                                            <span className="text-[11px] text-[var(--text-muted)] flex-shrink-0 pt-0.5">{timeAgo(event.timestamp)}</span>
                                        </motion.div>
                                    ))}
                                </div>
                            )
                        )}

                        {/* ── Insights ──────────────────────────────────────── */}
                        {tab === 'insights' && insights && (
                            <div className="space-y-10">

                                {/* Most active — horizontal avatar strip */}
                                {(insights.mostActiveReadersByTime?.length ?? 0) > 0 && (
                                    <section>
                                        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-4">Most Active This Week</p>
                                        <div className="flex gap-5 overflow-x-auto pb-1">
                                            {(insights.mostActiveReadersByTime ?? []).slice(0, 5).map((r, i) => (
                                                <div key={r.userId} className="flex flex-col items-center gap-1.5 flex-shrink-0">
                                                    <div className="relative">
                                                        <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${avatarGradient(r.name)} flex items-center justify-center text-lg font-bold text-white ring-2 ring-[var(--primary)]/30`}>
                                                            {r.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        {i === 0 && (
                                                            <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-white">
                                                                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs font-medium text-[var(--text)] text-center max-w-[56px] truncate">{r.name.split(' ')[0]}</p>
                                                    <p className="text-[10px] text-[var(--text-muted)]">{r.formatted}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {/* Trending papers + subjects */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                    <section>
                                        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-4">Trending Papers</p>
                                        {insights.trendingPapers.length === 0 ? (
                                            <p className="text-sm text-[var(--text-muted)]">No data yet.</p>
                                        ) : (
                                            <div className="space-y-3">
                                                {insights.trendingPapers.map((p, idx) => (
                                                    <div key={p.paperId} className="flex items-center gap-3 group">
                                                        <span className="text-xs font-bold text-[var(--text-muted)] w-4 text-right flex-shrink-0">{idx + 1}</span>
                                                        <button
                                                            onClick={() => onSelectPaper(p.paperId)}
                                                            className="flex-1 text-sm text-left text-[var(--text)] hover:text-[var(--primary)] transition-colors font-medium truncate"
                                                        >
                                                            {p.title}
                                                        </button>
                                                        <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                                                            {p.readCount}×
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </section>

                                    <section>
                                        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-4">Trending Subjects</p>
                                        {(insights.trendingSubjects?.length ?? 0) === 0 ? (
                                            <p className="text-sm text-[var(--text-muted)]">No data yet.</p>
                                        ) : (
                                            <div className="space-y-3">
                                                {(insights.trendingSubjects ?? []).map((s, idx) => (
                                                    <div key={s.subject} className="flex items-center gap-3">
                                                        <span className="text-xs font-bold text-[var(--text-muted)] w-4 text-right flex-shrink-0">{idx + 1}</span>
                                                        <span className="flex-1 text-sm text-[var(--text)] font-medium truncate">{s.subject}</span>
                                                        <span className="flex-shrink-0 text-[10px] text-[var(--text-muted)] font-mono">
                                                            {s.total_seconds >= 3600 ? `${Math.floor(s.total_seconds / 3600)}h` : `${Math.floor(s.total_seconds / 60)}m`}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </section>
                                </div>
                            </div>
                        )}

                        {/* ── Manage ────────────────────────────────────────── */}
                        {tab === 'manage' && (
                            <div className="space-y-10 max-w-lg">

                                {/* Search */}
                                <section>
                                    <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-3">Find People</p>
                                    <div className="relative">
                                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            placeholder="Search by name or email…"
                                            className="w-full h-10 pl-9 pr-9 text-sm bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--text-muted)] rounded-2xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/50 focus:border-[var(--primary)] transition-all"
                                        />
                                        {searchQuery && (
                                            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                                                <XIcon className="w-4 h-4 text-[var(--text-muted)]" />
                                            </button>
                                        )}
                                    </div>

                                    <AnimatePresence>
                                        {(isSearching || searchResults.length > 0) && (
                                            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 space-y-1 max-w-md">
                                                {isSearching ? (
                                                    <div className="flex justify-center py-4"><LoaderIcon className="w-5 h-5 animate-spin text-[var(--primary)]" /></div>
                                                ) : searchResults.map(u => {
                                                    const isFriend = friendsSet.has(u.id);
                                                    const isPending = pendingSentSet.has(u.id);
                                                    const loading = actionLoading.has(u.id);
                                                    return (
                                                        <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--surface)] transition-colors">
                                                            <Avatar name={u.name} size="sm" />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-semibold text-[var(--text)] truncate">{u.name}</p>
                                                                <p className="text-xs text-[var(--text-muted)] truncate">{u.email}</p>
                                                            </div>
                                                            {isFriend ? (
                                                                <span className="text-xs text-[var(--text-muted)]">Friends</span>
                                                            ) : isPending ? (
                                                                <button onClick={() => { const r = sentRequests.find(r => String(r.to_user_id) === u.id); if (r) handleCancel(r.id, u.id); }} disabled={loading} className="text-xs text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors disabled:opacity-50">
                                                                    {loading ? '…' : 'Pending'}
                                                                </button>
                                                            ) : (
                                                                <button onClick={() => handleConnect(u.id)} disabled={loading} className="text-xs font-semibold text-white px-3 py-1.5 rounded-full transition-opacity hover:opacity-90 disabled:opacity-50" style={{ background: 'var(--gradient-primary)' }}>
                                                                    {loading ? '…' : 'Follow'}
                                                                </button>
                                                            )}
                                                            {actionErrors[u.id] && <p className="text-xs text-red-400">{actionErrors[u.id]}</p>}
                                                        </div>
                                                    );
                                                })}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </section>

                                {/* Incoming requests */}
                                {incomingRequests.length > 0 && (
                                    <section>
                                        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-3">
                                            Requests <span className="ml-1 text-[var(--danger)]">({incomingRequests.length})</span>
                                        </p>
                                        <div className="space-y-1">
                                            {incomingRequests.map(req => (
                                                <div key={req.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--surface)] transition-colors">
                                                    <Avatar name={req.from_user_name} size="sm" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-semibold text-[var(--text)] truncate">{req.from_user_name}</p>
                                                        <p className="text-xs text-[var(--text-muted)] truncate">{req.from_user_email}</p>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => handleAccept(req.id)} className="text-xs font-semibold text-white px-3 py-1.5 rounded-full hover:opacity-90" style={{ background: 'var(--gradient-primary)' }}>Accept</button>
                                                        <button onClick={() => handleReject(req.id)} className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--danger)] px-2 py-1.5 rounded-full transition-colors">Decline</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {/* Sent / pending */}
                                {sentRequests.length > 0 && (
                                    <section>
                                        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-3">Pending ({sentRequests.length})</p>
                                        <div className="space-y-1">
                                            {sentRequests.map(req => (
                                                <div key={req.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--surface)] transition-colors">
                                                    <Avatar name={req.from_user_name} size="sm" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-semibold text-[var(--text)] truncate">{req.from_user_name}</p>
                                                        <p className="text-xs text-[var(--text-muted)] truncate">{req.from_user_email}</p>
                                                    </div>
                                                    <button onClick={() => handleCancel(req.id, String(req.to_user_id))} disabled={actionLoading.has(String(req.to_user_id))} className="text-xs text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors disabled:opacity-50">
                                                        {actionLoading.has(String(req.to_user_id)) ? '…' : 'Cancel'}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {/* Friends list */}
                                <section>
                                    <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-3">Friends ({friendsCount.friends})</p>
                                    {friends.length === 0 ? (
                                        <p className="text-sm text-[var(--text-muted)]">No friends yet — search above to connect.</p>
                                    ) : (
                                        <div className="space-y-1">
                                            {friends.map(f => {
                                                const loading = actionLoading.has(f.friendId);
                                                return (
                                                    <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--surface)] transition-colors group">
                                                        <Avatar name={f.friendName} size="sm" />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-semibold text-[var(--text)] truncate">{f.friendName}</p>
                                                            <p className="text-xs text-[var(--text-muted)] truncate">{f.friendEmail}</p>
                                                        </div>
                                                        <button onClick={() => handleDisconnect(f.friendId)} disabled={loading} className="text-xs text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--danger)] transition-all disabled:opacity-50">
                                                            {loading ? '…' : 'Remove'}
                                                        </button>
                                                        {actionErrors[f.friendId] && <p className="text-xs text-red-400">{actionErrors[f.friendId]}</p>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>

                            </div>
                        )}

                    </motion.div>
                </AnimatePresence>
            )}
        </div>
    );
};

export default FriendsActivity;
