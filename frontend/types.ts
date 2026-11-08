
import type { HighlightColor } from './lib/highlightColors';

export interface User {
  id: string;
  name: string;
  email: string;
}

/** Structured document from PDF ingestion pipeline (academic-reader format). */
export interface DocumentSection {
  heading: string;
  content: string;
}

export interface StructuredContent {
  title?: string;
  authors?: string[];
  affiliations?: string[];
  emails?: string[];
  published_date?: string;
  subject?: string;
  abstract?: string;
  keywords?: string[];
  sections?: DocumentSection[];
  references?: string[];
  clean_full_text?: string;
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  publicationYear: number;
  subject: string;
  summary: string;
  fullText: string;
  /** Set when paper was ingested via PDF pipeline; use for sectioned rendering. */
  structuredContent?: StructuredContent | null;
}

export interface ChatMessage {
  id:string;
  text: string;
  sender: 'user' | 'ai' | 'system';
  citations?: LibrarianCitation[];
  isLoading?: boolean;
}

export interface StudyGroup {
    id: string;
    name: string;
    description: string;
    ownerId: string; // The ID of the user who created the group
    isPublic: boolean;
    members: User[];
    papers: Paper[];
}

export interface GroupInvitation {
    id: string;
    groupId: string;
    groupName: string;
    inviter: User;
    invitedUserId: string;
    status: 'pending' | 'accepted' | 'declined';
}

 export interface QuizQuestion {                        
    id: string;                                          
    question: string;                                    
    options: [string, string, string, string];           
    answerIndex: number;                                 
    explanation?: string;
    difficulty?: 'easy' | 'normal' | 'hard';                                
  }

export interface DifficultyMix {
  easy: number;
  normal: number;
  hard: number;
}              

// Plagiarism report types
export interface PlagiarismMatch {
  sourcePaperId: string;
  sourcePaperTitle: string;
  similarity: number; // 0..1
  overlapSentence: string;
  matchedSourceSentence: string;
}

export interface PlagiarismReport {
  wordCount: number;
  overallScore: number; // 0..100, higher means more likely plagiarized
  uniquePercent: number; // 0..100
  matches: PlagiarismMatch[];
  sources: Array<{ paperId: string; paperTitle: string; maxSimilarity: number; matchCount: number }>; 
}

export interface Highlight {
  id: number;
  paper_id: number;
  paper_title?: string;
  color: HighlightColor;
  highlighted_text: string;
  start_offset: number;
  end_offset: number;
  context_before?: string;
  context_after?: string;
  created_at: string;
}

export interface HighlightGroup {
  color: HighlightColor;
  highlights: Highlight[];
}

export interface Note {
  id: number;
  paper_id: number;
  paper_title?: string;
  content: string;
  selected_text?: string | null;
  start_offset?: number | null;
  end_offset?: number | null;
  paragraph_index?: number | null;
  created_at: string;
  updated_at: string;
}

export interface LibrarianCitation {
  id: string;
  paper_id: number;
  paper_title: string;
  paragraph_index: number;
  paragraph_number: number;
  excerpt: string;
}

export interface GroupHighlight {
  id: number;
  group_id: number;
  paper_id: number;
  user_id: number;
  user_name?: string;
  color: HighlightColor;
  highlighted_text: string;
  start_offset: number;
  end_offset: number;
  context_before?: string;
  context_after?: string;
  created_at: string;
}

export interface GroupComment {
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
}

export interface PaperNotesSummary {
  group_id: number;
  paper_id: number;
  available: boolean;
  summary: string | null;
  highlight_count: number;
  comment_count: number;
  meaningful_highlight_count: number;
  meaningful_comment_count: number;
  generated_at?: string | null;
}

export interface PaperSummaryBlock {
  paper_id: number;
  paper_title: string;
  highlight_count: number;
  comment_count: number;
  has_content: boolean;
}

// ── Knowledge Roadmap ──────────────────────────────────────────────────────────

export type MasteryState = 1 | 2 | 3 | 4;

export interface RoadmapNode {
  id: string;
  name: string;
  type: 'theory' | 'method' | 'tool' | 'dataset' | 'person' | 'field' | string;
  description: string;
  importance: number; // 1-5
  mastery_state: MasteryState;
  paper_ids: number[];
  paper_titles: Record<string, string>; // paper_id → title
  subject_cluster: string;
}

export interface MasteryEvidence {
  paper_id: number;
  viewed: boolean;
  highlight_count: number;
  quiz_correct_count: number;
  quiz_threshold: number;
  attempted_quiz: boolean;
  is_mastered: boolean;
}

export interface RoadmapEdge {
  id: string;
  source: string;
  target: string;
  label: string; // USES | IS A | PART OF | etc.
}

export interface RoadmapData {
  status: 'ready' | 'processing' | 'error' | 'empty';
  generated_at: string | null;
  paper_count: number;
  concept_count: number;
  nodes: RoadmapNode[];
  edges: RoadmapEdge[];
}

export interface RoadmapStatus {
  status: 'ready' | 'processing' | 'error' | 'empty';
  generated_at: string | null;
  concept_count: number;
  paper_count: number;
}

