// --- GATEWAY CLIENT + MOCK FALLBACK ---
// Provides hybrid data layer: attempts real backend via API Gateway first; falls back to local mock storage when offline.

import { Paper, User, StudyGroup, GroupInvitation, Highlight, HighlightGroup, GroupHighlight, GroupComment, RoadmapData, RoadmapStatus, MasteryStatus, MasteryUpdateResult, MasteryEvidence, Friendship, ReadingEvent, FriendsInsights, FriendRequestOut, FriendsCount, ActivityType, StudySession, WeeklySummary, ReadingSpeed, StudyPlan, PlanDiffSummary, Note, LibrarianCitation, Course, CourseProgress, CourseUploadResult } from '../types';
import type { HighlightColor } from '../lib/highlightColors';

// Base URL for FastAPI Gateway (defaults to local dev). Configure in .env.local as VITE_API_BASE_URL
const API_BASE: string = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000';
const TOKEN_STORAGE_KEY = 'mylibrary_token';
const REFRESH_TOKEN_KEY = 'mylibrary_refresh_token';

type FetchOptions = RequestInit & { auth?: boolean; _skipRefresh?: boolean };

const _tryRefresh = async (): Promise<string | null> => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;
    try {
        const resp = await fetchJSON<{ access_token: string; refresh_token: string }>(
            '/auth/refresh',
            { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }), _skipRefresh: true }
        );
        localStorage.setItem(TOKEN_STORAGE_KEY, resp.access_token);
        localStorage.setItem(REFRESH_TOKEN_KEY, resp.refresh_token);
        return resp.access_token;
    } catch {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        return null;
    }
};

