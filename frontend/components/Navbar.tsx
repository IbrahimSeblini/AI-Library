import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { HomeIcon } from './icons/HomeIcon';
import { BookOpenIcon } from './icons/BookOpenIcon';
import { View } from '../App';
import RoadmapIcon from './icons/RoadmapIcon';
import { HistoryIcon } from './icons/HistoryIcon';
import { GroupsIcon } from './icons/GroupsIcon';
import { MessageSquareIcon } from './icons/MessageSquareIcon';
import { PenLineIcon } from './icons/PenLineIcon';
import { UserCheckIcon } from './icons/UserCheckIcon';
import { Button } from './ui/Button';
import { NotificationsDropdown } from './NotificationsDropdown';
import { SettingsModal } from './SettingsModal';
import { useUIPreferences } from '../contexts/UIPreferencesContext';
import { User } from '../types';

type ViewName = 'home' | 'paper' | 'chat' | 'groups' | 'groupDetail' | 'readings' | 'writings' | 'plagiarism' | 'summary' | 'paraphrase' | 'highlights' | 'roadmap' | 'friends' | 'studytracker';

interface NavbarProps {
    currentView: ViewName;
    setView: (view: View) => void;
    onLogout: () => void;
    invitationCount: number;
    friendsPendingCount?: number;
    user?: User | null;
    onUserUpdate?: (u: User) => void;
    onRefreshNotifications?: () => void;
    onOpenGuide?: () => void;
}

const NavItem: React.FC<{
    label: string;
    icon: React.ReactNode;
    isActive: boolean;
    onClick: () => void;
    badgeCount?: number;
}> = ({ label, icon, isActive, onClick, badgeCount }) => (
    <motion.button
        onClick={onClick}
        className={`relative flex items-center space-x-2 rounded-full px-3 py-2 transition-all duration-200 ${
            isActive
                ? 'text-[var(--primary-contrast)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-secondary)]/75'
        }`}
        style={isActive ? { background: 'var(--gradient-primary)' } : {}}
        whileHover={{ y: -1 }}
        whileTap={{ y: 0 }}
        transition={{ duration: 0.15 }}
    >
        {icon}
        <span className="font-medium text-sm">{label}</span>
        {badgeCount && badgeCount > 0 && (
            <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--danger)] text-xs font-bold text-white shadow-sm"
            >
                {badgeCount}
            </motion.span>
        )}
    </motion.button>
);

const BellIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
);

const GearIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const Navbar: React.FC<NavbarProps> = ({ currentView, setView, onLogout, invitationCount, friendsPendingCount = 0, user, onUserUpdate, onRefreshNotifications, onOpenGuide }) => {
    const [notifOpen, setNotifOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const notifButtonRef = useRef<HTMLButtonElement>(null);
    const { showChatNav } = useUIPreferences();
    const totalNotifCount = invitationCount + friendsPendingCount;

    return (
        <>
        <motion.nav
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed top-0 left-0 right-0 h-16 border-b border-[var(--border)] z-40 flex items-center justify-between px-4 sm:px-6 lg:px-8"
            style={{
                background: 'var(--glass-bg)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
            }}
        >
            <motion.div className="flex items-center space-x-3 flex-shrink-0" whileHover={{ y: -1 }} transition={{ duration: 0.2 }}>
                <div className="p-2 rounded-full flex-shrink-0" style={{ background: 'var(--gradient-primary)' }}>
                    <BookOpenIcon className="w-5 h-5 text-white" />
                </div>
                <span className="text-2xl font-semibold font-display" style={{ color: 'var(--text)' }}>
                    MyLibraryPal
                </span>
            </motion.div>

            <div className="hidden items-center space-x-1 lg:flex">
                <NavItem
                    label="Home"
                    icon={<HomeIcon className="w-4 h-4" />}
                    isActive={currentView === 'home' || currentView === 'paper'}
                    onClick={() => setView({ name: 'home' })}
                />
                <NavItem
                    label="Readings"
                    icon={<BookOpenIcon className="w-4 h-4" />}
                    isActive={currentView === 'readings' || currentView === 'highlights'}
                    onClick={() => setView({ name: 'readings' })}
                />
                <NavItem
                    label="Writings"
                    icon={<PenLineIcon className="w-4 h-4" />}
                    isActive={currentView === 'writings' || currentView === 'summary' || currentView === 'paraphrase' || currentView === 'plagiarism'}
                    onClick={() => setView({ name: 'writings' })}
                />
                <NavItem
                    label="Groups"
                    icon={<GroupsIcon className="w-4 h-4" />}
                    isActive={currentView === 'groups' || currentView === 'groupDetail'}
                    onClick={() => setView({ name: 'groups' })}
                    badgeCount={invitationCount > 0 ? invitationCount : undefined}
                />
                <NavItem
                    label="Friends"
                    icon={<UserCheckIcon className="w-4 h-4" />}
                    isActive={currentView === 'friends'}
                    onClick={() => setView({ name: 'friends' })}
                    badgeCount={friendsPendingCount > 0 ? friendsPendingCount : undefined}
                />
                {showChatNav && (
                    <NavItem
                        label="Chat"
                        icon={<MessageSquareIcon className="w-4 h-4" />}
                        isActive={currentView === 'chat'}
                        onClick={() => setView({ name: 'chat' })}
                    />
                )}
                <NavItem
                    label="Roadmap"
                    icon={<RoadmapIcon className="w-4 h-4" />}
                    isActive={currentView === 'roadmap'}
                    onClick={() => setView({ name: 'roadmap' })}
                />
                <NavItem
                    label="Tracker"
                    icon={<HistoryIcon className="w-4 h-4" />}
                    isActive={currentView === 'studytracker'}
                    onClick={() => setView({ name: 'studytracker' })}
                />
            </div>

            <div className="flex items-center space-x-2 flex-shrink-0">
                {user && (
                    <div className="relative">
                        <button
                            ref={notifButtonRef}
                            onClick={() => setNotifOpen((o) => !o)}
                            className="relative p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-secondary)] transition-colors"
                            aria-label="Notifications"
                        >
                            <BellIcon className="w-5 h-5" />
                            {totalNotifCount > 0 && (
                                <span className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--danger)] text-[10px] font-bold text-white">
                                    {totalNotifCount > 9 ? '9+' : totalNotifCount}
                                </span>
                            )}
                        </button>
                        <NotificationsDropdown
                            user={user}
                            isOpen={notifOpen}
                            onClose={() => setNotifOpen(false)}
                            setView={setView}
                            onRefresh={onRefreshNotifications ?? (() => {})}
                            anchorRef={notifButtonRef}
                        />
                    </div>
                )}
                <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-secondary)] transition-colors"
                    aria-label="Settings"
                >
                    <GearIcon className="w-5 h-5" />
                </button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onLogout}
                    className="text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                    Sign Out
                </Button>
            </div>
        </motion.nav>

        <SettingsModal
            isOpen={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            user={user ?? null}
            onUserUpdate={onUserUpdate ?? (() => {})}
            onOpenGuide={onOpenGuide ?? (() => {})}
        />
        </>
    );
};

export default Navbar;
