import React, { useState, useEffect, useCallback } from 'react';
import { StudyGroup, User, Paper, GroupNotesSummary } from '../types';
import { getGroupById, joinPublicGroup, searchUsers, inviteUserToGroup, searchPapers, addPaperToGroup, removePaperFromGroup, leaveGroup, updateGroup } from '../services/apiService';
import { getGroupNotesSummary, regenerateAllGroupNotesSummaries, regenerateGroupNotesSummary } from '../services/groupNotesService';
import { LoaderIcon } from './icons/LoaderIcon';
import { UserIcon } from './icons/UserIcon';
import { AttachmentIcon } from './icons/AttachmentIcon';
import { SearchIcon } from './icons/SearchIcon';
import { XIcon } from './icons/XIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import GroupDocumentViewer from './GroupDocumentViewer';
import AiTrustFooter from './ui/AiTrustFooter';

interface GroupDetailProps {
  groupId: string;
  user: User;
  onBack: () => void;
  onSelectPaper: (id: string) => void;
  onSummarize?: (text: string) => void;
  onParaphrase?: (text: string) => void;
}

type GroupDetailTab = 'overview' | 'papers' | 'members' | 'settings';

const groupTabs: Array<{ id: GroupDetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'papers', label: 'Papers' },
  { id: 'members', label: 'Members' },
  { id: 'settings', label: 'Settings' },
];

