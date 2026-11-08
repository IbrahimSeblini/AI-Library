import React, { useState, useEffect, useRef } from 'react';
import { User, ChatMessage, Paper } from './types';
import { login, signup, checkAuth, logout, getUserInvitations, getFriendsCount } from './services/apiService';
import { useUIPreferences } from './contexts/UIPreferencesContext';
import Auth from './components/Auth';
import LandingPage from './components/LandingPage';
import Home from './components/Home';
import Navbar from './components/Navbar';
import Chatbot from './components/Chatbot';
import PaperDetail from './components/PaperDetail';
import type { CourseContext } from './components/PaperDetail';
import CourseDetail from './components/CourseDetail';
import GroupsPage from './components/GroupsPage';
import GroupDetail from './components/GroupDetail';
import ReadingsPage from './components/ReadingsPage';
import WritingsPage from './components/WritingsPage';
import RelaxingSoundsPlayer from './components/RelaxingSoundsPlayer';
import RoadmapPage from './components/roadmap/RoadmapPage';
import { queuePreferredLibrarianPrompt } from './lib/librarianConversation';
import FriendsActivity from './components/FriendsActivity';
import StudyTracker from './components/StudyTracker';
import OnboardingWizard from './components/OnboardingWizard';
import { useStudyTracker } from './hooks/useStudyTracker';
import { LoaderIcon } from './components/icons/LoaderIcon';
import { PageTransition } from './components/ui/PageTransition';
import { AnimatePresence } from 'framer-motion';

export type ReadingsTab = 'papers' | 'highlights' | 'notes' | 'courses';
export type WritingsTool = 'summary' | 'paraphrase' | 'check';

export type ContinueReadingItem = { id: string; title: string; authors: string[]; publicationYear: number };
const CONTINUE_READING_KEY_PREFIX = 'mylibrary_continue_reading_';
const LAST_VIEW_KEY = 'mylibrary_last_view';
const GUIDE_SEEN_KEY_PREFIX = 'mylibrary_guide_seen_';
const MAX_CONTINUE_READING = 10;

function getContinueReadingKey(userId: string): string {
  return `${CONTINUE_READING_KEY_PREFIX}${userId}`;
}

