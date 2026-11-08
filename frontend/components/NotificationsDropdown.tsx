import React, { useState, useEffect, useRef } from 'react';
import { User, FriendRequestOut, GroupInvitation } from '../types';
import { View } from '../App';
import { getIncomingRequests, getUserInvitations, acceptConnectionRequest, rejectConnectionRequest } from '../services/apiService';
import { UsersIcon } from './icons/UsersIcon';
import { LoaderIcon } from './icons/LoaderIcon';

interface NotificationsDropdownProps {
    user: User;
    isOpen: boolean;
    onClose: () => void;
    setView: (view: View) => void;
    onRefresh: () => void;
    anchorRef: React.RefObject<HTMLButtonElement | null>;
}

export const NotificationsDropdown: React.FC<NotificationsDropdownProps> = ({
    user,
    isOpen,
    onClose,
    setView,
    onRefresh,
    anchorRef,
}) => {
    const [connectionRequests, setConnectionRequests] = useState<FriendRequestOut[]>([]);
    const [groupInvitations, setGroupInvitations] = useState<GroupInvitation[]>([]);
    const [loading, setLoading] = useState(false);
    const [actingId, setActingId] = useState<string | number | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen || !user) return;
        setLoading(true);
        Promise.all([getIncomingRequests(), getUserInvitations(user.id)])
            .then(([requests, invites]) => {
                setConnectionRequests(requests);
                setGroupInvitations(invites.filter((i) => i.status === 'pending'));
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [isOpen, user?.id]);

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (
                dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
                anchorRef.current && !anchorRef.current.contains(e.target as Node)
            ) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose, anchorRef]);

    const handleAccept = async (requestId: number) => {
        setActingId(requestId);
        try {
            await acceptConnectionRequest(requestId);
            setConnectionRequests((prev) => prev.filter((r) => r.id !== requestId));
            onRefresh();
        } finally {
            setActingId(null);
        }
    };

    const handleReject = async (requestId: number) => {
        setActingId(requestId);
        try {
            await rejectConnectionRequest(requestId);
            setConnectionRequests((prev) => prev.filter((r) => r.id !== requestId));
            onRefresh();
        } finally {
            setActingId(null);
        }
    };

    if (!isOpen) return null;

    const total = connectionRequests.length + groupInvitations.length;

    return (
        <div
            ref={dropdownRef}
            className="absolute right-0 top-full mt-2 w-80 max-h-[70vh] overflow-hidden rounded-xl border border-[var(--border)] shadow-xl z-[100] flex flex-col"
            style={{ background: 'var(--surface)' }}
        >
            <div className="px-4 py-3 border-b border-[var(--border)]">
                <h3 className="font-bold text-[var(--text)]">Notifications</h3>
                {total === 0 && !loading && (
                    <p className="text-sm text-[var(--text-muted)] mt-1">No pending requests</p>
                )}
            </div>
            <div className="overflow-y-auto flex-1">
                {loading ? (
                    <div className="flex justify-center py-8">
                        <LoaderIcon className="w-6 h-6 animate-spin text-[var(--primary)]" />
                    </div>
                ) : (
                    <>
                        {connectionRequests.length > 0 && (
                            <div className="border-b border-[var(--border)]">
                                <p className="px-4 py-2 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                                    Connection requests
                                </p>
                                {connectionRequests.map((req) => (
                                    <div
                                        key={`req-${req.id}`}
                                        className="px-4 py-3 hover:bg-[var(--bg-secondary)] flex items-center justify-between gap-2"
                                    >
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <div className="w-8 h-8 rounded-full bg-[var(--primary)]/20 flex items-center justify-center text-[var(--primary)] font-bold text-sm flex-shrink-0">
                                                {req.from_user_name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-[var(--text)] truncate">
                                                    {req.from_user_name} wants to connect
                                                </p>
                                                <p className="text-xs text-[var(--text-muted)] truncate">{req.from_user_email}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-1 flex-shrink-0">
                                            <button
                                                onClick={() => handleAccept(req.id)}
                                                disabled={actingId === req.id}
                                                className="text-xs font-medium px-2 py-1 rounded text-white hover:opacity-90 disabled:opacity-50"
                                                style={{ background: 'var(--gradient-primary)' }}
                                            >
                                                {actingId === req.id ? '…' : 'Accept'}
                                            </button>
                                            <button
                                                onClick={() => handleReject(req.id)}
                                                disabled={actingId === req.id}
                                                className="text-xs font-medium px-2 py-1 rounded bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-red-400 border border-[var(--border)]"
                                            >
                                                Reject
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {groupInvitations.length > 0 && (
                            <div>
                                <p className="px-4 py-2 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                                    Group invitations
                                </p>
                                {groupInvitations.map((inv) => (
                                    <div
                                        key={`inv-${inv.id}`}
                                        className="px-4 py-3 hover:bg-[var(--bg-secondary)] flex items-center gap-2"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-[var(--primary)]/20 flex items-center justify-center flex-shrink-0">
                                            <UsersIcon className="w-4 h-4 text-[var(--primary)]" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-[var(--text)] truncate">
                                                Invited to {inv.groupName}
                                            </p>
                                            <p className="text-xs text-[var(--text-muted)] truncate">
                                                by {inv.inviter.name}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                onClose();
                                                setView({ name: 'groups' });
                                            }}
                                            className="text-xs font-medium px-2 py-1 rounded text-[var(--primary)] hover:underline flex-shrink-0"
                                        >
                                            View
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
            {(connectionRequests.length > 0 || groupInvitations.length > 0) && (
                <div className="border-t border-[var(--border)] px-4 py-2">
                    <button
                        onClick={() => {
                            onClose();
                            setView({ name: 'friends' });
                        }}
                        className="text-sm font-medium text-[var(--primary)] hover:underline w-full text-center py-1"
                    >
                        Open Friends
                    </button>
                </div>
            )}
        </div>
    );
};