const GroupDetail: React.FC<GroupDetailProps> = ({ groupId, user, onBack, onSelectPaper, onSummarize, onParaphrase }) => {
  const [group, setGroup] = useState<StudyGroup | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteQuery, setInviteQuery] = useState('');
  const [searchedUsers, setSearchedUsers] = useState<User[]>([]);
  const [inviteStatus, setInviteStatus] = useState<Record<string, 'invited' | 'error' | null>>({});
  const [showAddPaper, setShowAddPaper] = useState(false);
  const [paperSearchQuery, setPaperSearchQuery] = useState('');
  const [searchedPapers, setSearchedPapers] = useState<Paper[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [userPaperCount, setUserPaperCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsName, setSettingsName] = useState('');
  const [settingsDescription, setSettingsDescription] = useState('');
  const [settingsIsPublic, setSettingsIsPublic] = useState(true);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedNewOwner, setSelectedNewOwner] = useState<string | null>(null);
  const [groupSummary, setGroupSummary] = useState<GroupNotesSummary | null>(null);
  const [isGroupSummaryLoading, setIsGroupSummaryLoading] = useState(false);
  const [groupSummaryError, setGroupSummaryError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<GroupDetailTab>('overview');
  const [isJoining, setIsJoining] = useState(false);

  const fetchGroup = useCallback(async () => {
    try {
      const fetchedGroup = await getGroupById(groupId);
      setGroup(fetchedGroup);
      // Count papers added by current user
      if (fetchedGroup) {
        const count = fetchedGroup.papers.filter(p => {
          const paperWithAddedBy = p as Paper & { addedBy?: string };
          return paperWithAddedBy.addedBy === user.id;
        }).length;
        setUserPaperCount(count);
        // Initialize settings form
        setSettingsName(fetchedGroup.name);
        setSettingsDescription(fetchedGroup.description);
        setSettingsIsPublic(fetchedGroup.isPublic);
      }
    } catch (error) {
      console.error("Failed to fetch group details", error);
      setGroup(null);
    }
  }, [groupId, user.id]);

  useEffect(() => {
    setIsLoading(true);
    fetchGroup().finally(() => setIsLoading(false));
  }, [fetchGroup]);

  useEffect(() => {
    const handleSearch = async () => {
      if (inviteQuery.trim().length > 2) {
        const results = await searchUsers(inviteQuery, user);
        setSearchedUsers(results);
      } else {
        setSearchedUsers([]);
      }
    };
    const debounceTimer = setTimeout(handleSearch, 300);
    return () => clearTimeout(debounceTimer);
  }, [inviteQuery, user]);

  useEffect(() => {
    const handlePaperSearch = async () => {
      if (paperSearchQuery.trim().length > 2) {
        const results = await searchPapers(paperSearchQuery);
        setSearchedPapers(results);
      } else {
        setSearchedPapers([]);
      }
    };
    const debounceTimer = setTimeout(handlePaperSearch, 300);
    return () => clearTimeout(debounceTimer);
  }, [paperSearchQuery]);

  const handleInvite = async (invitedUser: User) => {
    if (!group) return;
    try {
        await inviteUserToGroup(group.id, user, invitedUser);
        setInviteStatus(prev => ({ ...prev, [invitedUser.id]: 'invited' }));
        setInviteQuery('');
        setSearchedUsers([]);
    } catch (error: any) {
        console.error("Failed to invite user", error);
        setInviteStatus(prev => ({ ...prev, [invitedUser.id]: 'error' }));
        alert(error.message || 'Failed to invite user');
    }
  };

  const handleLeaveGroup = async () => {
    if (!group) return;

    const otherMembers = group.members.filter(m => m.id !== user.id);

    // If owner, check if there are other members
    if (isOwner) {
      if (otherMembers.length > 0) {
        // Show transfer ownership modal
        setShowTransferModal(true);
        return;
      } else {
        // Owner is the only member - confirm deletion
        if (!window.confirm("You are the only member. Leaving will delete this group. Are you sure?")) return;
      }
    } else {
      // Regular member - simple confirmation
      if (!window.confirm("Are you sure you want to leave this group?")) return;
    }

    try {
      const result = await leaveGroup(group.id, selectedNewOwner || undefined);
      if (result.group_deleted) {
        alert("Group has been deleted");
      } else {
        alert(result.new_owner_id ? "Ownership transferred and you have left the group" : "You have left the group");
      }
      onBack();
    } catch (error: any) {
      console.error("Failed to leave group", error);
      // If error is about needing to select owner, show modal
      if (error.message && error.message.includes("transfer ownership")) {
        setShowTransferModal(true);
      } else {
        alert(error.message || 'Failed to leave group');
      }
    }
  };

  const handleTransferOwnership = async () => {
    if (!group || !selectedNewOwner) {
      alert("Please select a new owner");
      return;
    }

    try {
      await leaveGroup(group.id, selectedNewOwner);
      alert("Ownership transferred and you have left the group");
      setShowTransferModal(false);
      onBack();
    } catch (error: any) {
      console.error("Failed to transfer ownership", error);
      alert(error.message || 'Failed to transfer ownership');
    }
  };

  const handleUpdateGroup = async () => {
    if (!group) return;
    try {
      const updatedGroup = await updateGroup(group.id, {
        name: settingsName,
        description: settingsDescription,
        isPublic: settingsIsPublic
      });
      setGroup(updatedGroup);
      setShowSettings(false);
      alert("Group settings updated successfully");
    } catch (error: any) {
      console.error("Failed to update group", error);
      alert(error.message || 'Failed to update group');
    }
  };

  const handleAddPaper = async (paperId: string) => {
    if (!group) return;
    if (userPaperCount >= 10) {
      alert("You have reached the limit of 10 papers per group");
      return;
    }
    try {
      await addPaperToGroup(group.id, paperId);
      setPaperSearchQuery('');
      setSearchedPapers([]);
      setShowAddPaper(false);
      fetchGroup();
    } catch (error: any) {
      console.error("Failed to add paper", error);
      alert(error.message || "Failed to add paper to group");
    }
  };

  const handleRemovePaper = async (paperId: string) => {
    if (!group) return;
    if (!window.confirm("Are you sure you want to remove this paper from the group?")) return;
    try {
      await removePaperFromGroup(group.id, paperId);
      fetchGroup();
    } catch (error: any) {
      console.error("Failed to remove paper", error);
      alert(error.message || "Failed to remove paper from group");
    }
  };

  const handleGenerateGroupSummary = async () => {
    if (!group) return;
    setIsGroupSummaryLoading(true);
    setGroupSummaryError(null);
    try {
      const result = await regenerateGroupNotesSummary(group.id);
      setGroupSummary(result);
    } catch (error: any) {
      setGroupSummaryError(error.message || 'Failed to generate group summary');
    } finally {
      setIsGroupSummaryLoading(false);
    }
  };

  const handleJoinGroup = async () => {
    if (!group) return;
    setIsJoining(true);
    try {
      const joinedGroup = await joinPublicGroup(group.id);
      setGroup(joinedGroup);
      setActiveTab('overview');
    } catch (error: any) {
      console.error("Failed to join group", error);
      alert(error.message || 'Failed to join group');
    } finally {
      setIsJoining(false);
    }
  };

  const isOwner = user.id === group?.ownerId;
  const isMember = !!group && (isOwner || group.members.some(m => m.id === user.id));

  useEffect(() => {
    if (!group || !isMember) return;
    let cancelled = false;

    const loadSummary = async () => {
      setIsGroupSummaryLoading(true);
      setGroupSummaryError(null);
      try {
        const cached = await getGroupNotesSummary(group.id);
        if (!cancelled) setGroupSummary(cached);

        const launchKey = `mylibrary_group_notes_launch_regenerated_${group.id}`;
        if (!sessionStorage.getItem(launchKey)) {
          sessionStorage.setItem(launchKey, 'true');
          const regenerated = await regenerateAllGroupNotesSummaries(group.id);
          if (!cancelled) setGroupSummary(regenerated);
        }
      } catch (error: any) {
        if (!cancelled) setGroupSummaryError(error.message || 'Failed to load group summary');
      } finally {
        if (!cancelled) setIsGroupSummaryLoading(false);
      }
    };

    loadSummary();
    return () => { cancelled = true; };
  }, [group?.id, isMember]);

  // If a paper is selected, show the document viewer
  if (selectedPaperId) {
    return (
      <GroupDocumentViewer
        groupId={groupId}
        paperId={selectedPaperId}
        user={user}
        onBack={() => setSelectedPaperId(null)}
        onSummarize={onSummarize}
        onParaphrase={onParaphrase}
      />
    );
  }

  if (isLoading) {
    return <div className="flex justify-center items-center h-[calc(100vh-4rem)]"><LoaderIcon className="w-12 h-12 animate-spin text-[var(--primary)]" /></div>;
  }
  if (!group) {
    return (
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold text-red-400">Group not found</h2>
        <button onClick={onBack} className="mt-6 text-white font-bold py-2 px-4 rounded-lg" style={{ background: 'var(--gradient-primary)' }}>Back to Groups</button>
      </div>
    );
  }

  const otherMembers = group ? group.members.filter(m => m.id !== user.id) : [];
  const totalAnnotations = (groupSummary?.total_highlights ?? 0) + (groupSummary?.total_comments ?? 0);

  // Shared input field class
  const inputClass = "w-full bg-[var(--surface)] border border-[var(--border)] rounded-md py-2 px-3 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40";

  return (
    <div className="max-w-[1440px] mx-auto px-6 sm:px-8 md:px-10 py-8">
      {/* Ownership Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] rounded-lg shadow-2xl w-full max-w-md border border-[var(--border)]">
            <div className="p-6 border-b border-[var(--border)]">
              <h2 className="text-xl font-bold text-[var(--text)] font-display">Transfer Ownership</h2>
              <p className="text-[var(--text-muted)] text-sm mt-2">You must transfer ownership to another member before leaving. Select a new owner:</p>
            </div>
            <div className="p-6">
              {otherMembers.length === 0 ? (
                <p className="text-[var(--text-muted)]">No other members available.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {otherMembers.map(member => (
                    <label
                      key={member.id}
                      className={`flex items-center space-x-3 p-3 rounded-lg cursor-pointer border transition-colors ${
                        selectedNewOwner === member.id
                          ? 'bg-[var(--primary)]/10 border-[var(--primary)]'
                          : 'bg-[var(--bg-secondary)] border-[var(--border)] hover:border-[var(--primary)]/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="newOwner"
                        value={member.id}
                        checked={selectedNewOwner === member.id}
                        onChange={(e) => setSelectedNewOwner(e.target.value)}
                        className="h-4 w-4 text-[var(--primary)] focus:ring-[var(--primary)]"
                      />
                      <div>
                        <div className="font-medium text-[var(--text)]">{member.name}</div>
                        <div className="text-sm text-[var(--text-muted)]">{member.email}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="p-6 bg-[var(--bg-secondary)] border-t border-[var(--border)] rounded-b-lg flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowTransferModal(false);
                  setSelectedNewOwner(null);
                }}
                className="px-4 py-2 text-[var(--text-muted)] hover:text-[var(--text)] font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleTransferOwnership}
                disabled={!selectedNewOwner}
                className="px-4 py-2 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                style={{ background: 'var(--gradient-primary)' }}
              >
                Transfer &amp; Leave
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8">
        <button
          onClick={onBack}
          className="mb-6 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition-colors hover:bg-[var(--bg-secondary)]"
        >
          &larr; All Groups
        </button>

        <div className="border-b border-[var(--border)] pb-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${group.isPublic ? 'bg-[var(--success)]/10 text-[var(--success)]' : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'}`}>
              {group.isPublic ? 'Public' : 'Private'}
            </span>
            {isOwner && <span className="rounded-md bg-[var(--primary)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--primary)]">Owner</span>}
            {isMember && !isOwner && <span className="rounded-md bg-[var(--bg-secondary)] px-2.5 py-1 text-xs font-semibold text-[var(--text-muted)]">Member</span>}
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-[var(--text)] font-display">{group.name}</h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-[var(--text-muted)]">{group.description}</p>
          <div className="mt-6 flex flex-wrap gap-4 text-sm text-[var(--text-muted)]">
            <span><strong className="text-[var(--text)]">{group.members.length}</strong> member{group.members.length !== 1 ? 's' : ''}</span>
            {isMember && <span><strong className="text-[var(--text)]">{group.papers.length}</strong> shared paper{group.papers.length !== 1 ? 's' : ''}</span>}
            {isMember && <span><strong className="text-[var(--text)]">{totalAnnotations}</strong> notes signal{totalAnnotations !== 1 ? 's' : ''}</span>}
          </div>
        </div>
      </div>

      {!isMember ? (
        <div className="max-w-4xl">
          <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
            <section>
              <h2 className="text-2xl font-bold text-[var(--text)] font-display">Preview</h2>
              <p className="mt-3 text-[var(--text-muted)]">You can see this group&apos;s title, description, and members. Join before viewing shared papers, summaries, highlights, or comments.</p>
              {group.isPublic ? (
                <button
                  onClick={handleJoinGroup}
                  disabled={isJoining}
                  className="mt-6 rounded-md px-5 py-2.5 font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ background: 'var(--gradient-primary)' }}
                >
                  {isJoining ? 'Joining...' : 'Join Group'}
                </button>
              ) : (
                <p className="mt-6 rounded-md bg-[var(--bg-secondary)] px-4 py-3 text-sm text-[var(--text-muted)]">Private groups require an invitation.</p>
              )}
            </section>
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Members</h3>
              <ul className="space-y-3">
                {group.members.map(member => (
                  <li key={member.id} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-secondary)]">
                      <UserIcon className="h-4 w-4 text-[var(--text-muted)]" />
                    </div>
                    <span className="font-medium text-[var(--text)]">{member.name}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-8 flex flex-wrap gap-2 border-b border-[var(--border)]">
            {groupTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                  activeTab === tab.id
                    ? 'border-[var(--primary)] text-[var(--primary)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <SparklesIcon className="h-5 w-5 text-[var(--primary)]" />
                  <h2 className="text-2xl font-bold text-[var(--text)] font-display">Group Notes Summary</h2>
                </div>
                <p className="mb-5 text-sm text-[var(--text-muted)]">Saved synthesis of highlights and comments across this group&apos;s shared papers.</p>

                {isGroupSummaryLoading && (
                  <div className="flex items-center gap-3 text-[var(--text-muted)]">
                    <LoaderIcon className="h-5 w-5 animate-spin text-[var(--primary)]" />
                    <span className="text-sm">Refreshing saved notes summaries...</span>
                  </div>
                )}

                {groupSummaryError && !isGroupSummaryLoading && (
                  <p className="text-sm text-red-400">{groupSummaryError}</p>
                )}

                {groupSummary && !isGroupSummaryLoading && (
                  <div className="border-l-2 border-[var(--primary)]/35 pl-5">
                    {groupSummary.available ? (
                      <>
                        <p className="whitespace-pre-wrap text-[var(--text)] leading-relaxed">{groupSummary.summary}</p>
                        <AiTrustFooter
                          feature="group-summary"
                          contextId={`group:${group.id}`}
                          source={`Generated from ${groupSummary.papers_with_content} of ${groupSummary.paper_count} paper${groupSummary.paper_count !== 1 ? 's' : ''}, ${groupSummary.total_highlights} highlight${groupSummary.total_highlights !== 1 ? 's' : ''}, ${groupSummary.total_comments} comment${groupSummary.total_comments !== 1 ? 's' : ''}`}
                          timestamp={groupSummary.generated_at}
                          onRegenerate={handleGenerateGroupSummary}
                          regenerateLabel="Regenerate summary"
                          metadata={{ group_id: group.id }}
                        />
                      </>
                    ) : (
                      <p className="text-sm text-[var(--text-muted)]">No meaningful notes or highlights found across the group&apos;s papers yet.</p>
                    )}
                    {!groupSummary.available && (
                      <button onClick={handleGenerateGroupSummary} className="mt-4 text-sm font-semibold text-[var(--primary)] hover:opacity-80">
                        Regenerate summary
                      </button>
                    )}
                  </div>
                )}
              </section>

              <section>
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Research signal</h3>
                <div className="mt-4 border-l border-[var(--border)] pl-4 space-y-3">
                  {[
                    { label: 'Shared papers', value: group.papers.length, note: 'documents members can annotate together' },
                    { label: 'Members', value: group.members.length, note: 'people with access to this workspace' },
                    { label: 'Highlights', value: groupSummary?.total_highlights ?? 0, note: 'passages marked for the group' },
                    { label: 'Comments', value: groupSummary?.total_comments ?? 0, note: 'written group observations' },
                  ].map(item => (
                    <div key={item.label} className="border-b border-[var(--border)]/70 pb-3 last:border-b-0">
                      <div className="mb-1 flex items-end justify-between gap-4">
                        <p className="font-semibold text-[var(--text)]">{item.label}</p>
                        <p className="text-2xl font-bold tabular-nums text-[var(--text)]">{item.value}</p>
                      </div>
                      <p className="text-xs leading-relaxed text-[var(--text-muted)]">{item.note}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'papers' && (
            <section>
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)] font-display">
                    <AttachmentIcon className="h-5 w-5 text-[var(--primary)]" />
                    Shared Papers
                  </h2>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">Members can open these papers and add group highlights or comments.</p>
                </div>
                <button
                  onClick={() => setShowAddPaper(!showAddPaper)}
                  disabled={userPaperCount >= 10}
                  className="rounded-md px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: 'var(--gradient-primary)' }}
                >
                  {userPaperCount >= 10 ? 'Limit Reached (10/10)' : '+ Add Paper'}
                </button>
              </div>

              {showAddPaper && (
                <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="relative mb-4">
                    <input
                      type="text"
                      value={paperSearchQuery}
                      onChange={(e) => setPaperSearchQuery(e.target.value)}
                      placeholder="Search your library for papers to add"
                      className={`${inputClass} pl-10`}
                    />
                    <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  </div>
                  {searchedPapers.length > 0 && (
                    <div className="max-h-72 overflow-y-auto divide-y divide-[var(--border)]">
                      {searchedPapers.map(paper => {
                        const alreadyAdded = group.papers.some(p => p.id === paper.id);
                        return (
                          <div key={paper.id} className="flex items-center justify-between gap-4 py-3">
                            <div className="min-w-0">
                              <h4 className="truncate text-sm font-semibold text-[var(--text)]">{paper.title}</h4>
                              <p className="truncate text-xs text-[var(--text-muted)]">{paper.authors.join(', ')}</p>
                            </div>
                            <button
                              onClick={() => handleAddPaper(paper.id)}
                              disabled={alreadyAdded}
                              className="rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                              style={{ background: 'var(--gradient-primary)' }}
                            >
                              {alreadyAdded ? 'Added' : 'Add'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {paperSearchQuery && searchedPapers.length === 0 && (
                    <p className="py-4 text-center text-sm text-[var(--text-muted)]">No papers found.</p>
                  )}
                </div>
              )}

              {group.papers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-[var(--text-muted)]">
                  No papers added yet. Add a paper from your library to begin shared reading.
                </div>
              ) : (
                <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                  {group.papers.map(paper => {
                    const paperWithAddedBy = paper as Paper & { addedBy?: string };
                    const canRemove = paperWithAddedBy.addedBy === user.id;
                    return (
                      <div key={paper.id} className="flex items-start justify-between gap-4 p-4 transition-colors hover:bg-[var(--bg-secondary)]/45">
                        <button onClick={() => setSelectedPaperId(paper.id)} className="min-w-0 flex-1 text-left">
                          <h4 className="font-bold text-[var(--text)]">{paper.title}</h4>
                          <p className="mt-1 truncate text-sm text-[var(--text-muted)]">{paper.authors.join(', ')}</p>
                          <p className="mt-1 text-xs text-[var(--text-muted)]">{paper.subject} - {paper.publicationYear}</p>
                        </button>
                        {canRemove && (
                          <button onClick={() => handleRemovePaper(paper.id)} className="rounded-md px-2 py-1 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/10" title="Remove paper">
                            Remove
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {activeTab === 'members' && (
            <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
              <section>
                <h2 className="mb-4 text-2xl font-bold text-[var(--text)] font-display">Members ({group.members.length})</h2>
                <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                  {group.members.map(member => (
                    <li key={member.id} className="flex items-center gap-3 p-4">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-secondary)]">
                        <UserIcon className="h-4 w-4 text-[var(--text-muted)]" />
                      </div>
                      <div>
                        <p className="font-semibold text-[var(--text)]">{member.name}</p>
                        {member.id === group.ownerId && <p className="text-xs text-[var(--primary)]">Owner</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <InviteMembersPanel
                inviteQuery={inviteQuery}
                setInviteQuery={setInviteQuery}
                searchedUsers={searchedUsers}
                inviteStatus={inviteStatus}
                handleInvite={handleInvite}
                inputClass={inputClass}
              />
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
              <section>
                <div className="mb-4 flex items-center justify-between gap-4">
                  <h2 className="text-2xl font-bold text-[var(--text)] font-display">Group Settings</h2>
                  {isOwner && (
                    <button onClick={() => setShowSettings(!showSettings)} className="text-sm font-semibold text-[var(--primary)] hover:opacity-80">
                      {showSettings ? 'Cancel' : 'Edit'}
                    </button>
                  )}
                </div>
                {isOwner && showSettings ? (
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-[var(--text-muted)]">Group Name</label>
                      <input type="text" value={settingsName} onChange={(e) => setSettingsName(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-[var(--text-muted)]">Description</label>
                      <textarea value={settingsDescription} onChange={(e) => setSettingsDescription(e.target.value)} rows={4} className={inputClass} />
                    </div>
                    <label className="flex items-center gap-3 text-[var(--text)]">
                      <input type="checkbox" id="isPublicSettings" checked={settingsIsPublic} onChange={(e) => setSettingsIsPublic(e.target.checked)} className="h-4 w-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]" />
                      Public and discoverable
                    </label>
                    <button onClick={handleUpdateGroup} className="rounded-md px-4 py-2 font-semibold text-white transition-opacity hover:opacity-90" style={{ background: 'var(--gradient-primary)' }}>
                      Save Changes
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm text-[var(--text-muted)]">
                    <p><span className="font-semibold text-[var(--text)]">Visibility:</span> {group.isPublic ? 'Public' : 'Private'}</p>
                    <p><span className="font-semibold text-[var(--text)]">Owner:</span> {group.members.find(m => m.id === group.ownerId)?.name || 'Unknown'}</p>
                    {!isOwner && <p>Only the owner can edit group details.</p>}
                  </div>
                )}
              </section>

              <section>
                <h2 className="mb-4 text-2xl font-bold text-[var(--text)] font-display">Membership</h2>
                <div className="border-t border-[var(--border)] pt-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="max-w-xl text-sm text-[var(--text-muted)]">
                      {isOwner && otherMembers.length > 0
                        ? 'You will be asked to transfer ownership before leaving this group.'
                        : isOwner
                          ? 'Leaving will delete this group because you are the only member.'
                          : 'Leaving removes your shared group data according to the group privacy rules.'}
                    </p>
                    <button onClick={handleLeaveGroup} className="w-fit rounded-md border border-red-500/40 px-4 py-2 font-semibold text-red-500 transition-colors hover:bg-red-500/10">
                      Leave Group
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Extracted invite panel to avoid duplication
const InviteMembersPanel: React.FC<{
  inviteQuery: string;
  setInviteQuery: (v: string) => void;
  searchedUsers: User[];
  inviteStatus: Record<string, 'invited' | 'error' | null>;
  handleInvite: (u: User) => void;
  inputClass: string;
}> = ({ inviteQuery, setInviteQuery, searchedUsers, inviteStatus, handleInvite, inputClass }) => (
  <section>
    <h2 className="mb-4 text-2xl font-bold text-[var(--text)] font-display">Invite Members</h2>
    <div className="relative">
      <input
        type="text"
        value={inviteQuery}
        onChange={e => setInviteQuery(e.target.value)}
        placeholder="Search user by name or email..."
        className={`${inputClass} pl-10`}
      />
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <SearchIcon className="h-5 w-5 text-[var(--text-muted)]" />
      </div>
    </div>
    {searchedUsers.length > 0 && (
      <ul className="mt-4 max-h-56 overflow-y-auto divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        {searchedUsers.map(u => (
          <li key={u.id} className="flex items-center justify-between gap-3 p-3">
            <span className="text-[var(--text)] text-sm">{u.name} <span className="text-[var(--text-muted)]">({u.email})</span></span>
            <button
              onClick={() => handleInvite(u)}
              disabled={!!inviteStatus[u.id]}
              className="rounded-md px-3 py-1 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: 'var(--gradient-primary)' }}
            >
              {inviteStatus[u.id] === 'invited' ? 'Invited' : inviteStatus[u.id] === 'error' ? 'Error' : 'Invite'}
            </button>
          </li>
        ))}
      </ul>
    )}
  </section>
);

export default GroupDetail;