function loadContinueReading(userId: string | null): ContinueReadingItem[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(getContinueReadingKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveContinueReading(items: ContinueReadingItem[], userId: string | null) {
  if (!userId) return;
  localStorage.setItem(getContinueReadingKey(userId), JSON.stringify(items));
}

function getGuideSeenKey(userId: string): string {
  return `${GUIDE_SEEN_KEY_PREFIX}${userId}`;
}

export type View =
    | { name: 'home' }
    | { name: 'paper'; id: string; courseContext?: CourseContext; coursePaperIds?: string[] }
    | { name: 'chat' }
    | { name: 'groups' }
    | { name: 'groupDetail'; id: string }
    | { name: 'readings'; tab?: ReadingsTab }
    | { name: 'writings'; tool?: WritingsTool; initialText?: string }
    | { name: 'roadmap'; activeCourseId?: number }
    | { name: 'friends' }
    | { name: 'studytracker' }
    | { name: 'courseDetail'; id: number }
    /* Legacy: redirect to new views */
    | { name: 'highlights' }
    | { name: 'summary'; initialText?: string }
    | { name: 'paraphrase'; initialText?: string }
    | { name: 'plagiarism' };

function saveLastView(view: View): void {
    try {
        const payload: Record<string, string | undefined> = { name: view.name };
        if ('id' in view && view.id) payload.id = view.id;
        if ('tab' in view && view.tab) payload.tab = view.tab;
        if ('tool' in view && view.tool) payload.tool = view.tool;
        localStorage.setItem(LAST_VIEW_KEY, JSON.stringify(payload));
    } catch {}
}

function loadLastView(): View | null {
    try {
        const raw = localStorage.getItem(LAST_VIEW_KEY);
        if (!raw) return null;
        const o = JSON.parse(raw) as Record<string, string>;
        const name = o?.name;
        if (!name || typeof name !== 'string') return null;
        if (name === 'paper' && o.id) return { name: 'paper', id: String(o.id) };
        if (name === 'groupDetail' && o.id) return { name: 'groupDetail', id: String(o.id) };
        if (name === 'readings') {
            const tab = o.tab === 'highlights' ? 'highlights' : o.tab === 'notes' ? 'notes' : o.tab === 'courses' ? 'courses' : 'papers';
            return { name: 'readings', tab: tab as ReadingsTab };
        }
        if (name === 'writings') return { name: 'writings', tool: (o.tool === 'paraphrase' ? 'paraphrase' : o.tool === 'check' ? 'check' : 'summary') as WritingsTool };
        if (name === 'courseDetail' && o.id) return { name: 'readings', tab: 'courses' as ReadingsTab };
        if (['home', 'chat', 'groups', 'roadmap', 'friends', 'studytracker'].includes(name)) return { name: name as View['name'] };
        if (['highlights', 'summary', 'paraphrase', 'plagiarism'].includes(name)) {
            if (name === 'highlights') return { name: 'readings', tab: 'highlights' };
            if (name === 'summary') return { name: 'writings', tool: 'summary' };
            if (name === 'paraphrase') return { name: 'writings', tool: 'paraphrase' };
            if (name === 'plagiarism') return { name: 'writings', tool: 'check' };
        }
    } catch {}
    return null;
}

const App: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showAuthFromLanding, setShowAuthFromLanding] = useState(false);
    const [view, setView] = useState<View>({ name: 'home' });
    const [invitationCount, setInvitationCount] = useState(0);
    const [friendsPendingCount, setFriendsPendingCount] = useState(0);
    
    // Chat state needs to be lifted up to persist across views
    // Messages will be loaded from backend when Chatbot component mounts
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

    const [continueReading, setContinueReading] = useState<ContinueReadingItem[]>([]);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const { showMusicPlayer } = useUIPreferences();

    // Load / clear Continue Reading when user changes (persist per user, survive logout)
    useEffect(() => {
        if (user) {
            setContinueReading(loadContinueReading(user.id));
        } else {
            setContinueReading([]);
        }
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id) return;
        if (!localStorage.getItem(getGuideSeenKey(user.id))) {
            setIsGuideOpen(true);
        }
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== '?' || event.metaKey || event.ctrlKey || event.altKey) return;
            const target = event.target as HTMLElement | null;
            const isTyping =
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target instanceof HTMLSelectElement ||
                !!target?.isContentEditable;
            if (isTyping) return;
            event.preventDefault();
            setIsGuideOpen(true);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [user?.id]);

    const handleCloseGuide = () => {
        if (user?.id) {
            localStorage.setItem(getGuideSeenKey(user.id), '1');
        }
        setIsGuideOpen(false);
    };

    const addToContinueReading = (paper: Paper) => {
        const item: ContinueReadingItem = {
            id: paper.id,
            title: paper.title,
            authors: paper.authors,
            publicationYear: paper.publicationYear,
        };
        setContinueReading((prev) => {
            const next = [item, ...prev.filter((p) => p.id !== paper.id)].slice(0, MAX_CONTINUE_READING);
            saveContinueReading(next, user?.id ?? null);
            return next;
        });
    };

    const removeFromContinueReading = (id: string) => {
        setContinueReading((prev) => {
            const next = prev.filter((p) => p.id !== id);
            saveContinueReading(next, user?.id ?? null);
            return next;
        });
    };

    const handleSelectPaper = (idOrPaper: string | Paper) => {
        if (typeof idOrPaper === 'object') {
            addToContinueReading(idOrPaper);
            setView({ name: 'paper', id: idOrPaper.id });
        } else {
            setView({ name: 'paper', id: idOrPaper });
        }
    };

    const fetchNotificationCounts = async (currentUser: User) => {
        try {
            const [invites, friendsCount] = await Promise.all([
                getUserInvitations(currentUser.id),
                getFriendsCount(),
            ]);
            setInvitationCount(invites.length);
            setFriendsPendingCount(friendsCount.pending_incoming);
        } catch (error) {
            console.error("Could not fetch notification counts", error);
        }
    };

    // Skip persisting view on the first run after login/refresh so we don't overwrite with "home"
    const skipNextPersistRef = useRef(false);

    useEffect(() => {
        const verifyUser = async () => {
            try {
                const loggedInUser = await checkAuth();
                if (loggedInUser) {
                    const lastView = loadLastView();
                    if (lastView) skipNextPersistRef.current = true;
                    setUser(loggedInUser);
                    await fetchNotificationCounts(loggedInUser);
                    if (lastView) setView(lastView);
                }
            } catch (err) {
                console.error(err);
                logout(); 
            } finally {
                setIsLoading(false);
            }
        };
        verifyUser();
    }, []);

    const handleLogin = async (credentials: { email: string; pass: string }) => {
        const loggedInUser = await login(credentials);
        const lastView = loadLastView();
        if (lastView) skipNextPersistRef.current = true;
        setUser(loggedInUser);
        await fetchNotificationCounts(loggedInUser);
        if (lastView) setView(lastView);
    };

    const handleSignup = async (details: { name: string; email: string; pass: string }) => {
        await signup(details);
    };

    const handleLogout = () => {
        logout();
        setUser(null);
        setShowAuthFromLanding(false);
        setView({ name: 'home' });
        setInvitationCount(0);
        setFriendsPendingCount(0);
        setContinueReading([]);
    };

    // Study tracker: track current view
    const currentPaperId = view.name === 'paper' ? view.id : null;
    useStudyTracker(user ? view.name : 'home', null, currentPaperId);

    const handleLogoutRef = useRef(handleLogout);
    handleLogoutRef.current = handleLogout;

    const INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes
    const inactivityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!user) return;

        const resetInactivityTimer = () => {
            if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
            inactivityTimeoutRef.current = setTimeout(() => {
                handleLogoutRef.current();
            }, INACTIVITY_MS);
        };

        resetInactivityTimer();
        const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
        events.forEach((ev) => window.addEventListener(ev, resetInactivityTimer));

        return () => {
            if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
            inactivityTimeoutRef.current = null;
            events.forEach((ev) => window.removeEventListener(ev, resetInactivityTimer));
        };
    }, [user]);

    const refreshNotificationCounts = async () => {
        if (user) await fetchNotificationCounts(user);
    };

    // Persist current view so refresh restores it (skip once after we just restored from localStorage)
    useEffect(() => {
        if (!user) return;
        if (skipNextPersistRef.current) {
            skipNextPersistRef.current = false;
            return;
        }
        saveLastView(view);
    }, [user, view]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
                <LoaderIcon className="w-12 h-12 animate-spin text-[var(--primary)]" />
            </div>
        );
    }

    if (!user) {
        if (!showAuthFromLanding) {
            return (
                <LandingPage
                    onGetStarted={() => setShowAuthFromLanding(true)}
                    onSignIn={() => setShowAuthFromLanding(true)}
                />
            );
        }
        return <Auth onLogin={handleLogin} onSignup={handleSignup} />;
    }

    const renderView = () => {
        switch (view.name) {
            case 'home':
                return (
                    <Home
                        user={user}
                        continueReading={continueReading}
                        onRemoveFromContinueReading={removeFromContinueReading}
                        onSelectPaper={handleSelectPaper}
                        onDeleteFromLibrary={removeFromContinueReading}
                        onNavigateToReadings={() => setView({ name: 'readings' })}
                        onNavigateToHighlights={() => setView({ name: 'readings', tab: 'highlights' })}
                        onNavigateToNotes={() => setView({ name: 'readings', tab: 'notes' })}
                        onNavigateToFriends={() => setView({ name: 'friends' })}
                        onNavigateToRoadmap={() => setView({ name: 'roadmap' })}
                    />
                );
            case 'paper': {
                const ctx = view.courseContext;
                const paperIds = view.coursePaperIds;
                return (
                    <PaperDetail
                        paperId={view.id}
                        onBack={ctx ? () => setView({ name: 'courseDetail', id: ctx.courseId }) : () => setView({ name: 'home' })}
                        onSummarize={(t) => setView({ name: 'writings', tool: 'summary', initialText: t })}
                        onParaphrase={(t) => setView({ name: 'writings', tool: 'paraphrase', initialText: t })}
                        onViewAllHighlights={() => setView({ name: 'readings', tab: 'highlights' })}
                        onDeletePaper={(id) => removeFromContinueReading(id)}
                        onOpenLibrarian={() => setView({ name: 'chat' })}
                        userName={user?.name}
                        courseContext={ctx}
                        onNavigateToCourse={ctx ? (courseId) => setView({ name: 'courseDetail', id: courseId }) : undefined}
                        onNavigateToPrevPaper={ctx && paperIds && ctx.position > 0
                            ? () => {
                                const prevId = paperIds[ctx.position - 1];
                                setView({ name: 'paper', id: prevId, courseContext: { ...ctx, position: ctx.position - 1 }, coursePaperIds: paperIds });
                              }
                            : undefined}
                        onNavigateToNextPaper={ctx && paperIds && ctx.position < ctx.total - 1
                            ? () => {
                                const nextId = paperIds[ctx.position + 1];
                                setView({ name: 'paper', id: nextId, courseContext: { ...ctx, position: ctx.position + 1 }, coursePaperIds: paperIds });
                              }
                            : undefined}
                    />
                );
            }
            case 'chat':
                return (
                    <Chatbot
                        messages={chatMessages}
                        setMessages={setChatMessages}
                        onOpenCitation={(paperId) => setView({ name: 'paper', id: String(paperId) })}
                    />
                );
            case 'groups':
                return <GroupsPage user={user} onSelectGroup={(id) => setView({ name: 'groupDetail', id })} onInvitationAction={refreshNotificationCounts} />;
            case 'groupDetail':
                return (
                    <GroupDetail
                        groupId={view.id}
                        user={user}
                        onBack={() => setView({ name: 'groups' })}
                        onSelectPaper={(id) => setView({ name: 'paper', id })}
                        onSummarize={(t) => setView({ name: 'writings', tool: 'summary', initialText: t })}
                        onParaphrase={(t) => setView({ name: 'writings', tool: 'paraphrase', initialText: t })}
                    />
                );
            case 'courseDetail':
                return (
                    <CourseDetail
                        courseId={view.id}
                        user={user}
                        onBack={() => setView({ name: 'readings', tab: 'courses' as ReadingsTab })}
                        onSelectPaper={(paperId, courseCtx) => {
                            const ids = courseCtx?.coursePaperIds;
                            const ctx = courseCtx ? {
                                courseId: courseCtx.courseId,
                                courseTitle: courseCtx.courseTitle,
                                position: courseCtx.position,
                                total: courseCtx.total,
                            } : undefined;
                            setView({ name: 'paper', id: String(paperId), courseContext: ctx, coursePaperIds: ids });
                        }}
                        onViewRoadmap={(courseId) => setView({ name: 'roadmap', activeCourseId: courseId })}
                    />
                );
            case 'readings':
                return (
                    <ReadingsPage
                        activeTab={view.tab}
                        onTabChange={(tab) => setView({ name: 'readings', tab })}
                        onSelectPaper={handleSelectPaper}
                        onSelectCourse={(courseId) => setView({ name: 'courseDetail', id: courseId })}
                    />
                );
            case 'writings':
                return (
                    <WritingsPage
                        activeTool={view.tool}
                        onToolChange={(tool) => setView({ name: 'writings', tool })}
                        initialText={view.initialText}
                    />
                );
            case 'roadmap':
                return (
                    <RoadmapPage
                        onNavigateToPaper={(id) => setView({ name: 'paper', id })}
                        onNavigateToSummary={(text) => setView({ name: 'writings', tool: 'summary', initialText: text })}
                        onAskLibrarian={(prompt) => {
                            queuePreferredLibrarianPrompt(prompt);
                            setView({ name: 'chat' });
                        }}
                        initialCourseId={view.activeCourseId}
                    />
                );
            case 'friends':
                return (
                    <FriendsActivity
                        user={user}
                        onSelectPaper={(id) => setView({ name: 'paper', id })}
                        onRefreshNotifications={refreshNotificationCounts}
                    />
                );
            case 'studytracker':
                return <StudyTracker user={user} />;
            /* Legacy redirects */
            case 'highlights':
                return (
                    <ReadingsPage
                        activeTab="highlights"
                        onTabChange={(tab) => setView({ name: 'readings', tab })}
                        onSelectPaper={handleSelectPaper}
                    />
                );
            case 'summary':
                return (
                    <WritingsPage
                        activeTool="summary"
                        onToolChange={(tool) => setView({ name: 'writings', tool })}
                        initialText={'initialText' in view ? view.initialText : undefined}
                    />
                );
            case 'paraphrase':
                return (
                    <WritingsPage
                        activeTool="paraphrase"
                        onToolChange={(tool) => setView({ name: 'writings', tool })}
                        initialText={'initialText' in view ? view.initialText : undefined}
                    />
                );
            case 'plagiarism':
                return (
                    <WritingsPage
                        activeTool="check"
                        onToolChange={(tool) => setView({ name: 'writings', tool })}
                    />
                );
            default:
                return (
                    <Home
                        user={user}
                        continueReading={continueReading}
                        onRemoveFromContinueReading={removeFromContinueReading}
                        onSelectPaper={handleSelectPaper}
                        onDeleteFromLibrary={removeFromContinueReading}
                        onNavigateToReadings={() => setView({ name: 'readings' })}
                        onNavigateToHighlights={() => setView({ name: 'readings', tab: 'highlights' })}
                        onNavigateToNotes={() => setView({ name: 'readings', tab: 'notes' })}
                        onNavigateToFriends={() => setView({ name: 'friends' })}
                        onNavigateToRoadmap={() => setView({ name: 'roadmap' })}
                    />
                );
        }
    }

    return (
        <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] font-sans">
            <Navbar
                currentView={view.name}
                setView={setView}
                onLogout={handleLogout}
                invitationCount={invitationCount}
                friendsPendingCount={friendsPendingCount}
                user={user}
                onUserUpdate={(u) => setUser(u)}
                onRefreshNotifications={refreshNotificationCounts}
                onOpenGuide={() => setIsGuideOpen(true)}
            />
            <main className="pt-16">
                <AnimatePresence mode="wait">
                    <PageTransition key={view.name}>
                        {renderView()}
                    </PageTransition>
                </AnimatePresence>
            </main>
            {showMusicPlayer && <RelaxingSoundsPlayer />}
            <OnboardingWizard
                isOpen={isGuideOpen}
                onClose={handleCloseGuide}
                onNavigate={(nextView) => setView(nextView)}
                userName={user?.name}
            />
        </div>
    );
};

export default App;