export const fetchJSON = async <T>(path: string, opts: FetchOptions = {}): Promise<T> => {
    const url = `${API_BASE.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(opts.headers as Record<string, string> | undefined),
    };
    if (opts.auth) {
        const token = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    // Add timeout to prevent hanging
    // Use longer timeout for LLM-backed endpoints (librarian, summary)
    const isLongRunningEndpoint = path.includes('/librarian/') || path.includes('/summary/') || path.includes('/paraphrase/') || path.includes('/counter/') || path.includes('/notes-summary') || path.includes('/explain-concept') || path.includes('/color-summaries') || path.includes('/paper-summaries') || path.includes('/courses/') || path.includes('/quiz/generate-course');
    const timeoutMs = isLongRunningEndpoint ? 120000 : 5000; // 120s for LLM/course ops, 5s for others

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(url, { ...opts, headers, signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) {
            // Auto-refresh on 401 (expired access token) unless already retrying or on auth routes
            if (res.status === 401 && opts.auth && !opts._skipRefresh && !path.includes('/auth/')) {
                const newToken = await _tryRefresh();
                if (newToken) {
                    return fetchJSON<T>(path, { ...opts, _skipRefresh: true });
                }
            }
            let detail = '';
            try { detail = (await res.text()) || res.statusText; } catch {}
            throw new Error(detail || `Request failed: ${res.status}`);
        }
        const text = await res.text();
        return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
    } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            // More friendly error message
            if (isLongRunningEndpoint) {
                throw new Error('The request is taking longer than expected. Please try again in a moment.');
            } else {
                throw new Error('Request timeout - the service may be temporarily unavailable');
            }
        }
        // Handle network errors
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
            throw new Error('Network error - please check your connection and try again');
        }
        throw error;
    }
};

// --- MOCK DATABASE & PERSISTENCE (used when gateway unreachable) ---

// New internal type for stored users, including the password hash
interface StoredUser extends User {
  hashedPassword?: string;
}

const USERS_STORAGE_KEY = 'mylibrary_users';
const SESSION_STORAGE_KEY = 'mylibrary_session_email';
const GROUPS_STORAGE_KEY = 'mylibrary_groups';
const INVITATIONS_STORAGE_KEY = 'mylibrary_invitations';


// --- Storage Helper Functions ---
const getFromStorage = <T>(key: string, defaultValue: T): T => {
    try {
        const json = localStorage.getItem(key);
        return json ? JSON.parse(json) : defaultValue;
    } catch (e) {
        console.error(`Failed to parse ${key} from localStorage`, e);
        return defaultValue;
    }
};

const saveToStorage = <T>(key: string, data: T) => {
    localStorage.setItem(key, JSON.stringify(data));
};

const getUsers = (): StoredUser[] => getFromStorage<StoredUser[]>(USERS_STORAGE_KEY, []);
const saveUsers = (users: StoredUser[]) => saveToStorage(USERS_STORAGE_KEY, users);
const getGroups = (): StudyGroup[] => getFromStorage<StudyGroup[]>(GROUPS_STORAGE_KEY, []);
const saveGroups = (groups: StudyGroup[]) => saveToStorage(GROUPS_STORAGE_KEY, groups);
const getInvitations = (): GroupInvitation[] => getFromStorage<GroupInvitation[]>(INVITATIONS_STORAGE_KEY, []);
const saveInvitations = (invitations: GroupInvitation[]) => saveToStorage(INVITATIONS_STORAGE_KEY, invitations);


// --- MOCK HASHING (for demonstration purposes) ---
const FAKE_SALT = 'intellisalt_!@#';
const hashPassword = (pass: string) => {
    return [...pass].reverse().join('') + FAKE_SALT;
}


// --- EXISTING MOCK DATA ---
const allAuthorsList = [
    "Dr. Evelyn Reed", "Dr. Samuel Chen", "Dr. Maria Garcia", "Dr. Ben Carter", "Prof. Olivia White", 
    "Dr. Leo Kim", "Dr. Aisha Khan", "Dr. Tom Harris"
];
const subjects = ["Quantum Physics", "Machine Learning", "Marine Biology", "Ancient History", "Astrophysics", "Organic Chemistry"];
const mockPapers: Paper[] = [
    { id: '1', title: 'The Quantum Entanglement Phenomenon Revisited', authors: ['Dr. Evelyn Reed', 'Dr. Samuel Chen'], publicationYear: 2022, subject: 'Quantum Physics', summary: 'A deep dive into the complex nature of quantum entanglement, proposing a new theoretical framework.', fullText: 'Full text for The Quantum Entanglement Phenomenon Revisited...' },
    { id: '2', title: 'Neural Network Architectures for Image Recognition', authors: ['Dr. Maria Garcia', 'Dr. Ben Carter'], publicationYear: 2021, subject: 'Machine Learning', summary: 'This paper presents a novel convolutional neural network architecture that achieves state-of-the-art results on the ImageNet dataset.', fullText: 'Full text for Neural Network Architectures for Image Recognition...' },
    { id: '3', title: 'The Great Barrier Reef: A Study of Coral Bleaching', authors: ['Prof. Olivia White'], publicationYear: 2023, subject: 'Marine Biology', summary: 'An extensive study on the causes and effects of coral bleaching in the Great Barrier Reef, with proposed conservation strategies.', fullText: 'Full text for The Great Barrier Reef: A Study of Coral Bleaching...' },
    { id: '4', title: 'Roman Trade Routes in the 2nd Century AD', authors: ['Dr. Leo Kim'], publicationYear: 2020, subject: 'Ancient History', summary: 'An analysis of archaeological findings to map out the primary Roman trade routes during the Pax Romana.', fullText: 'Full text for Roman Trade Routes in the 2nd Century AD...' },
    { id: '5', title: 'Detecting Exoplanets using Transit Photometry', authors: ['Dr. Aisha Khan', 'Dr. Tom Harris'], publicationYear: 2022, subject: 'Astrophysics', summary: 'This paper details the methods and challenges of using transit photometry to discover and characterize planets orbiting other stars.', fullText: 'Full text for Detecting Exoplanets using Transit Photometry...' },
    { id: '6', title: 'Synthesis of Complex Organic Molecules', authors: ['Dr. Samuel Chen'], publicationYear: 2023, subject: 'Organic Chemistry', summary: 'A breakthrough in the synthesis of a complex natural product with potential therapeutic applications.', fullText: 'Full text for Synthesis of Complex Organic Molecules...' },
    { id: '7', title: 'The Impact of Machine Learning on Modern Physics', authors: ['Dr. Evelyn Reed', 'Dr. Maria Garcia'], publicationYear: 2023, subject: 'Machine Learning', summary: 'Exploring the intersection of AI and physics, this paper discusses how machine learning models are accelerating discovery in fields like particle physics and cosmology.', fullText: 'Full text for The Impact of Machine Learning on Modern Physics...' },
];


// --- API FUNCTIONS ---
const simulateNetworkDelay = (delay: number = 500) => new Promise(res => setTimeout(res, delay));

export const allAuthors = allAuthorsList;
export const getCategories = async (): Promise<string[]> => {
    try {
        const categories = await fetchJSON<string[]>('/api/categories', { method: 'GET', auth: true });
        return categories;
    } catch (err) {
        // Fallback to mock
        await simulateNetworkDelay();
        return subjects;
    }
};
export const getRecommendations = async (limit: number = 3): Promise<Paper[]> => {
    try {
        const papers = await fetchJSON<Array<{
            id: number;
            title: string;
            authors: string[];
            publication_year: number;
            subject: string;
            summary: string;
            full_text: string;
        }>>(`/api/papers/recommendations?limit=${limit}`, { method: 'GET', auth: true });
        return papers.map(p => ({
            id: String(p.id),
            title: p.title,
            authors: p.authors,
            publicationYear: p.publication_year,
            subject: p.subject,
            summary: p.summary,
            fullText: p.full_text
        }));
    } catch (err) {
        // Fallback to mock
        await simulateNetworkDelay(800);
        return [...mockPapers].sort(() => 0.5 - Math.random()).slice(0, limit);
    }
};

export interface SearchFilters {
    subject?: string;
    author?: string;
    startYear?: number;
    endYear?: number;
}

// --- REWRITTEN Search Function ---
export const searchPapers = async (query: string, filters: SearchFilters = {}): Promise<Paper[]> => {
    try {
        const params = new URLSearchParams();
        if (query) params.append('q', query);
        if (filters.subject) params.append('subject', filters.subject);
        if (filters.author) params.append('author', filters.author);
        if (filters.startYear) params.append('start_year', String(filters.startYear));
        if (filters.endYear) params.append('end_year', String(filters.endYear));
        
        const papers = await fetchJSON<Array<{
            id: number;
            title: string;
            authors: string[];
            publication_year: number;
            subject: string;
            summary: string;
            full_text: string;
        }>>(`/api/papers/search?${params.toString()}`, { method: 'GET', auth: true });
        
        return papers.map(p => ({
            id: String(p.id),
            title: p.title,
            authors: p.authors,
            publicationYear: p.publication_year,
            subject: p.subject,
            summary: p.summary,
            fullText: p.full_text
        }));
    } catch (err) {
        // Fallback to mock search logic
        await simulateNetworkDelay();
        
        let processedQuery = query.toLowerCase();
        
        // --- Intelligent Query Deconstruction ---
        let extractedAuthors: string[] = [];
        const authorMatch = processedQuery.match(/\bby\b\s(.*?)(?=\s—|\s\d{4}|$)/i);
        if (authorMatch && authorMatch[1]) {
            extractedAuthors = authorMatch[1].split(',').map(a => a.trim().toLowerCase());
            processedQuery = processedQuery.replace(authorMatch[0], '').trim();
        }

        let extractedYear: number | null = null;
        const yearMatch = processedQuery.match(/\b(\d{4})\b/);
        if (yearMatch && yearMatch[1]) {
            extractedYear = parseInt(yearMatch[1]);
            processedQuery = processedQuery.replace(yearMatch[0], '').trim();
        }
        
        const stopWords = new Set(['a', 'an', 'the', 'is', 'in', 'of', 'for', 'on', 'with', 'by', '—', '-']);
        const queryTokens = processedQuery.split(/\s+/).filter(token => token && !stopWords.has(token));

        let papersToFilter: Paper[];

        if (queryTokens.length > 0 || extractedAuthors.length > 0 || extractedYear !== null) {
            const scoredPapers = mockPapers.map(paper => {
                let score = 0;
                const title = paper.title.toLowerCase();
                const summary = paper.summary.toLowerCase();
                const authors = paper.authors.map(a => a.toLowerCase());

                queryTokens.forEach(token => {
                    if (title.includes(token)) score += 3;
                    if (summary.includes(token)) score += 0.5;
                    authors.forEach(author => {
                        if (author.includes(token)) score += 2;
                    });
                });

                extractedAuthors.forEach(extAuthor => {
                    if (authors.some(a => a.includes(extAuthor))) score += 5;
                });

                if (extractedYear && paper.publicationYear === extractedYear) {
                    score += 2;
                }

                return { paper, score };
            }).filter(item => item.score > 0);

            scoredPapers.sort((a, b) => b.score - a.score);
            papersToFilter = scoredPapers.map(item => item.paper);
        } else {
            papersToFilter = mockPapers;
        }
        
        const filteredResults = papersToFilter.filter(paper => {
            const subjectMatch = !filters.subject || paper.subject === filters.subject;
            const authorMatch = !filters.author || paper.authors.includes(filters.author);
            const startYearMatch = !filters.startYear || paper.publicationYear >= filters.startYear;
            const endYearMatch = !filters.endYear || paper.publicationYear <= filters.endYear;
            return subjectMatch && authorMatch && startYearMatch && endYearMatch;
        });

        return filteredResults;
    }
};


export const getPaperById = async (id: string): Promise<Paper | null> => {
    try {
        const paper = await fetchJSON<{
            id: number;
            title: string;
            authors: string[];
            publication_year: number;
            subject: string;
            summary: string;
            full_text: string;
            structured_content?: string | null;
        }>(`/api/papers/${id}`, { method: 'GET', auth: true });
        let raw: Paper['structuredContent'] = undefined;
        if (paper.structured_content != null) {
          try {
            raw = typeof paper.structured_content === 'string' ? JSON.parse(paper.structured_content) : paper.structured_content;
          } catch {
            raw = undefined;
          }
        }
        return {
            id: String(paper.id),
            title: paper.title,
            authors: paper.authors,
            publicationYear: paper.publication_year,
            subject: paper.subject,
            summary: paper.summary,
            fullText: paper.full_text,
            structuredContent: raw ?? null,
        };
    } catch (err) {
        // Fallback to mock
        await simulateNetworkDelay();
        return mockPapers.find(p => p.id === id) || null;
    }
}

/** Upload a PDF to the ingestion pipeline (extract + structure via Gemini). Returns the created paper. */
export const uploadPaperPdf = async (file: File): Promise<Paper> => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!token) throw new Error('Authentication required. Please login first.');
  const url = `${API_BASE.replace(/\/$/, '')}/api/papers/upload`;
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = j.detail || text;
    } catch {}
    throw new Error(typeof detail === 'string' ? detail : 'Upload failed');
  }
  const data = await res.json();
  const raw = data.structured_content ? (typeof data.structured_content === 'string' ? JSON.parse(data.structured_content) : data.structured_content) : undefined;
  return {
    id: String(data.id),
    title: data.title,
    authors: data.authors || [],
    publicationYear: data.publication_year ?? 0,
    subject: data.subject || 'General',
    summary: data.summary || '',
    fullText: data.full_text || '',
    structuredContent: raw ?? null,
  };
};

/** Delete a paper from the current user's library (and DB). */
export const deletePaper = async (paperId: string): Promise<void> => {
  await fetchJSON(`/api/papers/${paperId}`, { method: 'DELETE', auth: true });
};

/** Create a new paper in the current user's library (e.g. after uploading a PDF). */
export const createPaper = async (paper: {
    title: string;
    authors: string[];
    publicationYear: number;
    subject: string;
    summary: string;
    fullText: string;
}): Promise<Paper> => {
    const res = await fetchJSON<{
        id: number;
        title: string;
        authors: string[];
        publication_year: number;
        subject: string;
        summary: string;
        full_text: string;
    }>('/api/papers', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({
            title: paper.title,
            authors: paper.authors,
            publication_year: paper.publicationYear,
            subject: paper.subject,
            summary: paper.summary,
            full_text: paper.fullText,
        }),
    });
    return {
        id: String(res.id),
        title: res.title,
        authors: res.authors,
        publicationYear: res.publication_year,
        subject: res.subject,
        summary: res.summary,
        fullText: res.full_text,
    };
};

// --- REBUILT User Auth Functions ---

export const login = async (credentials: { email: string; pass: string }): Promise<User> => {
    // Attempt real backend via gateway
    try {
        const payload = { email: credentials.email, password: credentials.pass };
        const tokenResp = await fetchJSON<{ access_token: string; refresh_token: string; token_type: string }>(
            '/auth/login',
            { method: 'POST', body: JSON.stringify(payload) }
        );
        localStorage.setItem(TOKEN_STORAGE_KEY, tokenResp.access_token);
        if (tokenResp.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, tokenResp.refresh_token);
        const me = await fetchJSON<{ id: number; email: string; full_name?: string; is_active: boolean; created_at: string }>(
            '/auth/me',
            { method: 'GET', auth: true }
        );
        const mapped: User = { id: String(me.id), name: me.full_name || me.email.split('@')[0], email: me.email };
        localStorage.setItem(SESSION_STORAGE_KEY, mapped.email);
        return mapped;
    } catch (err) {
        // Fallback to mock local storage
        await simulateNetworkDelay(500);
        const users = getUsers();
        const user = users.find(u => u.email.toLowerCase() === credentials.email.toLowerCase());
        if (!user || !user.hashedPassword) throw new Error('Invalid email or password.');
        const hashedInputPassword = hashPassword(credentials.pass);
        if (user.hashedPassword !== hashedInputPassword) throw new Error('Invalid email or password.');
        localStorage.setItem(SESSION_STORAGE_KEY, user.email);
        const { hashedPassword, ...userToReturn } = user;
        return userToReturn;
    }
};

export const signup = async (details: { name: string, email: string; pass: string }): Promise<void> => {
    try {
        const payload = { email: details.email, password: details.pass, full_name: details.name };
        await fetchJSON('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
    } catch (err) {
        // Fallback to mock
        await simulateNetworkDelay(500);
        const users = getUsers();
        if (users.some(u => u.email.toLowerCase() === details.email.toLowerCase())) {
            throw new Error('An account with this email already exists.');
        }
        const hashedPassword = hashPassword(details.pass);
        const newUser: StoredUser = {
            id: `user_${Date.now()}`,
            name: details.name,
            email: details.email,
            hashedPassword,
        };
        users.push(newUser);
        saveUsers(users);
    }
};

export const updateProfile = async (payload: { full_name?: string; current_password?: string; new_password?: string }): Promise<User> => {
    const me = await fetchJSON<{ id: number; email: string; full_name?: string }>(
        '/auth/me',
        { method: 'PATCH', auth: true, body: JSON.stringify(payload) }
    );
    return { id: String(me.id), name: me.full_name || me.email.split('@')[0], email: me.email };
};

export const checkAuth = async (): Promise<User | null> => {
    // Try gateway first
    try {
        const token = localStorage.getItem(TOKEN_STORAGE_KEY);
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
        if (!token && !refreshToken) throw new Error('no token');
        // If access token missing but refresh token exists, try to restore session
        if (!token && refreshToken) {
            const newToken = await _tryRefresh();
            if (!newToken) throw new Error('refresh failed');
        }
        const me = await fetchJSON<{ id: number; email: string; full_name?: string }>(
            '/auth/me',
            { method: 'GET', auth: true }
        );
        return { id: String(me.id), name: me.full_name || me.email.split('@')[0], email: me.email };
    } catch {
        // Fallback
        await simulateNetworkDelay(150);
        const userEmail = localStorage.getItem(SESSION_STORAGE_KEY);
        if (!userEmail) return null;
        const users = getUsers();
        const currentUser = users.find(u => u.email === userEmail);
        if (!currentUser) {
            localStorage.removeItem(SESSION_STORAGE_KEY);
            return null;
        }
        const { hashedPassword, ...userToReturn } = currentUser;
        return userToReturn;
    }
};

export const logout = () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    // Fire-and-forget: revoke the refresh token on the server
    if (refreshToken) {
        fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
        }).catch(() => {});
    }
};

export const searchUsers = async (query: string, currentUser: User): Promise<User[]> => {
    try {
        if (!query || query.trim().length < 2) return [];
        
        const apiUsers = await fetchJSON<Array<{
            id: number;
            email: string;
            full_name: string | null;
        }>>(`/api/auth/users/search?q=${encodeURIComponent(query)}&exclude_user_id=${currentUser.id}`, {
            method: 'GET',
            auth: false  // Search endpoint doesn't require auth
        });
        
        return apiUsers.map(u => ({
            id: String(u.id),
            email: u.email,
            name: u.full_name || u.email.split('@')[0] || `User ${u.id}`
        }));
    } catch (err: any) {
        console.error("Error searching users:", err);
        // Fallback to mock
        await simulateNetworkDelay(300);
        if (!query) return [];
        const lowerCaseQuery = query.toLowerCase();
        const users = getUsers();
        return users
            .filter(u => u.id !== currentUser.id && (u.name.toLowerCase().includes(lowerCaseQuery) || u.email.toLowerCase().includes(lowerCaseQuery)))
            .map(({ hashedPassword, ...user }) => user);
    }
};

// --- Group and Invitation Functions ---

const mapGroupFromAPI = (apiGroup: {
    id: number;
    name: string;
    description: string;
    is_public: boolean;
    owner_id: number;
    members: Array<{ id: number; name: string; email: string }>;
    papers: Array<{ id: number; title: string; authors: string[]; publication_year: number; subject: string; summary: string; added_by?: number }>;
}): StudyGroup => {
    return {
        id: String(apiGroup.id),
        name: apiGroup.name,
        description: apiGroup.description,
        isPublic: apiGroup.is_public,
        ownerId: String(apiGroup.owner_id),
        members: apiGroup.members.map(m => ({ id: String(m.id), name: m.name, email: m.email })),
        papers: apiGroup.papers.map(p => ({
            id: String(p.id),
            title: p.title,
            authors: p.authors,
            publicationYear: p.publication_year,
            subject: p.subject,
            summary: p.summary,
            fullText: '', // Not included in group response
            addedBy: p.added_by ? String(p.added_by) : undefined
        } as Paper & { addedBy?: string }))
    };
};

export const createGroup = async (details: { name: string; description: string; isPublic: boolean }, owner: User): Promise<StudyGroup> => {
    try {
        const apiGroup = await fetchJSON<{
            id: number;
            name: string;
            description: string;
            is_public: boolean;
            owner_id: number;
            members: Array<{ id: number; name: string; email: string }>;
            papers: Array<any>;
        }>('/api/groups', {
            method: 'POST',
            body: JSON.stringify({
                name: details.name,
                description: details.description,
                is_public: details.isPublic
            }),
            auth: true
        });
        return mapGroupFromAPI(apiGroup);
    } catch (err) {
        // Fallback to mock
        await simulateNetworkDelay();
        const groups = getGroups();
        const newGroup: StudyGroup = {
            id: `group_${Date.now()}`,
            ...details,
            ownerId: owner.id,
            members: [owner],
            papers: [],
        };
        groups.push(newGroup);
        saveGroups(groups);
        return newGroup;
    }
}

export const getStudyGroups = async (userId: string): Promise<{ myGroups: StudyGroup[], publicGroups: StudyGroup[] }> => {
    try {
        const apiGroups = await fetchJSON<Array<{
            id: number;
            name: string;
            description: string;
            is_public: boolean;
            owner_id: number;
            members: Array<{ id: number; name: string; email: string }>;
            papers: Array<any>;
        }>>('/api/groups', { method: 'GET', auth: true });
        
        const allGroups = apiGroups.map(mapGroupFromAPI);
        const myGroups = allGroups.filter(g => g.members.some(m => m.id === userId));
        const publicGroups = allGroups.filter(g => g.isPublic && !g.members.some(m => m.id === userId));
        return { myGroups, publicGroups };
    } catch (err) {
        // Fallback to mock
        await simulateNetworkDelay();
        const allGroups = getGroups();
        const myGroups = allGroups.filter(g => g.members.some(m => m.id === userId));
        const publicGroups = allGroups.filter(g => g.isPublic && !g.members.some(m => m.id === userId));
        return { myGroups, publicGroups };
    }
}

export const getGroupById = async (id: string): Promise<StudyGroup | null> => {
    try {
        const apiGroup = await fetchJSON<{
            id: number;
            name: string;
            description: string;
            is_public: boolean;
            owner_id: number;
            members: Array<{ id: number; name: string; email: string }>;
            papers: Array<{ id: number; title: string; authors: string[]; publication_year: number; subject: string; summary: string; added_by?: number }>;
        }>(`/api/groups/${id}`, { method: 'GET', auth: true });
        return mapGroupFromAPI(apiGroup);
    } catch (err) {
        return null;
    }
}

export const joinPublicGroup = async (groupId: string): Promise<StudyGroup> => {
    const apiGroup = await fetchJSON<{
        id: number;
        name: string;
        description: string;
        is_public: boolean;
        owner_id: number;
        members: Array<{ id: number; name: string; email: string }>;
        papers: Array<{ id: number; title: string; authors: string[]; publication_year: number; subject: string; summary: string; added_by?: number }>;
    }>(`/api/groups/${groupId}/join`, {
        method: 'POST',
        auth: true
    });
    return mapGroupFromAPI(apiGroup);
};

export const getUserInvitations = async (userId: string): Promise<GroupInvitation[]> => {
    try {
        const apiInvitations = await fetchJSON<Array<{
            id: number;
            group_id: number;
            inviter_id: number;
            inviter_name?: string;
            inviter_email?: string;
            invited_user_id: number;
            status: string;
            group_name: string;
        }>>('/api/invitations', { method: 'GET', auth: true });
        
        return apiInvitations.map(inv => ({
            id: String(inv.id),
            groupId: String(inv.group_id),
            groupName: inv.group_name,
            inviter: { 
                id: String(inv.inviter_id), 
                name: inv.inviter_name || `User ${inv.inviter_id}`, 
                email: inv.inviter_email || `user${inv.inviter_id}@example.com` 
            },
            invitedUserId: String(inv.invited_user_id),
            status: inv.status as 'pending' | 'accepted' | 'declined'
        }));
    } catch (err) {
        // Fallback to mock
        await simulateNetworkDelay();
        return getInvitations().filter(inv => inv.invitedUserId === userId && inv.status === 'pending');
    }
}

export const inviteUserToGroup = async (groupId: string, inviter: User, invitedUser: User | { email: string } | { username: string }): Promise<void> => {
    try {
        // Determine if we have a User object or just email/username
        let email: string | undefined;
        let username: string | undefined;
        let invitedUserId: number | undefined;
        
        if ('id' in invitedUser) {
            // It's a User object
            invitedUserId = parseInt(invitedUser.id);
        } else if ('email' in invitedUser) {
            email = invitedUser.email;
        } else if ('username' in invitedUser) {
            username = invitedUser.username;
        }
        
        const body: any = {};
        if (invitedUserId) {
            body.invited_user_id = invitedUserId;
        } else if (email) {
            body.email = email;
        } else if (username) {
            body.username = username;
        } else {
            throw new Error("Must provide user ID, email, or username");
        }
        
        await fetchJSON(`/api/groups/${groupId}/invitations`, {
            method: 'POST',
            body: JSON.stringify(body),
            auth: true
        });
    } catch (err: any) {
        const errorMsg = err.message || (typeof err === 'string' ? err : 'Failed to invite user');
        throw new Error(errorMsg);
    }
};

export const leaveGroup = async (groupId: string, newOwnerId?: string): Promise<{ group_deleted?: boolean; new_owner_id?: number }> => {
    try {
        const url = newOwnerId 
            ? `/api/groups/${groupId}/leave?new_owner_id=${newOwnerId}`
            : `/api/groups/${groupId}/leave`;
        const result = await fetchJSON<{ status: string; message: string; group_deleted?: boolean; new_owner_id?: number }>(url, {
            method: 'DELETE',
            auth: true
        });
        return result;
    } catch (err: any) {
        const errorMsg = err.message || (typeof err === 'string' ? err : 'Failed to leave group');
        throw new Error(errorMsg);
    }
};

export const updateGroup = async (groupId: string, updates: { name?: string; description?: string; isPublic?: boolean }): Promise<StudyGroup> => {
    try {
        const apiGroup = await fetchJSON<{
            id: number;
            name: string;
            description: string;
            is_public: boolean;
            owner_id: number;
            members: Array<{ id: number; name: string; email: string }>;
            papers: Array<any>;
        }>(`/api/groups/${groupId}`, {
            method: 'PUT',
            body: JSON.stringify({
                name: updates.name,
                description: updates.description,
                is_public: updates.isPublic
            }),
            auth: true
        });
        return mapGroupFromAPI(apiGroup);
    } catch (err: any) {
        const errorMsg = err.message || (typeof err === 'string' ? err : 'Failed to update group');
        throw new Error(errorMsg);
    }
};

export const respondToInvitation = async (invitationId: string, response: 'accepted' | 'declined', userId: string): Promise<void> => {
    try {
        await fetchJSON(`/api/invitations/${invitationId}/respond`, {
            method: 'POST',
            body: JSON.stringify({ response }),
            auth: true
        });
    } catch (err) {
        // Fallback to mock
        await simulateNetworkDelay();
        const invitations = getInvitations();
        const invitationIndex = invitations.findIndex(inv => inv.id === invitationId && inv.invitedUserId === userId);
        if (invitationIndex === -1) throw new Error("Invitation not found.");

        invitations[invitationIndex].status = response;

        if (response === 'accepted') {
            const groups = getGroups();
            const group = groups.find(g => g.id === invitations[invitationIndex].groupId);
            const user = getUsers().find(u => u.id === userId);
            if (group && user) {
                const { hashedPassword, ...userToAdd } = user;
                group.members.push(userToAdd);
                saveGroups(groups);
            }
        }
        saveInvitations(invitations);
    }
};

// --- Highlights Functions ---

export const createHighlight = async (highlight: {
    paper_id: number;
    color: HighlightColor;
    highlighted_text: string;
    start_offset: number;
    end_offset: number;
    context_before?: string;
    context_after?: string;
}): Promise<Highlight> => {
    try {
        const apiHighlight = await fetchJSON<{
            id: number;
            user_id: number;
            paper_id: number;
            paper_title?: string;
            color: string;
            highlighted_text: string;
            start_offset: number;
            end_offset: number;
            context_before?: string;
            context_after?: string;
            created_at: string;
        }>('/api/highlights', {
            method: 'POST',
            body: JSON.stringify(highlight),
            auth: true
        });
        return {
            id: apiHighlight.id,
            paper_id: apiHighlight.paper_id,
            paper_title: apiHighlight.paper_title,
            color: apiHighlight.color as HighlightColor,
            highlighted_text: apiHighlight.highlighted_text,
            start_offset: apiHighlight.start_offset,
            end_offset: apiHighlight.end_offset,
            context_before: apiHighlight.context_before,
            context_after: apiHighlight.context_after,
            created_at: apiHighlight.created_at
        };
    } catch (err) {
        throw new Error('Failed to create highlight');
    }
};

export const getHighlights = async (paperId?: string, color?: string): Promise<Highlight[]> => {
    try {
        const params = new URLSearchParams();
        if (paperId) params.append('paper_id', paperId);
        if (color) params.append('color', color);
        
        const apiHighlights = await fetchJSON<Array<{
            id: number;
            user_id: number;
            paper_id: number;
            paper_title?: string;
            color: string;
            highlighted_text: string;
            start_offset: number;
            end_offset: number;
            context_before?: string;
            context_after?: string;
            created_at: string;
        }>>(`/api/highlights?${params.toString()}`, {
            method: 'GET',
            auth: true
        });
        
        return apiHighlights.map(h => ({
            id: h.id,
            paper_id: h.paper_id,
            paper_title: h.paper_title,
            color: h.color as HighlightColor,
            highlighted_text: h.highlighted_text,
            start_offset: h.start_offset,
            end_offset: h.end_offset,
            context_before: h.context_before,
            context_after: h.context_after,
            created_at: h.created_at
        }));
    } catch (err) {
        return [];
    }
};

export const getHighlightsGrouped = async (): Promise<HighlightGroup[]> => {
    try {
        const apiGroups = await fetchJSON<Array<{
            color: string;
            highlights: Array<{
                id: number;
                user_id: number;
                paper_id: number;
                paper_title?: string;
                color: string;
                highlighted_text: string;
                start_offset: number;
                end_offset: number;
                context_before?: string;
                context_after?: string;
                created_at: string;
            }>;
        }>>('/api/highlights/grouped', {
            method: 'GET',
            auth: true
        });
        
        return apiGroups.map(group => ({
            color: group.color as HighlightColor,
            highlights: group.highlights.map(h => ({
                id: h.id,
                paper_id: h.paper_id,
                paper_title: h.paper_title,
                color: h.color as HighlightColor,
                highlighted_text: h.highlighted_text,
                start_offset: h.start_offset,
                end_offset: h.end_offset,
                context_before: h.context_before,
                context_after: h.context_after,
                created_at: h.created_at
            }))
        }));
    } catch (err) {
        return [];
    }
};

export const deleteHighlight = async (highlightId: number): Promise<void> => {
    try {
        await fetchJSON(`/api/highlights/${highlightId}`, {
            method: 'DELETE',
            auth: true
        });
    } catch (err) {
        throw new Error('Failed to delete highlight');
    }
};

export const createNote = async (note: {
    paper_id: number;
    content: string;
    selected_text?: string;
    start_offset?: number;
    end_offset?: number;
    paragraph_index?: number;
}): Promise<Note> => {
    const apiNote = await fetchJSON<{
        id: number;
        user_id: number;
        paper_id: number;
        paper_title?: string;
        content: string;
        selected_text?: string | null;
        start_offset?: number | null;
        end_offset?: number | null;
        paragraph_index?: number | null;
        created_at: string;
        updated_at: string;
    }>('/api/notes', {
        method: 'POST',
        body: JSON.stringify(note),
        auth: true,
    });
    return {
        id: apiNote.id,
        paper_id: apiNote.paper_id,
        paper_title: apiNote.paper_title,
        content: apiNote.content,
        selected_text: apiNote.selected_text,
        start_offset: apiNote.start_offset,
        end_offset: apiNote.end_offset,
        paragraph_index: apiNote.paragraph_index,
        created_at: apiNote.created_at,
        updated_at: apiNote.updated_at,
    };
};

export const getNotes = async (paperId?: string): Promise<Note[]> => {
    try {
        const params = new URLSearchParams();
        if (paperId) params.append('paper_id', paperId);
        const apiNotes = await fetchJSON<Array<{
            id: number;
            user_id: number;
            paper_id: number;
            paper_title?: string;
            content: string;
            selected_text?: string | null;
            start_offset?: number | null;
            end_offset?: number | null;
            paragraph_index?: number | null;
            created_at: string;
            updated_at: string;
        }>>(`/api/notes${params.toString() ? `?${params.toString()}` : ''}`, {
            method: 'GET',
            auth: true,
        });
        return apiNotes.map((note) => ({
            id: note.id,
            paper_id: note.paper_id,
            paper_title: note.paper_title,
            content: note.content,
            selected_text: note.selected_text,
            start_offset: note.start_offset,
            end_offset: note.end_offset,
            paragraph_index: note.paragraph_index,
            created_at: note.created_at,
            updated_at: note.updated_at,
        }));
    } catch {
        return [];
    }
};

export const deleteNote = async (noteId: number): Promise<void> => {
    await fetchJSON(`/api/notes/${noteId}`, {
        method: 'DELETE',
        auth: true,
    });
};

// --- Highlight group titles (AI-generated, cached per paper+color) ---

export interface HighlightGroupTitle {
    color: HighlightColor;
    title: string;
    updated_at: string;
}

export interface LibraryHighlightGroupTitle extends HighlightGroupTitle {
    paper_id: number;
}

export const getHighlightGroupTitles = async (paperId: string): Promise<HighlightGroupTitle[]> => {
    try {
        const rows = await fetchJSON<Array<{ color: string; title: string; updated_at: string }>>(
            `/api/highlights/titles?paper_id=${encodeURIComponent(paperId)}`,
            { method: 'GET', auth: true }
        );
        return rows.map(r => ({
            color: r.color as HighlightGroupTitle['color'],
            title: r.title,
            updated_at: r.updated_at,
        }));
    } catch (err) {
        return [];
    }
};

export const refreshHighlightGroupTitles = async (paperId: string): Promise<HighlightGroupTitle[]> => {
    const rows = await fetchJSON<Array<{ color: string; title: string; updated_at: string }>>(
        `/api/highlights/titles/refresh?paper_id=${encodeURIComponent(paperId)}`,
        { method: 'POST', auth: true }
    );
    return rows.map(r => ({
        color: r.color as HighlightGroupTitle['color'],
        title: r.title,
        updated_at: r.updated_at,
    }));
};

export const getAllHighlightGroupTitles = async (): Promise<LibraryHighlightGroupTitle[]> => {
    try {
        const rows = await fetchJSON<Array<{ paper_id: number; color: string; title: string; updated_at: string }>>(
            '/api/highlights/titles/all',
            { method: 'GET', auth: true }
        );
        return rows.map(r => ({
            paper_id: r.paper_id,
            color: r.color as HighlightGroupTitle['color'],
            title: r.title,
            updated_at: r.updated_at,
        }));
    } catch (err) {
        return [];
    }
};

export const refreshAllHighlightGroupTitles = async (): Promise<LibraryHighlightGroupTitle[]> => {
    const rows = await fetchJSON<Array<{ paper_id: number; color: string; title: string; updated_at: string }>>(
        '/api/highlights/titles/refresh-all',
        { method: 'POST', auth: true }
    );
    return rows.map(r => ({
        paper_id: r.paper_id,
        color: r.color as HighlightGroupTitle['color'],
        title: r.title,
        updated_at: r.updated_at,
    }));
};

// --- Persistent highlight color summaries (MyHighlights page) ---

export interface HighlightColorSummary {
    color: string;
    summary: string;
    updated_at: string;
}

export const getHighlightColorSummaries = async (): Promise<HighlightColorSummary[]> => {
    try {
        return await fetchJSON<HighlightColorSummary[]>('/api/highlights/color-summaries', { method: 'GET', auth: true });
    } catch {
        return [];
    }
};

export const upsertHighlightColorSummary = async (color: string): Promise<HighlightColorSummary> => {
    return fetchJSON<HighlightColorSummary>(`/api/highlights/color-summaries/${encodeURIComponent(color)}`, {
        method: 'POST',
        auth: true,
    });
};

// --- Persistent notes paper summaries (MyNotes page) ---

export interface NotesPaperSummary {
    paper_id: number;
    summary: string;
    updated_at: string;
}

export const getNotesPaperSummaries = async (): Promise<NotesPaperSummary[]> => {
    try {
        return await fetchJSON<NotesPaperSummary[]>('/api/notes/paper-summaries', { method: 'GET', auth: true });
    } catch {
        return [];
    }
};

export const upsertNotesPaperSummary = async (paperId: number): Promise<NotesPaperSummary> => {
    return fetchJSON<NotesPaperSummary>(`/api/notes/paper-summaries/${paperId}`, {
        method: 'POST',
        auth: true,
    });
};

// --- Group Document Management ---

export const addPaperToGroup = async (groupId: string, paperId: string): Promise<void> => {
    try {
        await fetchJSON(`/api/groups/${groupId}/papers`, {
            method: 'POST',
            body: JSON.stringify({ paper_id: parseInt(paperId) }),
            auth: true
        });
    } catch (err: any) {
        const errorMsg = err.message || (typeof err === 'string' ? err : 'Failed to add paper to group');
        throw new Error(errorMsg);
    }
};

export const removePaperFromGroup = async (groupId: string, paperId: string): Promise<void> => {
    try {
        await fetchJSON(`/api/groups/${groupId}/papers/${paperId}`, {
            method: 'DELETE',
            auth: true
        });
    } catch (err: any) {
        throw new Error(err.message || 'Failed to remove paper from group');
    }
};

export const getGroupPaperById = async (groupId: string, paperId: string): Promise<Paper | null> => {
    try {
        const paper = await fetchJSON<{
            id: number;
            title: string;
            authors: string[];
            publication_year: number;
            subject: string;
            summary: string;
            full_text: string;
        }>(`/api/groups/${groupId}/papers/${paperId}`, { method: 'GET', auth: true });
        return {
            id: String(paper.id),
            title: paper.title,
            authors: paper.authors,
            publicationYear: paper.publication_year,
            subject: paper.subject,
            summary: paper.summary,
            fullText: paper.full_text,
        };
    } catch {
        return null;
    }
};

// --- Group Shared Highlights ---

export const createGroupHighlight = async (groupId: string, highlight: {
    paper_id: number;
    color: HighlightColor;
    highlighted_text: string;
    start_offset: number;
    end_offset: number;
    context_before?: string;
    context_after?: string;
}): Promise<GroupHighlight> => {
    try {
        const apiHighlight = await fetchJSON<{
            id: number;
            group_id: number;
            paper_id: number;
            user_id: number;
            user_name?: string;
            color: string;
            highlighted_text: string;
            start_offset: number;
            end_offset: number;
            context_before?: string;
            context_after?: string;
            created_at: string;
        }>(`/api/groups/${groupId}/highlights`, {
            method: 'POST',
            body: JSON.stringify(highlight),
            auth: true
        });
        return {
            id: apiHighlight.id,
            group_id: apiHighlight.group_id,
            paper_id: apiHighlight.paper_id,
            user_id: apiHighlight.user_id,
            user_name: apiHighlight.user_name,
            color: apiHighlight.color as HighlightColor,
            highlighted_text: apiHighlight.highlighted_text,
            start_offset: apiHighlight.start_offset,
            end_offset: apiHighlight.end_offset,
            context_before: apiHighlight.context_before,
            context_after: apiHighlight.context_after,
            created_at: apiHighlight.created_at
        };
    } catch (err) {
        throw new Error('Failed to create group highlight');
    }
};

export const getGroupPaperHighlights = async (groupId: string, paperId: string): Promise<GroupHighlight[]> => {
    try {
        const apiHighlights = await fetchJSON<Array<{
            id: number;
            group_id: number;
            paper_id: number;
            user_id: number;
            user_name?: string;
            color: string;
            highlighted_text: string;
            start_offset: number;
            end_offset: number;
            context_before?: string;
            context_after?: string;
            created_at: string;
        }>>(`/api/groups/${groupId}/papers/${paperId}/highlights`, {
            method: 'GET',
            auth: true
        });
        return apiHighlights.map(h => ({
            id: h.id,
            group_id: h.group_id,
            paper_id: h.paper_id,
            user_id: h.user_id,
            user_name: h.user_name,
            color: h.color as HighlightColor,
            highlighted_text: h.highlighted_text,
            start_offset: h.start_offset,
            end_offset: h.end_offset,
            context_before: h.context_before,
            context_after: h.context_after,
            created_at: h.created_at
        }));
    } catch (err) {
        return [];
    }
};

export const deleteGroupHighlight = async (groupId: string, highlightId: number): Promise<void> => {
    try {
        await fetchJSON(`/api/groups/${groupId}/highlights/${highlightId}`, {
            method: 'DELETE',
            auth: true
        });
    } catch (err) {
        throw new Error('Failed to delete group highlight');
    }
};

// --- Group Shared Comments ---

export const createGroupComment = async (groupId: string, comment: {
    paper_id: number;
    commented_text: string;
    comment_text: string;
    start_offset: number;
    end_offset: number;
    context_before?: string;
    context_after?: string;
}): Promise<GroupComment> => {
    try {
        const apiComment = await fetchJSON<{
            id: number;
            group_id: number;
            paper_id: number;
            user_id: number;
            user_name?: string;
            commented_text: string;
            comment_text: string;
            start_offset: number;
            end_offset: number;
            context_before?: string;
            context_after?: string;
            created_at: string;
            updated_at: string;
        }>(`/api/groups/${groupId}/comments`, {
            method: 'POST',
            body: JSON.stringify(comment),
            auth: true
        });
        return {
            id: apiComment.id,
            group_id: apiComment.group_id,
            paper_id: apiComment.paper_id,
            user_id: apiComment.user_id,
            user_name: apiComment.user_name,
            commented_text: apiComment.commented_text,
            comment_text: apiComment.comment_text,
            start_offset: apiComment.start_offset,
            end_offset: apiComment.end_offset,
            context_before: apiComment.context_before,
            context_after: apiComment.context_after,
            created_at: apiComment.created_at,
            updated_at: apiComment.updated_at
        };
    } catch (err) {
        throw new Error('Failed to create group comment');
    }
};

export const getGroupPaperComments = async (groupId: string, paperId: string): Promise<GroupComment[]> => {
    try {
        const apiComments = await fetchJSON<Array<{
            id: number;
            group_id: number;
            paper_id: number;
            user_id: number;
            user_name?: string;
            commented_text: string;
            comment_text: string;
            start_offset: number;
            end_offset: number;
            context_before?: string;
            context_after?: string;
            created_at: string;
            updated_at: string;
        }>>(`/api/groups/${groupId}/papers/${paperId}/comments`, {
            method: 'GET',
            auth: true
        });
        return apiComments.map(c => ({
            id: c.id,
            group_id: c.group_id,
            paper_id: c.paper_id,
            user_id: c.user_id,
            user_name: c.user_name,
            commented_text: c.commented_text,
            comment_text: c.comment_text,
            start_offset: c.start_offset,
            end_offset: c.end_offset,
            context_before: c.context_before,
            context_after: c.context_after,
            created_at: c.created_at,
            updated_at: c.updated_at
        }));
    } catch (err) {
        return [];
    }
};

export const updateGroupComment = async (groupId: string, commentId: number, commentText: string): Promise<GroupComment> => {
    try {
        const apiComment = await fetchJSON<{
            id: number;
            group_id: number;
            paper_id: number;
            user_id: number;
            user_name?: string;
            commented_text: string;
            comment_text: string;
            start_offset: number;
            end_offset: number;
            context_before?: string;
            context_after?: string;
            created_at: string;
            updated_at: string;
        }>(`/api/groups/${groupId}/comments/${commentId}`, {
            method: 'PUT',
            body: JSON.stringify({ comment_text: commentText }),
            auth: true
        });
        return {
            id: apiComment.id,
            group_id: apiComment.group_id,
            paper_id: apiComment.paper_id,
            user_id: apiComment.user_id,
            user_name: apiComment.user_name,
            commented_text: apiComment.commented_text,
            comment_text: apiComment.comment_text,
            start_offset: apiComment.start_offset,
            end_offset: apiComment.end_offset,
            context_before: apiComment.context_before,
            context_after: apiComment.context_after,
            created_at: apiComment.created_at,
            updated_at: apiComment.updated_at
        };
    } catch (err) {
        throw new Error('Failed to update group comment');
    }
};

// --- Librarian / Chat Functions ---

export interface Conversation {
    id: number;
    user_id: number;
    created_at: string;
    title?: string | null;
    messages: Array<{
        id: number;
        conversation_id: number;
        role: 'user' | 'assistant' | 'system';
        content: string;
        metadata?: {
            citations?: LibrarianCitation[];
        } | null;
        created_at: string;
    }>;
}

export interface ImportedConversationMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface SendMessageResponse {
    conversation_id: number;
    message: {
        id: number;
        conversation_id: number;
        role: 'user' | 'assistant' | 'system';
        content: string;
        metadata?: {
            citations?: LibrarianCitation[];
        } | null;
        created_at: string;
    };
    assistant_message: {
        id: number;
        conversation_id: number;
        role: 'user' | 'assistant' | 'system';
        content: string;
        metadata?: {
            citations?: LibrarianCitation[];
        } | null;
        created_at: string;
    };
}

export const createConversation = async (): Promise<Conversation> => {
    try {
        const conv = await fetchJSON<{
            id: number;
            user_id: number;
            created_at: string;
            messages: any[];
        }>('/api/librarian/conversations', {
            method: 'POST',
            auth: true
        });
        return conv;
    } catch (err: any) {
        throw new Error(err.message || 'Failed to create conversation');
    }
};

export const importConversation = async (
    title: string,
    messages: ImportedConversationMessage[],
): Promise<Conversation> => {
    try {
        const conv = await fetchJSON<Conversation>('/api/librarian/conversations/import', {
            method: 'POST',
            auth: true,
            body: JSON.stringify({ title, messages }),
        });
        return conv;
    } catch (err: any) {
        throw new Error(err.message || 'Failed to save conversation');
    }
};

export const getConversations = async (): Promise<Conversation[]> => {
    try {
        const convs = await fetchJSON<Array<{
            id: number;
            user_id: number;
            created_at: string;
            messages: Array<{
                id: number;
                conversation_id: number;
                role: string;
                content: string;
                metadata?: {
                    citations?: LibrarianCitation[];
                } | null;
                created_at: string;
            }>;
        }>>('/api/librarian/conversations', {
            method: 'GET',
            auth: true
        });
        return convs;
    } catch (err: any) {
        throw new Error(err.message || 'Failed to get conversations');
    }
};

export const getConversation = async (conversationId: number): Promise<Conversation> => {
    try {
        const conv = await fetchJSON<{
            id: number;
            user_id: number;
            created_at: string;
            messages: Array<{
                id: number;
                conversation_id: number;
                role: string;
                content: string;
                metadata?: {
                    citations?: LibrarianCitation[];
                } | null;
                created_at: string;
            }>;
        }>(`/api/librarian/conversations/${conversationId}`, {
            method: 'GET',
            auth: true
        });
        return conv;
    } catch (err: any) {
        throw new Error(err.message || 'Failed to get conversation');
    }
};

export const sendMessage = async (content: string, conversationId?: number): Promise<SendMessageResponse> => {
    try {
        const response = await fetchJSON<SendMessageResponse>('/api/librarian/messages', {
            method: 'POST',
            body: JSON.stringify({
                content,
                conversation_id: conversationId || null
            }),
            auth: true
        });
        return response;
    } catch (err: any) {
        throw new Error(err.message || 'Failed to send message');
    }
};

export const deleteConversation = async (conversationId: number): Promise<void> => {
    try {
        await fetchJSON(`/api/librarian/conversations/${conversationId}`, {
            method: 'DELETE',
            auth: true
        });
    } catch (err: any) {
        throw new Error(err.message || 'Failed to delete conversation');
    }
};

export const renameConversation = async (conversationId: number, title: string): Promise<Conversation> => {
    try {
        const conv = await fetchJSON<Conversation>(`/api/librarian/conversations/${conversationId}`, {
            method: 'PATCH',
            body: JSON.stringify({ title: title.trim() }),
            auth: true
        });
        return conv;
    } catch (err: any) {
        throw new Error(err.message || 'Failed to rename conversation');
    }
};

export const deleteGroupComment = async (groupId: string, commentId: number): Promise<void> => {
    try {
        await fetchJSON(`/api/groups/${groupId}/comments/${commentId}`, {
            method: 'DELETE',
            auth: true
        });
    } catch (err) {
        throw new Error('Failed to delete group comment');
    }
};

// ── Knowledge Roadmap API ──────────────────────────────────────────────────────

export const getRoadmap = async (): Promise<RoadmapData> => {
    return fetchJSON<RoadmapData>('/api/roadmap', { auth: true });
};

export const getLibraryPaperCount = async (): Promise<number> => {
    try {
        const papers = await fetchJSON<{ id: number }[]>('/api/papers?limit=100', { auth: true });
        return Array.isArray(papers) ? papers.length : 0;
    } catch {
        return 0;
    }
};

export const generateRoadmap = async (): Promise<{ status: string; message: string }> => {
    return fetchJSON<{ status: string; message: string }>('/api/roadmap/generate', {
        method: 'POST',
        auth: true,
    });
};

export const getRoadmapStatus = async (): Promise<RoadmapStatus> => {
    return fetchJSON<RoadmapStatus>('/api/roadmap/status', { auth: true });
};

export const trackPaperView = async (paperId: string): Promise<void> => {
    try {
        await fetchJSON(`/api/roadmap/track-view?paper_id=${paperId}`, {
            method: 'POST',
            auth: true,
        });
    } catch {
        // Non-critical — silently ignore tracking failures
    }
};

export const getMasteryStatus = async (paperId: string): Promise<MasteryStatus> => {
    return fetchJSON<MasteryStatus>(`/api/papers/${paperId}/mastery-status`, { auth: true });
};

export const getRoadmapMasteryEvidence = async (paperIds: string[]): Promise<Record<string, MasteryEvidence>> => {
    if (paperIds.length === 0) return {};
    const params = new URLSearchParams({ paper_ids: paperIds.join(',') });
    return fetchJSON<Record<string, MasteryEvidence>>(`/api/roadmap/mastery-evidence?${params}`, { auth: true });
};

/** Batch mastery for list UIs: paper_ids=1,2,3 → { "1": { is_mastered: bool }, ... } */
export const getMasteryBatch = async (paperIds: string[]): Promise<Record<string, { is_mastered: boolean }>> => {
    if (paperIds.length === 0) return {};
    const params = new URLSearchParams({ paper_ids: paperIds.join(',') });
    return fetchJSON<Record<string, { is_mastered: boolean }>>(`/api/roadmap/mastery-batch?${params}`, { auth: true });
};

export type AiFeedbackFeature = 'summary' | 'paraphrase' | 'librarian' | 'roadmap' | 'quiz' | 'group-summary' | 'paper-notes-summary' | 'counterarguments';

export const submitAiFeedback = async (payload: {
    feature: AiFeedbackFeature | string;
    context_id?: string;
    rating: 'helpful' | 'not_helpful';
    metadata?: Record<string, unknown>;
}): Promise<{ ok: boolean }> => {
    return fetchJSON('/api/ai-feedback', {
        method: 'POST',
        auth: true,
        body: JSON.stringify(payload),
    });
};

export const markPaperMastered = async (paperId: string): Promise<{ success: boolean; concepts_upgraded: string[]; count: number }> => {
    return fetchJSON(`/api/papers/${paperId}/mark-mastered`, { method: 'POST', auth: true });
};

export const undoPaperMastered = async (paperId: string): Promise<{ success: boolean }> => {
    return fetchJSON(`/api/papers/${paperId}/undo-mastered`, { method: 'POST', auth: true });
};

export const submitQuizResult = async (paperId: string, correct: number, total: number): Promise<{ ok: boolean; cumulative_correct: number; can_mark_mastered: boolean }> => {
    return fetchJSON(`/api/quiz/submit-result?paper_id=${paperId}&correct=${correct}&total=${total}`, {
        method: 'POST',
        auth: true,
    });
};

export const getMasteryUpdate = async (): Promise<MasteryUpdateResult> => {
    return fetchJSON<MasteryUpdateResult>('/api/roadmap/mastery-update', { auth: true });
};

export const explainConcept = async (conceptName: string, subject: string): Promise<{ explanation: string }> => {
    return fetchJSON('/api/roadmap/explain-concept', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({ concept_name: conceptName, subject }),
    });
};


// ── Personalized Study Plans (Roadmap) ────────────────────────────────────────

export const generateStudyPlan = async (input: {
    hoursPerWeek: number;
    startsAt?: string;
    examDate?: string;
    examTopics?: string[];
}): Promise<StudyPlan> => {
    const body: any = { hours_per_week: input.hoursPerWeek };
    if (input.startsAt) body.starts_at = input.startsAt;
    if (input.examDate) body.exam_date = input.examDate;
    if (input.examTopics?.length) body.exam_topics = input.examTopics;
    return fetchJSON<StudyPlan>('/api/roadmap/plans/generate', {
        method: 'POST',
        auth: true,
        body: JSON.stringify(body),
    });
};

export const getActiveStudyPlan = async (): Promise<StudyPlan | null> => {
    try {
        return await fetchJSON<StudyPlan>('/api/roadmap/plans/active', { auth: true });
    } catch (err: any) {
        // 404 => no active plan
        if (typeof err?.message === 'string' && /404/.test(err.message)) {
            return null;
        }
        // Generic not-found wording from backend
        if (typeof err?.message === 'string' && err.message.toLowerCase().includes('no active study plan')) {
            return null;
        }
        throw err;
    }
};

export const updateStudyPlanTask = async (
    planId: number,
    taskId: number,
    updates: { status?: 'pending' | 'done' | 'skipped'; actualMinutes?: number },
): Promise<StudyPlan> => {
    const payload: any = {};
    if (updates.status) payload.status = updates.status;
    if (typeof updates.actualMinutes === 'number') payload.actual_minutes = updates.actualMinutes;
    return fetchJSON<StudyPlan>(`/api/roadmap/plans/${planId}/tasks/${taskId}`, {
        method: 'PATCH',
        auth: true,
        body: JSON.stringify(payload),
    });
};

export const recomputeStudyPlan = async (planId: number): Promise<{ plan: StudyPlan; diff: PlanDiffSummary }> => {
    const res = await fetchJSON<{ plan: StudyPlan; diff: PlanDiffSummary }>(
        `/api/roadmap/plans/${planId}/recompute`,
        { method: 'POST', auth: true },
    );
    return res;
};


// ─── FRIENDS & READING ACTIVITY ──────────────────────────────────────────────

const FRIENDS_STORAGE_KEY = 'mylibrary_friends';
const ACTIVITY_STORAGE_KEY = 'mylibrary_reading_activity';

const getFriendshipsStore = (): { followerId: string; followingId: string }[] =>
    getFromStorage(FRIENDS_STORAGE_KEY, []);
const saveFriendshipsStore = (data: { followerId: string; followingId: string }[]) =>
    saveToStorage(FRIENDS_STORAGE_KEY, data);
const getActivities = (): ReadingEvent[] => getFromStorage(ACTIVITY_STORAGE_KEY, []);
const saveActivities = (data: ReadingEvent[]) => saveToStorage(ACTIVITY_STORAGE_KEY, data);

/** Send a connection request (other user must accept to become friends). */
export const sendConnectionRequest = async (targetUserId: string): Promise<void> => {
    try {
        await fetchJSON('/api/friends/request', {
            method: 'POST',
            body: JSON.stringify({ target_user_id: Number(targetUserId) }),
            auth: true,
        });
    } catch (err: any) {
        const isNetworkError = !err?.message || err.message.includes('Network error') ||
            err.message.includes('timeout') || err.message.includes('Failed to fetch');
        if (!isNetworkError) throw err;
        await simulateNetworkDelay(300);
        const sessionEmail = localStorage.getItem(SESSION_STORAGE_KEY);
        const me = getUsers().find(u => u.email === sessionEmail);
        if (!me) throw new Error('Not logged in');
        const links = getFriendshipsStore();
        if (links.some(l => l.followerId === me.id && l.followingId === targetUserId)) {
            throw new Error('Connection request already sent');
        }
        links.push({ followerId: me.id, followingId: targetUserId });
        saveFriendshipsStore(links);
    }
};

/** Legacy: alias for sendConnectionRequest. */
export const followUser = sendConnectionRequest;

export const getIncomingRequests = async (): Promise<FriendRequestOut[]> => {
    try {
        const data = await fetchJSON<any[]>('/api/friends/requests/incoming', { auth: true });
        return data.map(r => ({
            id: r.id,
            from_user_id: r.from_user_id,
            to_user_id: r.to_user_id,
            from_user_name: r.from_user_name,
            from_user_email: r.from_user_email,
            status: r.status,
            created_at: r.created_at,
            responded_at: r.responded_at ?? null,
        }));
    } catch {
        return [];
    }
};

export const getSentRequests = async (): Promise<FriendRequestOut[]> => {
    try {
        const data = await fetchJSON<any[]>('/api/friends/requests/sent', { auth: true });
        return data.map(r => ({
            id: r.id,
            from_user_id: r.from_user_id,
            to_user_id: r.to_user_id,
            from_user_name: r.from_user_name,
            from_user_email: r.from_user_email,
            status: r.status,
            created_at: r.created_at,
            responded_at: r.responded_at ?? null,
        }));
    } catch {
        return [];
    }
};

export const acceptConnectionRequest = async (requestId: number): Promise<void> => {
    await fetchJSON(`/api/friends/requests/${requestId}/accept`, { method: 'POST', auth: true });
};

export const rejectConnectionRequest = async (requestId: number): Promise<void> => {
    await fetchJSON(`/api/friends/requests/${requestId}/reject`, { method: 'POST', auth: true });
};

export const cancelConnectionRequest = async (requestId: number): Promise<void> => {
    await fetchJSON(`/api/friends/requests/${requestId}`, { method: 'DELETE', auth: true });
};

export const getFriendsCount = async (): Promise<FriendsCount> => {
    try {
        const data = await fetchJSON<any>('/api/friends/followers/count', { auth: true });
        return {
            friends: data.friends ?? 0,
            pending_incoming: data.pending_incoming ?? 0,
            pending_sent: data.pending_sent ?? 0,
        };
    } catch {
        return { friends: 0, pending_incoming: 0, pending_sent: 0 };
    }
};

export const disconnectUser = async (targetUserId: string): Promise<void> => {
    try {
        await fetchJSON(`/api/friends/disconnect/${targetUserId}`, { method: 'DELETE', auth: true });
    } catch (err: any) {
        const isNetworkError = !err?.message || err.message.includes('Network error') || err.message.includes('timeout') || err.message.includes('Failed to fetch');
        if (!isNetworkError) throw err;
        await simulateNetworkDelay(300);
        const me = getUsers().find(u => u.email === localStorage.getItem(SESSION_STORAGE_KEY));
        if (!me) throw new Error('Not logged in');
        const links = getFriendshipsStore().filter(
            l => !(l.followerId === me.id && l.followingId === targetUserId) && !(l.followerId === targetUserId && l.followingId === me.id)
        );
        saveFriendshipsStore(links);
    }
};

/** Unfollow/disconnect (removes mutual friendship). */
export const unfollowUser = async (targetUserId: string): Promise<void> => {
    try {
        await fetchJSON(`/api/friends/disconnect/${targetUserId}`, { method: 'DELETE', auth: true });
    } catch {
        try {
            await fetchJSON(`/api/friends/unfollow/${targetUserId}`, { method: 'DELETE', auth: true });
        } catch (err: any) {
            const isNetworkError = !err?.message || err.message.includes('Network error') || err.message.includes('timeout') || err.message.includes('Failed to fetch');
            if (!isNetworkError) throw err;
            await simulateNetworkDelay(300);
            const me = getUsers().find(u => u.email === localStorage.getItem(SESSION_STORAGE_KEY));
            if (!me) throw new Error('Not logged in');
            const links = getFriendshipsStore().filter(
                l => !(l.followerId === me.id && l.followingId === targetUserId)
            );
            saveFriendshipsStore(links);
        }
    }
};

export const getFriends = async (userId: string): Promise<Friendship[]> => {
    try {
        const data = await fetchJSON<any[]>('/api/friends/', { auth: true });
        return data.map(f => ({
            id: String(f.id),
            friendId: String(f.friend_id),
            friendName: f.friend_name,
            friendEmail: f.friend_email,
            since: f.since,
        }));
    } catch {
        await simulateNetworkDelay(300);
        const links = getFriendshipsStore().filter(l => l.followerId === userId);
        const users = getUsers();
        return links.map((l, i) => {
            const friend = users.find(u => u.id === l.followingId);
            return {
                id: `f_${i}`,
                friendId: l.followingId,
                friendName: friend?.name ?? 'Unknown',
                friendEmail: friend?.email ?? '',
                since: new Date().toISOString(),
            };
        });
    }
};

export const logReadingActivity = async (paperId: string, paperTitle: string, action: string, userName: string = ''): Promise<void> => {
    try {
        await fetchJSON(`/api/activity/?user_name=${encodeURIComponent(userName)}`, {
            method: 'POST',
            body: JSON.stringify({ paper_id: paperId, paper_title: paperTitle, action }),
            auth: true,
        });
    } catch {
        const sessionEmail = localStorage.getItem(SESSION_STORAGE_KEY);
        const me = getUsers().find(u => u.email === sessionEmail);
        const activities = getActivities();
        activities.unshift({
            id: `act_${Date.now()}`,
            userId: me?.id ?? '0',
            userName: me?.name ?? userName,
            paperId,
            paperTitle,
            action: action as ReadingEvent['action'],
            timestamp: new Date().toISOString(),
        });
        saveActivities(activities);
    }
};

export const getFriendsFeed = async (userId: string, skip: number = 0, limit: number = 50): Promise<ReadingEvent[]> => {
    try {
        const data = await fetchJSON<any[]>(`/api/activity/feed?skip=${skip}&limit=${limit}`, { auth: true });
        return data.map(a => ({
            id: String(a.id),
            userId: String(a.user_id),
            userName: a.user_name,
            paperId: a.paper_id,
            paperTitle: a.paper_title,
            action: a.action,
            timestamp: a.created_at,
        }));
    } catch {
        await simulateNetworkDelay(400);
        const links = getFriendshipsStore().filter(l => l.followerId === userId);
        const friendIds = new Set(links.map(l => l.followingId));
        return getActivities()
            .filter(a => friendIds.has(a.userId))
            .slice(skip, skip + limit);
    }
};

export const getFriendsInsights = async (userId: string): Promise<FriendsInsights> => {
    try {
        const data = await fetchJSON<any>('/api/activity/insights', { auth: true });
        return {
            trendingPapers: (data.trending_papers || []).map((p: any) => ({
                paperId: p.paper_id,
                title: p.title,
                readCount: p.read_count,
            })),
            trendingSubjects: (data.trending_subjects || []).map((s: any) => ({
                subject: s.subject,
                count: s.count,
                total_seconds: s.total_seconds,
            })),
            mostActiveReaders: (data.most_active_readers || []).map((r: any) => ({
                userId: String(r.user_id),
                name: r.name,
                count: r.count,
            })),
            mostActiveReadersByTime: (data.most_active_readers_by_time || []).map((r: any) => ({
                userId: String(r.user_id),
                name: r.name,
                totalSeconds: r.total_seconds,
                formatted: r.formatted,
            })),
        };
    } catch {
        await simulateNetworkDelay(400);
        const links = getFriendshipsStore().filter(l => l.followerId === userId);
        const friendIds = new Set(links.map(l => l.followingId));
        const activities = getActivities().filter(a => friendIds.has(a.userId));

        const paperCounts: Record<string, { title: string; count: number }> = {};
        activities.forEach(a => {
            if (!paperCounts[a.paperId]) paperCounts[a.paperId] = { title: a.paperTitle, count: 0 };
            paperCounts[a.paperId].count++;
        });
        const trendingPapers = Object.entries(paperCounts)
            .map(([paperId, v]) => ({ paperId, title: v.title, readCount: v.count }))
            .sort((a, b) => b.readCount - a.readCount)
            .slice(0, 10);

        const readerCounts: Record<string, { name: string; count: number }> = {};
        activities.forEach(a => {
            if (!readerCounts[a.userId]) readerCounts[a.userId] = { name: a.userName, count: 0 };
            readerCounts[a.userId].count++;
        });
        const mostActiveReaders = Object.entries(readerCounts)
            .map(([userId, v]) => ({ userId, name: v.name, count: v.count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        return { trendingPapers, trendingSubjects: [], mostActiveReaders, mostActiveReadersByTime: [] };
    }
};


// ─── STUDY TIME TRACKER ──────────────────────────────────────────────────────

const TRACKER_SESSIONS_KEY = 'mylibrary_tracker_sessions';

const getTrackerSessions = (): StudySession[] => getFromStorage(TRACKER_SESSIONS_KEY, []);
const saveTrackerSessions = (data: StudySession[]) => saveToStorage(TRACKER_SESSIONS_KEY, data);

function _fmtDuration(secs: number): string {
    if (secs < 60) return `${Math.round(secs)}s`;
    const mins = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hours > 0) return `${hours}h ${remMins}m`;
    return `${remMins}m`;
}

function _getMondayOfWeek(offset: number = 0): Date {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    if (offset > 0) monday.setDate(monday.getDate() - offset * 7);
    return monday;
}

function notifyStudyTrackerRefresh(): void {
    try {
        window.dispatchEvent(new CustomEvent('study-tracker-refresh'));
    } catch {}
}

export const startStudySession = async (
    activityType: ActivityType,
    category: string | null = null,
    paperId: string | null = null,
): Promise<StudySession | null> => {
    try {
        const data = await fetchJSON<any>('/api/tracker/sessions/start', {
            method: 'POST',
            body: JSON.stringify({ activity_type: activityType, category, paper_id: paperId }),
            auth: true,
        });
        notifyStudyTrackerRefresh();
        return {
            id: String(data.id),
            userId: String(data.user_id),
            activityType: data.activity_type,
            category: data.category,
            paperId: data.paper_id,
            startedAt: data.started_at,
            endedAt: data.ended_at,
            durationSecs: data.duration_secs,
        };
    } catch {
        const sessionEmail = localStorage.getItem(SESSION_STORAGE_KEY);
        const me = getUsers().find(u => u.email === sessionEmail);
        if (!me) return null;
        const sessions = getTrackerSessions();
        const openIdx = sessions.findIndex(s => s.userId === me.id && !s.endedAt);
        if (openIdx !== -1) {
            const open = sessions[openIdx];
            open.endedAt = new Date().toISOString();
            open.durationSecs = (Date.now() - new Date(open.startedAt).getTime()) / 1000;
        }
        const newSession: StudySession = {
            id: `ts_${Date.now()}`,
            userId: me.id,
            activityType,
            category,
            paperId,
            startedAt: new Date().toISOString(),
            endedAt: null,
            durationSecs: null,
        };
        sessions.push(newSession);
        saveTrackerSessions(sessions);
        notifyStudyTrackerRefresh();
        return newSession;
    }
};

export const endStudySession = async (): Promise<void> => {
    try {
        await fetchJSON('/api/tracker/sessions/end', { method: 'POST', auth: true });
        notifyStudyTrackerRefresh();
    } catch {
        const sessionEmail = localStorage.getItem(SESSION_STORAGE_KEY);
        const me = getUsers().find(u => u.email === sessionEmail);
        if (!me) return;
        const sessions = getTrackerSessions();
        const openIdx = sessions.findIndex(s => s.userId === me.id && !s.endedAt);
        if (openIdx !== -1) {
            sessions[openIdx].endedAt = new Date().toISOString();
            sessions[openIdx].durationSecs = (Date.now() - new Date(sessions[openIdx].startedAt).getTime()) / 1000;
            saveTrackerSessions(sessions);
            notifyStudyTrackerRefresh();
        }
    }
};

export const getWeeklySummary = async (userId: string, weekOffset: number = 0): Promise<WeeklySummary> => {
    try {
        const data = await fetchJSON<any>(`/api/tracker/weekly?week_offset=${weekOffset}`, { auth: true });
        return {
            weekStart: data.week_start,
            weekEnd: data.week_end,
            totalSeconds: data.total_seconds,
            totalFormatted: data.total_formatted,
            byActivity: (data.by_activity || []).map((a: any) => ({
                activityType: a.activity_type,
                totalSeconds: a.total_seconds,
                formatted: a.formatted,
            })),
            byCategory: (data.by_category || []).map((c: any) => ({
                category: c.category,
                totalSeconds: c.total_seconds,
                formatted: c.formatted,
            })),
            daily: (data.daily || []).map((d: any) => ({
                date: d.date,
                totalSeconds: d.total_seconds,
                formatted: d.formatted,
            })),
        };
    } catch {
        const monday = _getMondayOfWeek(weekOffset);
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        const sessions = getTrackerSessions().filter(s => {
            if (s.userId !== userId || !s.durationSecs) return false;
            const start = new Date(s.startedAt).getTime();
            return start >= monday.getTime() && start <= sunday.getTime();
        });

        let totalSecs = 0;
        const activityMap: Record<string, number> = {};
        const categoryMap: Record<string, number> = {};
        const dailyMap: Record<string, number> = {};

        sessions.forEach(s => {
            const dur = s.durationSecs!;
            totalSecs += dur;
            activityMap[s.activityType] = (activityMap[s.activityType] || 0) + dur;
            if (s.activityType === 'reading' && s.category) {
                categoryMap[s.category] = (categoryMap[s.category] || 0) + dur;
            }
            const dayKey = new Date(s.startedAt).toISOString().split('T')[0];
            dailyMap[dayKey] = (dailyMap[dayKey] || 0) + dur;
        });

        const byActivity = Object.entries(activityMap)
            .map(([activityType, totalSeconds]) => ({ activityType, totalSeconds, formatted: _fmtDuration(totalSeconds) }))
            .sort((a, b) => b.totalSeconds - a.totalSeconds);

        const byCategory = Object.entries(categoryMap)
            .map(([category, totalSeconds]) => ({ category, totalSeconds, formatted: _fmtDuration(totalSeconds) }))
            .sort((a, b) => b.totalSeconds - a.totalSeconds);

        const daily: { date: string; totalSeconds: number; formatted: string }[] = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(d.getDate() + i);
            const key = d.toISOString().split('T')[0];
            const secs = dailyMap[key] || 0;
            daily.push({ date: key, totalSeconds: secs, formatted: _fmtDuration(secs) });
        }

        return {
            weekStart: monday.toISOString().split('T')[0],
            weekEnd: sunday.toISOString().split('T')[0],
            totalSeconds: totalSecs,
            totalFormatted: _fmtDuration(totalSecs),
            byActivity,
            byCategory,
            daily,
        };
    }
};

export const getReadingSpeed = async (): Promise<ReadingSpeed> => {
    try {
        const data = await fetchJSON<any>('/api/tracker/reading-speed', { auth: true });
        return {
            wordsPerMinute: data.words_per_minute,
            sampleSize: data.sample_size,
            defaultUsed: data.default_used,
        };
    } catch {
        const sessionEmail = localStorage.getItem(SESSION_STORAGE_KEY);
        const me = getUsers().find(u => u.email === sessionEmail);
        const sessions = getTrackerSessions().filter(s =>
            (!!me ? s.userId === me.id : true) &&
            s.activityType === 'reading' &&
            !!s.paperId &&
            !!s.durationSecs,
        );
        const sampleSize = sessions.length;
        const totalMinutes = sessions.reduce((sum, session) => sum + ((session.durationSecs || 0) / 60), 0);
        if (sampleSize < 3 || totalMinutes < 5) {
            return {
                wordsPerMinute: 220,
                sampleSize,
                defaultUsed: true,
            };
        }

        const wordCountCache: Record<string, number> = {};
        for (const session of sessions) {
            if (!session.paperId) continue;
            if (!wordCountCache[session.paperId]) {
                const paper = mockPapers.find(p => p.id === session.paperId);
                if (!paper) {
                    return {
                        wordsPerMinute: 220,
                        sampleSize,
                        defaultUsed: true,
                    };
                }
                wordCountCache[session.paperId] = paper.fullText.split(/\s+/).filter(Boolean).length;
            }
        }

        const totalWords = sessions.reduce((sum, session) => {
            if (!session.paperId) return sum;
            return sum + (wordCountCache[session.paperId] || 0);
        }, 0);

        if (totalWords <= 0 || totalMinutes <= 0) {
            return {
                wordsPerMinute: 220,
                sampleSize,
                defaultUsed: true,
            };
        }

        return {
            wordsPerMinute: Math.round((totalWords / totalMinutes) * 10) / 10,
            sampleSize,
            defaultUsed: false,
        };
    }
};

// ── Course API ────────────────────────────────────────────────────────────────

export const getCourses = async (): Promise<Course[]> => {
    return fetchJSON<Course[]>('/api/courses', { auth: true });
};

export const getCourse = async (courseId: number): Promise<Course> => {
    return fetchJSON<Course>(`/api/courses/${courseId}`, { auth: true });
};

export const createCourse = async (data: { name: string; description?: string; syllabusFile?: File }): Promise<Course> => {
    const form = new FormData();
    form.append('name', data.name);
    if (data.description) form.append('description', data.description);
    if (data.syllabusFile) form.append('syllabus_file', data.syllabusFile);

    const token = localStorage.getItem('mylibrary_token');
    const res = await fetch(`${API_BASE}/api/courses`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
};

export const updateCourse = async (courseId: number, data: { name?: string; description?: string }): Promise<Course> => {
    return fetchJSON<Course>(`/api/courses/${courseId}`, {
        method: 'PUT',
        auth: true,
        body: JSON.stringify(data),
    });
};

export const deleteCourse = async (courseId: number): Promise<void> => {
    await fetchJSON(`/api/courses/${courseId}`, { method: 'DELETE', auth: true });
};

export const addPaperToCourse = async (courseId: number, paperId: number, paperTitle?: string): Promise<void> => {
    await fetchJSON(`/api/courses/${courseId}/papers`, {
        method: 'POST',
        auth: true,
        body: JSON.stringify({ paper_id: paperId, paper_title: paperTitle }),
    });
};

export const removePaperFromCourse = async (courseId: number, paperId: number): Promise<void> => {
    await fetchJSON(`/api/courses/${courseId}/papers/${paperId}`, { method: 'DELETE', auth: true });
};

export const uploadBulkToCourse = async (
    courseId: number,
    files: File[],
    onProgress?: (done: number, total: number, result: CourseUploadResult) => void
): Promise<CourseUploadResult[]> => {
    const token = localStorage.getItem('mylibrary_token');
    const form = new FormData();
    files.forEach(f => form.append('files', f));

    const res = await fetch(`${API_BASE}/api/courses/${courseId}/upload-bulk`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.results as CourseUploadResult[];
};

export const getCourseProgress = async (courseId: number): Promise<CourseProgress> => {
    return fetchJSON<CourseProgress>(`/api/courses/${courseId}/progress`, { auth: true });
};

export const getCourseHighlights = async (courseId: number): Promise<Highlight[]> => {
    const raw = await fetchJSON<any[]>(`/api/courses/${courseId}/highlights`, { auth: true });
    return raw.map(h => ({
        id: h.id,
        paper_id: h.paper_id,
        paper_title: h.paper_title,
        color: h.color as HighlightColor,
        highlighted_text: h.highlighted_text,
        start_offset: h.start_offset,
        end_offset: h.end_offset,
        context_before: h.context_before,
        context_after: h.context_after,
        created_at: h.created_at,
    }));
};

export const getCourseNotes = async (courseId: number): Promise<Note[]> => {
    const raw = await fetchJSON<any[]>(`/api/courses/${courseId}/notes`, { auth: true });
    return raw.map(n => ({
        id: n.id,
        paper_id: n.paper_id,
        paper_title: n.paper_title,
        content: n.content,
        selected_text: n.selected_text,
        start_offset: n.start_offset,
        end_offset: n.end_offset,
        paragraph_index: n.paragraph_index,
        created_at: n.created_at,
        updated_at: n.updated_at,
    }));
};

export const generateCourseOverview = async (courseId: number): Promise<{ overview: string }> => {
    return fetchJSON(`/api/courses/${courseId}/generate-overview`, { method: 'POST', auth: true });
};

export const generateCourseReadingOrder = async (courseId: number): Promise<{ reading_order: number[] }> => {
    return fetchJSON(`/api/courses/${courseId}/generate-order`, { method: 'POST', auth: true });
};

export const getCourseRoadmap = async (courseId: number): Promise<RoadmapData> => {
    return fetchJSON<RoadmapData>(`/api/courses/${courseId}/roadmap`, { auth: true });
};

export const generateCourseRoadmap = async (courseId: number): Promise<void> => {
    await fetchJSON(`/api/courses/${courseId}/roadmap/generate`, { method: 'POST', auth: true });
};

export const getCourseStudyPlan = async (courseId: number): Promise<StudyPlan | null> => {
    try {
        return await fetchJSON<StudyPlan>(`/api/courses/${courseId}/study-plan`, { auth: true });
    } catch {
        return null;
    }
};

export const generateCourseStudyPlan = async (courseId: number, hoursPerWeek: number = 10): Promise<StudyPlan> => {
    return fetchJSON<StudyPlan>(`/api/courses/${courseId}/study-plan/generate?hours_per_week=${hoursPerWeek}`, {
        method: 'POST',
        auth: true,
    });
};

export const regenerateCourse = async (courseId: number): Promise<void> => {
    await fetchJSON(`/api/courses/${courseId}/regenerate`, { method: 'POST', auth: true });
};

export const getCourseFullPapers = async (courseId: number): Promise<Paper[]> => {
    const raw = await fetchJSON<any[]>(`/api/courses/${courseId}/papers-full`, { auth: true });
    return raw.map(p => ({
        id: String(p.id),
        title: p.title,
        authors: p.authors || [],
        publicationYear: p.publication_year,
        subject: p.subject,
        summary: p.summary,
        fullText: p.full_text,
        structuredContent: p.structured_content,
        coursePosition: p.course_position,
        weekNumber: p.week_number,
        sectionName: p.section_name,
    }));
};

export const generateCourseQuiz = async (
    papers: Array<{ title: string; text: string }>,
    totalQuestions: number = 10,
    difficultyMix?: { easy?: number; normal?: number; hard?: number }
): Promise<any[]> => {
    const data = await fetchJSON<{ questions: any[] }>('/api/quiz/generate-course', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({ papers, total_questions: totalQuestions, difficulty_mix: difficultyMix || {} }),
    });
    return data.questions;
};

// ── End course API ─────────────────────────────────────────────────────────────

export const getSessionHistory = async (userId: string): Promise<StudySession[]> => {
    try {
        const data = await fetchJSON<any[]>('/api/tracker/sessions/history?limit=50', { auth: true });
        return data.map(s => ({
            id: String(s.id),
            userId: String(s.user_id),
            activityType: s.activity_type,
            category: s.category,
            paperId: s.paper_id,
            startedAt: s.started_at,
            endedAt: s.ended_at,
            durationSecs: s.duration_secs,
        }));
    } catch {
        return getTrackerSessions()
            .filter(s => s.userId === userId && s.durationSecs)
            .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
            .slice(0, 50);
    }
};
