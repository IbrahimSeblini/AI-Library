# MyLibraryPal Architecture

This document describes the intended product logic and how the system separates **private** (per-user) data from **shared** (global social) data.

---

## Core Idea

MyLibraryPal is a **private digital library for each user**. Each user has their own personal library; documents are private assets. The social layer (friends, groups, activity) is global and shared.

---

## Two Layers

### PRIVATE LAYER — User library and documents

- **User library**: Each user has their own set of papers. Papers are stored with an `owner_id` (user ID from auth).
- **PDFs / processed content**: When a user uploads or adds a document, it is stored only in that user’s library. No other user can access the document content.
- **Highlights**: Stored per user and only on papers that user can access (their library or legacy shared papers).
- **Implementation**:
  - **Library service**: `Paper` has `owner_id`. All list/search/get/create/update/delete operations require `X-User-Id` and are scoped to that user’s papers (or legacy `owner_id IS NULL`).
  - **Gateway**: Forwards `X-User-Id` from the JWT to the library for all paper and category requests.
  - **Frontend**: Sends auth for all paper/category API calls so the backend can enforce ownership.

### GLOBAL SOCIAL LAYER — Users, friends, groups, insights

- **Users / auth**: Stored in auth service; global identity.
- **Friends**: Mutual connections; stored in friends service DB. Works across machines/networks.
- **Groups**: Users can join via invite (friend, username, email) or public groups. Stored in groups service.
- **Activity insights**: Friends can see **metadata** (e.g. “read X”, time spent, subjects, streaks). They **cannot** see document content or open each other’s documents.
- **Implementation**:
  - **Friends service**: Own DB; friendships and reading activity (paper_id, paper_title, action). No document content.
  - **Study tracker**: Per-user reading time and categories; used for insights without exposing content.
  - **Groups**: Store `paper_title` on GroupPaper for display; document content is only available to the owner via the library.

---

## Document Privacy Rules

1. **List / search / recommendations**: Return only papers where `owner_id` is the current user or legacy (`owner_id IS NULL`).
2. **Get paper by ID**: Return full content only if the paper is in the current user’s library (or legacy).
3. **Create paper**: Set `owner_id` to the current user.
4. **Update / delete**: Allowed only for papers owned by the current user; legacy papers are read-only.
5. **Highlights**: Can be created only on papers the user can access.
6. **Friends insights**: May show titles and activity metadata; never expose document content. Opening a “trending” paper uses the current user’s library and returns 404 if they don’t own it.
7. **Groups**: When adding a paper to a group, the paper must be in the **adder’s** library. Group responses use stored `paper_title` for display; full content is only served by the library to the document owner.

---

## Scalability (PDF / documents)

- PDF processing and storage should be scalable (e.g. page limits, chunking, or background jobs) so that 2-page vs 40-page PDFs do not break stability or feature parity.
- Current design supports per-user documents and optional future PDF upload with the same ownership rules.

---

## Networking

- Social features (friends, groups, invitations) rely on a **shared backend** (gateway + services). Users on different machines/IPs/ports can interact as long as they reach the same gateway and services.

---

## Summary

| Layer   | Scope   | Examples                                      |
|--------|---------|-----------------------------------------------|
| Private| Per user| Papers, PDFs, highlights, library DB (by owner_id) |
| Global | Shared  | Users, friends, groups, invitations, activity insights (metadata only) |
