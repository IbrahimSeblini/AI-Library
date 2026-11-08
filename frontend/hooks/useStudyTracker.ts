import { useEffect, useRef, useCallback } from 'react';
import { ActivityType } from '../types';
import { startStudySession, endStudySession } from '../services/apiService';

export function useStudyTracker(
    viewName: string,
    paperSubject: string | null = null,
    paperId: string | null = null,
) {
    const prevView = useRef<string | null>(null);
    const prevSubject = useRef<string | null>(null);
    const prevPaperId = useRef<string | null>(null);

    const mapViewToActivity = useCallback((name: string): ActivityType => {
        switch (name) {
            case 'paper':
                return 'reading';
            case 'chat':
                return 'chatbot';
            case 'groups':
            case 'groupDetail':
                return 'groups';
            case 'plagiarism':
            case 'writings':
                return 'plagiarism';
            case 'home':
            default:
                return 'home';
        }
    }, []);

    useEffect(() => {
        const activity = mapViewToActivity(viewName);
        const category = activity === 'reading' ? paperSubject : null;
        const paper = activity === 'reading' ? paperId : null;

        if (
            viewName === prevView.current &&
            paperSubject === prevSubject.current &&
            paperId === prevPaperId.current
        ) {
            return;
        }

        prevView.current = viewName;
        prevSubject.current = paperSubject;
        prevPaperId.current = paperId;

        startStudySession(activity, category, paper).catch(() => {});
    }, [viewName, paperSubject, paperId, mapViewToActivity]);

    useEffect(() => {
        const handleUnload = () => {
            const token = localStorage.getItem('mylibrary_token');
            if (token) {
                const url = `${(import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000'}/api/tracker/sessions/end`;
                const blob = new Blob(['{}'], { type: 'application/json' });
                try { navigator.sendBeacon(url, blob); } catch {}
            }
            endStudySession().catch(() => {});
        };

        window.addEventListener('beforeunload', handleUnload);
        return () => {
            window.removeEventListener('beforeunload', handleUnload);
            endStudySession().catch(() => {});
        };
    }, []);
}
