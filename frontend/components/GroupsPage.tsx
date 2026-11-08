import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StudyGroup, User, GroupInvitation } from '../types';
import { getStudyGroups, getUserInvitations, respondToInvitation, createGroup, joinPublicGroup } from '../services/apiService';
import { LoaderIcon } from './icons/LoaderIcon';
import { UsersIcon } from './icons/UsersIcon';
import { PlusIcon } from './icons/PlusIcon';
import { XIcon } from './icons/XIcon';
import { SearchIcon } from './icons/SearchIcon';

function getInitial(name: string): string {
  return (name || '?').charAt(0).toUpperCase();
}

// ── Section persistence ───────────────────────────────────────────────────────

interface GroupSection {
  id: string;
  name: string;
  groupIds: string[];
}

function sectionsKey(userId: string) {
  return `mylibrary_group_sections_${userId}`;
}
function loadSections(userId: string): GroupSection[] {
  try {
    const raw = localStorage.getItem(sectionsKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveSections(userId: string, sections: GroupSection[]) {
  try { localStorage.setItem(sectionsKey(userId), JSON.stringify(sections)); } catch {}
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface GroupsPageProps {
  user: User;
  onSelectGroup: (id: string) => void;
  onInvitationAction: () => void;
}

// ── GroupCard ─────────────────────────────────────────────────────────────────

const GroupCard: React.FC<{
  group: StudyGroup;
  onSelect: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  canJoin?: boolean;
  isJoining?: boolean;
  onJoin?: () => void;
}> = ({ group, onSelect, onDragStart, canJoin, isJoining, onJoin }) => {
  const members = group.members.slice(0, 4);
  return (
    <motion.div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onClick={onSelect}
      className="group cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 transition-all duration-200 hover:border-[var(--primary)]/50 hover:bg-[var(--bg-secondary)]/35 select-none"
      whileTap={{ y: 0 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            {onDragStart && <span className="text-[var(--text-muted)] opacity-40 group-hover:opacity-80" title="Drag to organize">::</span>}
            <h3 className="truncate text-base font-bold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors">{group.name}</h3>
          </div>
          <p className="text-sm text-[var(--text-muted)] line-clamp-2">{group.description || 'No description yet.'}</p>
        </div>
        <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold ${
          group.isPublic
            ? 'bg-[var(--success)]/10 text-[var(--success)]'
            : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
        }`}>
          {group.isPublic ? 'Public' : 'Private'}
        </span>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex -space-x-2">
          {members.length > 0
            ? members.map((m, i) => (
                <div key={m.id} className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--surface)] bg-[var(--bg-secondary)] text-[10px] font-bold text-[var(--text)]" style={{ zIndex: members.length - i }} title={m.name}>
                  {getInitial(m.name)}
                </div>
              ))
            : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-secondary)]">
                  <UsersIcon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                </div>
              )}
          </div>
          <span className="truncate text-xs text-[var(--text-muted)]">{group.members.length} member{group.members.length !== 1 ? 's' : ''}</span>
        </div>

        {canJoin ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onJoin?.();
            }}
            disabled={isJoining}
            className="min-h-[34px] rounded-md px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: 'var(--gradient-primary)' }}
          >
            {isJoining ? 'Joining...' : 'Join'}
          </button>
        ) : (
          <span className="text-xs font-medium text-[var(--primary)] opacity-0 transition-opacity group-hover:opacity-100">Open</span>
        )}
      </div>
    </motion.div>
  );
};

// ── CreateGroupModal ──────────────────────────────────────────────────────────

const CreateGroupModal: React.FC<{ user: User; onClose: () => void; onGroupCreated: (g: StudyGroup) => void }> = ({ user, onClose, onGroupCreated }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const newGroup = await createGroup({ name, description, isPublic }, user);
      onGroupCreated(newGroup);
    } catch (error) {
      console.error('Failed to create group', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--surface)] rounded-lg shadow-2xl w-full max-w-lg border border-[var(--border)]">
        <div className="p-6 border-b border-[var(--border)] flex justify-between items-center">
          <h2 className="text-xl font-bold text-[var(--text)] font-display">Create a New Group</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"><XIcon className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-[var(--text-muted)] text-sm font-semibold mb-2" htmlFor="groupName">Group Name</label>
              <input id="groupName" type="text" value={name} onChange={e => setName(e.target.value)} required className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg w-full py-2 px-3 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]" />
            </div>
            <div>
              <label className="block text-[var(--text-muted)] text-sm font-semibold mb-2" htmlFor="groupDesc">Description</label>
              <textarea id="groupDesc" value={description} onChange={e => setDescription(e.target.value)} required rows={3} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg w-full py-2 px-3 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]" />
            </div>
            <div className="flex items-center space-x-3">
              <input type="checkbox" id="isPublic" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="h-4 w-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]" />
              <label htmlFor="isPublic" className="text-[var(--text)]">Public (discoverable by anyone)</label>
            </div>
          </div>
          <div className="p-6 bg-[var(--bg-secondary)] border-t border-[var(--border)] rounded-b-lg text-right">
            <button type="submit" disabled={isCreating} className="text-white font-bold py-2 px-5 rounded-lg disabled:opacity-60 transition-opacity" style={{ background: 'var(--gradient-primary)' }}>
              {isCreating ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── SectionBlock ──────────────────────────────────────────────────────────────

const SectionBlock: React.FC<{
  section: GroupSection;
  groups: StudyGroup[];
  onSelect: (id: string) => void;
  onDragGroupStart: (groupId: string) => void;
  onDrop: (sectionId: string) => void;
  onRename: (sectionId: string, name: string) => void;
  onDelete: (sectionId: string) => void;
}> = ({ section, groups, onSelect, onDragGroupStart, onDrop, onRename, onDelete }) => {
  const [dragOver, setDragOver] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(section.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commitRename = () => {
    const trimmed = nameVal.trim();
    if (trimmed && trimmed !== section.name) onRename(section.id, trimmed);
    else setNameVal(section.name);
    setEditing(false);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onDrop(section.id); }}
      className={`rounded-lg transition-all duration-150 ${dragOver ? 'bg-[var(--primary)]/5 ring-2 ring-[var(--primary)]/40' : ''}`}
    >
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3 group/section">
        <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
        {editing ? (
          <input
            ref={inputRef}
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setNameVal(section.name); setEditing(false); } }}
            className="text-xs font-semibold bg-[var(--surface)] border border-[var(--primary)] rounded-md px-2 py-0.5 text-[var(--text)] focus:outline-none w-32"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors px-1 whitespace-nowrap"
            title="Click to rename"
          >
            {section.name}
          </button>
        )}
        <span className="text-xs text-[var(--text-muted)] opacity-60">{groups.length}</span>
        <button
          onClick={() => onDelete(section.id)}
          className="opacity-0 group-hover/section:opacity-100 text-[var(--text-muted)] hover:text-[var(--danger)] transition-all p-0.5 rounded"
          title="Delete section"
        >
          <XIcon className="w-3 h-3" />
        </button>
        <div className="h-px w-4" style={{ background: 'var(--border)' }} />
      </div>

      {/* Groups grid or drop hint */}
      {groups.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map(g => (
            <GroupCard
              key={g.id}
              group={g}
              onSelect={() => onSelect(g.id)}
              onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragGroupStart(g.id); }}
            />
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center h-14 rounded-lg border border-dashed border-[var(--border)] text-xs text-[var(--text-muted)]">
          Drop groups here
        </div>
      )}
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const GroupsPage: React.FC<GroupsPageProps> = ({ user, onSelectGroup, onInvitationAction }) => {
  const [myGroups, setMyGroups] = useState<StudyGroup[]>([]);
  const [publicGroups, setPublicGroups] = useState<StudyGroup[]>([]);
  const [invitations, setInvitations] = useState<GroupInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [groupSearch, setGroupSearch] = useState('');
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);

  // Sections
  const [sections, setSections] = useState<GroupSection[]>(() => loadSections(user.id));
  const [activeFilter, setActiveFilter] = useState<string | null>(null); // null = All
  const [newSectionName, setNewSectionName] = useState('');
  const [addingSection, setAddingSection] = useState(false);
  const newSectionRef = useRef<HTMLInputElement>(null);

  // Drag state
  const draggingGroupId = useRef<string | null>(null);

  // Persist sections whenever they change
  useEffect(() => { saveSections(user.id, sections); }, [user.id, sections]);
  useEffect(() => { if (addingSection) newSectionRef.current?.focus(); }, [addingSection]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [{ myGroups: mg, publicGroups: pg }, invites] = await Promise.all([
        getStudyGroups(user.id),
        getUserInvitations(user.id),
      ]);
      setMyGroups(mg);
      setPublicGroups(pg);
      setInvitations(invites);
    } catch (error) {
      console.error('Failed to fetch group data', error);
    } finally {
      setIsLoading(false);
    }
  }, [user.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleInvitationResponse = async (id: string, response: 'accepted' | 'declined') => {
    try {
      await respondToInvitation(id, response, user.id);
      await fetchData();
      onInvitationAction();
    } catch (error) {
      console.error('Failed to respond to invitation', error);
    }
  };

  const handleGroupCreated = (newGroup: StudyGroup) => {
    setMyGroups(prev => [newGroup, ...prev]);
    setShowCreateModal(false);
  };

  const handleJoinPublicGroup = async (groupId: string) => {
    setJoiningGroupId(groupId);
    try {
      const joined = await joinPublicGroup(groupId);
      setMyGroups(prev => [joined, ...prev.filter(g => g.id !== joined.id)]);
      setPublicGroups(prev => prev.filter(g => g.id !== joined.id));
      onSelectGroup(joined.id);
    } catch (error) {
      console.error('Failed to join public group', error);
      alert(error instanceof Error ? error.message : 'Failed to join group');
    } finally {
      setJoiningGroupId(null);
    }
  };

  // ── Section CRUD ────────────────────────────────────────────────────────────

  const createSection = () => {
    const name = newSectionName.trim();
    if (!name) { setAddingSection(false); return; }
    const newSection: GroupSection = { id: `sec_${Date.now()}`, name, groupIds: [] };
    setSections(prev => [...prev, newSection]);
    setNewSectionName('');
    setAddingSection(false);
  };

  const renameSection = (sectionId: string, name: string) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, name } : s));
  };

  const deleteSection = (sectionId: string) => {
    setSections(prev => prev.filter(s => s.id !== sectionId));
    if (activeFilter === sectionId) setActiveFilter(null);
  };

  const moveGroupToSection = (groupId: string, targetSectionId: string) => {
    setSections(prev => prev.map(s => {
      if (s.id === targetSectionId) return { ...s, groupIds: s.groupIds.includes(groupId) ? s.groupIds : [...s.groupIds, groupId] };
      return { ...s, groupIds: s.groupIds.filter(id => id !== groupId) };
    }));
  };

  const removeGroupFromSections = (groupId: string) => {
    setSections(prev => prev.map(s => ({ ...s, groupIds: s.groupIds.filter(id => id !== groupId) })));
  };

  // ── Derived data ────────────────────────────────────────────────────────────

  const matchesSearch = useCallback((group: StudyGroup) => {
    const q = groupSearch.trim().toLowerCase();
    if (!q) return true;
    return [
      group.name,
      group.description,
      group.members.map(m => m.name).join(' '),
    ].join(' ').toLowerCase().includes(q);
  }, [groupSearch]);

  const filteredMyGroups = useMemo(() => myGroups.filter(matchesSearch), [myGroups, matchesSearch]);
  const filteredPublicGroups = useMemo(() => publicGroups.filter(matchesSearch), [publicGroups, matchesSearch]);

  // Ungrouped: in visible myGroups but not in any section
  const sectionedIds = new Set(sections.flatMap(s => s.groupIds));
  const ungroupedGroups = filteredMyGroups.filter(g => !sectionedIds.has(g.id));

  // Build display: if filter active, only show that section (+ ungrouped if "All")
  const visibleSections = activeFilter
    ? sections.filter(s => s.id === activeFilter)
    : sections;

  const showUngrouped = !activeFilter;

  // Groups for each section (resolve ids to actual group objects)
  const groupsForSection = (section: GroupSection) =>
    section.groupIds.map(id => filteredMyGroups.find(g => g.id === id)).filter(Boolean) as StudyGroup[];

  return (
    <div className="max-w-[1440px] mx-auto px-6 sm:px-8 md:px-10 py-8">
      {showCreateModal && <CreateGroupModal user={user} onClose={() => setShowCreateModal(false)} onGroupCreated={handleGroupCreated} />}

      <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Workspace</p>
          <h1 className="text-4xl font-extrabold text-[var(--text)] tracking-tight font-display">Study Groups</h1>
          <p className="mt-2 max-w-2xl text-base text-[var(--text-muted)]">Organize shared readings, invitations, and public research spaces without exposing private paper data.</p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <span className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-[var(--text)] border border-[var(--border)] bg-[var(--surface)]/75">
              <span className="h-2 w-2 rounded-full bg-[var(--primary)]/70" />
              <strong className="tabular-nums">{myGroups.length}</strong> my group{myGroups.length !== 1 ? 's' : ''}
            </span>
            <span className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-[var(--text)] border border-[var(--border)] bg-[var(--surface)]/75">
              <span className="h-2 w-2 rounded-full bg-[var(--success)]/70" />
              <strong className="tabular-nums">{invitations.length}</strong> invite{invitations.length !== 1 ? 's' : ''}
            </span>
            <span className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-[var(--text)] border border-[var(--border)] bg-[var(--surface)]/75">
              <span className="h-2 w-2 rounded-full bg-[var(--primary)]/35" />
              <strong className="tabular-nums">{publicGroups.length}</strong> public
            </span>
          </div>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <div className="relative min-w-0 sm:w-80">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              placeholder="Search groups or members"
              className="h-11 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
            />
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--gradient-primary)' }}
          >
            <PlusIcon className="h-4 w-4" />
            New group
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-40">
          <LoaderIcon className="w-10 h-10 animate-spin text-[var(--primary)]" />
        </div>
      ) : (
        <div className="space-y-10">

          {/* ── Pending Invitations ── */}
          {invitations.length > 0 && (
            <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Pending invitations</h2>
                <span className="text-xs text-[var(--text-muted)]">{invitations.length}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {invitations.map(inv => (
                  <div key={inv.id} className="flex flex-col gap-3 rounded-md bg-[var(--bg-secondary)]/55 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-[var(--text)]">
                      <span className="font-semibold">{inv.groupName}</span>
                      <span className="text-[var(--text-muted)]"> invited by {inv.inviter.name}</span>
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => handleInvitationResponse(inv.id, 'accepted')} className="min-h-[34px] rounded-md bg-[var(--success)] px-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--success-hover)]">Accept</button>
                      <button onClick={() => handleInvitationResponse(inv.id, 'declined')} className="min-h-[34px] rounded-md border border-[var(--border)] px-3 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--danger)]">Decline</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── My Groups ── */}
          <div>
            {/* Header row */}
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <h2 className="text-lg font-semibold text-[var(--text)] font-display flex items-center gap-2 mr-2">
                My Groups
              </h2>

              {/* Section filter pills */}
              {sections.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setActiveFilter(null)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      activeFilter === null
                        ? 'text-white'
                        : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                    }`}
                    style={activeFilter === null ? { background: 'var(--gradient-primary)' } : {}}
                  >
                    All
                  </button>
                  {sections.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setActiveFilter(s.id === activeFilter ? null : s.id)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                        activeFilter === s.id
                          ? 'text-white'
                          : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                      }`}
                      style={activeFilter === s.id ? { background: 'var(--gradient-primary)' } : {}}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Add section */}
              <div className="flex items-center gap-1.5 ml-auto">
                {addingSection ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={newSectionRef}
                      value={newSectionName}
                      onChange={e => setNewSectionName(e.target.value)}
                      onBlur={createSection}
                      onKeyDown={e => { if (e.key === 'Enter') createSection(); if (e.key === 'Escape') { setAddingSection(false); setNewSectionName(''); } }}
                      placeholder="Section name…"
                      className="text-sm px-3 py-1.5 rounded-md border border-[var(--primary)] bg-[var(--surface)] text-[var(--text)] focus:outline-none w-40"
                    />
                    <button onClick={createSection} className="text-xs px-3 py-1.5 rounded-md font-semibold text-white" style={{ background: 'var(--gradient-primary)' }}>Add</button>
                    <button onClick={() => { setAddingSection(false); setNewSectionName(''); }} className="text-[var(--text-muted)] hover:text-[var(--text)]"><XIcon className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingSection(true)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--primary)] transition-colors"
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                    Add section
                  </button>
                )}
              </div>
            </div>

            {myGroups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)]/60 p-8 text-center">
                <p className="text-[var(--text-muted)]">You are not a member of any groups yet.</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-4 inline-flex items-center gap-2 font-semibold py-2.5 px-4 rounded-md min-h-[36px] text-white transition-opacity hover:opacity-90"
                  style={{ background: 'var(--gradient-primary)' }}
                >
                  <PlusIcon className="w-4 h-4" />
                  Create your first group
                </button>
              </div>
            ) : filteredMyGroups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)]/60 p-8 text-center">
                <p className="text-[var(--text-muted)]">No groups match your search.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Sections */}
                <AnimatePresence>
                  {visibleSections.map(section => (
                    <motion.div
                      key={section.id}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18 }}
                    >
                      <SectionBlock
                        section={section}
                        groups={groupsForSection(section)}
                        onSelect={onSelectGroup}
                        onDragGroupStart={(gid) => { draggingGroupId.current = gid; }}
                        onDrop={(sectionId) => {
                          if (draggingGroupId.current) {
                            moveGroupToSection(draggingGroupId.current, sectionId);
                            draggingGroupId.current = null;
                          }
                        }}
                        onRename={renameSection}
                        onDelete={deleteSection}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* Unsectioned groups, no label, just show them */}
                {showUngrouped && ungroupedGroups.length > 0 && (
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggingGroupId.current) {
                        removeGroupFromSections(draggingGroupId.current);
                        draggingGroupId.current = null;
                      }
                    }}
                  >
                    {sections.length > 0 && (
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
                        <span className="text-xs text-[var(--text-muted)] opacity-50">other</span>
                        <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {ungroupedGroups.map(group => (
                        <GroupCard
                          key={group.id}
                          group={group}
                          onSelect={() => onSelectGroup(group.id)}
                          onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; draggingGroupId.current = group.id; }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* All groups sectioned, nothing ungrouped to show for active filter */}
                {!showUngrouped && visibleSections.length === 0 && (
                  <p className="text-sm text-[var(--text-muted)] text-center py-6">No groups in this section yet. Drag groups here.</p>
                )}
              </div>
            )}
          </div>

          {/* ── Discover Public Groups ── */}
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)] font-display mb-4 flex items-center gap-2">
              Discover Public Groups
            </h2>
            {filteredPublicGroups.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredPublicGroups.map(group => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    onSelect={() => onSelectGroup(group.id)}
                    canJoin
                    isJoining={joiningGroupId === group.id}
                    onJoin={() => handleJoinPublicGroup(group.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)]/60 p-10 md:p-12 text-center">
                <h3 className="text-lg font-semibold text-[var(--text)]">{groupSearch ? 'No public groups match' : 'No groups to join yet'}</h3>
                <p className="mt-1 text-sm text-[var(--text-muted)] max-w-sm mx-auto">
                  {groupSearch ? 'Try another search term.' : 'Public groups created by others will appear here. Start your own to collaborate.'}
                </p>
                {!groupSearch && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="mt-4 inline-flex items-center gap-2 font-semibold py-2.5 px-5 rounded-md min-h-[36px] text-white transition-opacity hover:opacity-90"
                    style={{ background: 'var(--gradient-primary)' }}
                  >
                    <PlusIcon className="w-4 h-4" />
                    Create Group
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupsPage;
