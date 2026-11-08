import { fetchJSON } from './apiService';
import { PaperNotesSummary, GroupNotesSummary } from '../types';

export const getPaperNotesSummary = (groupId: string, paperId: string): Promise<PaperNotesSummary> =>
    fetchJSON<PaperNotesSummary>(`/api/groups/${groupId}/papers/${paperId}/notes-summary`, { method: 'GET', auth: true });

export const regeneratePaperNotesSummary = (groupId: string, paperId: string): Promise<PaperNotesSummary> =>
    fetchJSON<PaperNotesSummary>(`/api/groups/${groupId}/papers/${paperId}/notes-summary`, { method: 'POST', auth: true });

export const getGroupNotesSummary = (groupId: string): Promise<GroupNotesSummary> =>
    fetchJSON<GroupNotesSummary>(`/api/groups/${groupId}/notes-summary`, { method: 'GET', auth: true });

export const regenerateGroupNotesSummary = (groupId: string): Promise<GroupNotesSummary> =>
    fetchJSON<GroupNotesSummary>(`/api/groups/${groupId}/notes-summary`, { method: 'POST', auth: true });

export const regenerateAllGroupNotesSummaries = (groupId: string): Promise<GroupNotesSummary> =>
    fetchJSON<GroupNotesSummary>(`/api/groups/${groupId}/notes-summary/regenerate-all`, { method: 'POST', auth: true });