export interface MasteryStatus {
  is_mastered: boolean;
  quiz_correct_count: number;
  quiz_threshold: number;
  can_mark_mastered: boolean;
  remaining: number;
  related_concepts?: string[];
  related_concepts_count?: number;
}

export interface MasteryUpdateResult {
  updated_nodes: Array<{ id: string; new_state: number }>;
}

// ── Personalized Study Plans ───────────────────────────────────────────────────

export type PlanTaskType = 'concept' | 'reading' | 'quiz';

export interface StudyPlanTask {
  id: number;
  type: PlanTaskType;
  roadmap_node_id?: string | null;
  paper_id?: number | null;
  section_heading?: string | null;
  estimated_minutes: number;
  actual_minutes?: number | null;
  status: 'pending' | 'done' | 'skipped';
  /** Human-readable label from API (concept name, section/paper, or "Quiz") */
  label?: string;
}

export interface StudyPlanDay {
  id: number;
  date: string; // ISO date (YYYY-MM-DD)
  sequence: number;
  planned_minutes: number;
  completed_minutes: number;
  tasks: StudyPlanTask[];
}

export interface StudyPlan {
  id: number;
  starts_at: string; // ISO date
  ends_at: string;   // ISO date
  hours_per_week: number;
  status: 'active' | 'archived';
  days: StudyPlanDay[];
}

export interface PlanDiffSummary {
  moved_tasks: number[];
  added_tasks: number[];
  removed_tasks: number[];
}

// ── Friends & Activity ────────────────────────────────────────────────────────

export interface Friendship {
  id: string;
  friendId: string;
  friendName: string;
  friendEmail: string;
  since: string;
}

export interface ReadingEvent {
  id: string;
  userId: string;
  userName: string;
  paperId: string;
  paperTitle: string;
  action: 'opened' | 'finished' | 'highlighted';
  timestamp: string;
}

export interface FriendRequestOut {
  id: number;
  from_user_id: number;
  to_user_id: number;
  from_user_name: string;
  from_user_email: string;
  status: string;
  created_at: string;
  responded_at: string | null;
}

export interface FriendsInsights {
  trendingPapers: { paperId: string; title: string; readCount: number }[];
  trendingSubjects?: { subject: string; count: number; total_seconds: number }[];
  mostActiveReaders: { userId: string; name: string; count: number }[];
  mostActiveReadersByTime?: { userId: string; name: string; totalSeconds: number; formatted: string }[];
}

export interface FriendsCount {
  friends: number;
  pending_incoming: number;
  pending_sent: number;
}

// ── Study Tracker ─────────────────────────────────────────────────────────────

export type ActivityType = 'reading' | 'chatbot' | 'groups' | 'plagiarism' | 'home';

export interface StudySession {
  id: string;
  userId: string;
  activityType: ActivityType;
  category: string | null;
  paperId: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSecs: number | null;
}

export interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  totalSeconds: number;
  totalFormatted: string;
  byActivity: { activityType: string; totalSeconds: number; formatted: string }[];
  byCategory: { category: string; totalSeconds: number; formatted: string }[];
  daily: { date: string; totalSeconds: number; formatted: string }[];
}

export interface ReadingSpeed {
  wordsPerMinute: number;
  sampleSize: number;
  defaultUsed: boolean;
}

// ── Read Aloud ────────────────────────────────────────────────────────────────

export type VoiceOption = {
  id: string;
  name: string;
  lang: string;
  isDefault: boolean;
  voice: SpeechSynthesisVoice;
};

export type SentenceSegment = {
  id: string;
  paragraphIndex: number;
  sentenceIndex: number;
  text: string;
};

export type ParagraphSegment = {
  id: string;
  paragraphIndex: number;
  text: string;
  startOffset: number;
  endOffset: number;
  sentences: SentenceSegment[];
};

export type SpeechPosition = {
  paragraphIndex: number;
  sentenceIndex: number;
};

export type ReadAloudSource = {
  text: string;
  label: string;
};

// ── Course types ──────────────────────────────────────────────────────────────

export interface CoursePaperEntry {
  id: number;
  paper_id: number;
  paper_title: string | null;
  position: number;
  week_number: number | null;
  section_name: string | null;
  added_at: string;
}

export interface Course {
  id: number;
  owner_id: number;
  name: string;
  description: string | null;
  overview: string | null;
  reading_order: number[] | null;
  status: 'creating' | 'ready' | 'error';
  paper_count: number;
  created_at: string;
  updated_at: string;
  papers: CoursePaperEntry[];
}

export interface CourseProgress {
  course_id: number;
  total_papers: number;
  papers_read: number;
  papers_mastered: number;
  completion_pct: number;
}

export interface CourseUploadResult {
  filename: string;
  paper_id?: number;
  title?: string;
  status: 'ok' | 'error';
  detail?: string;
}

// ── End course types ──────────────────────────────────────────────────────────

export interface GroupNotesSummary {
  group_id: number;
  available: boolean;
  summary: string | null;
  paper_count: number;
  papers_with_content: number;
  total_highlights: number;
  total_comments: number;
  paper_blocks: PaperSummaryBlock[];
  generated_at?: string | null;
}
