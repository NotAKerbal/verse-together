# Verse Together Feature Ideas

This document captures potential product features to guide roadmap planning.

## High-Impact Near-Term Ideas

1. Cloud-synced folders for notes
- Move folder metadata from local `localStorage` to Convex so folders are consistent across devices and accounts.
- Current gap: note organization in `src/components/NotesWorkspace.tsx` is local-only.

2. Full-text note search
- Add search across note content (`insightDraftBlocks.text`), not just title/tag/folder filters.
- Goal: make older insights easy to retrieve quickly.


3. Insight version history
- Track draft snapshots or diffs and allow restore.
- Goal: improve trust, reduce fear of editing/deleting content, support iterative study.

4. Verse-linked personal annotation layer
- Let users attach personal/public annotations directly to verse numbers in the chapter reader.
- Keep this separate from social share/comment flows.

## Mid-Term Expansion Ideas

5. Weekly study plans + streak tracking
- Offer structured study plans (for example, 5-day topical plans) with completion tracking.
- Optional reminders can improve consistency.

6. Better social feed ranking + following
- Improve ranking with friends/following priority, mute controls, and personalization.
- Current feed behavior in `convex/social.ts` is mostly reaction count + recency.

7. Shared study groups (persistent, not only friendships)
- Introduce group entities with group-only note collections, insights, and discussion.
- This supports recurring classes or family/group study.

## Advanced / Differentiating Ideas

8. Citation and source graph for insights
- Visualize relationships between verses, talks, notes, and reused ideas.
- Build on existing citation-related APIs and features.

9. Mobile capture quick actions
- Add one-tap actions from reader selection: save verse to note, add dictionary block, share with comment.
- Goal: reduce friction for rapid capture during reading.

## Suggested Prioritization

1. Cloud-synced folders for notes
2. Full-text note search
3. Insight version history
4. Verse-linked annotations
5. Weekly study plans + streaks
6. Feed ranking + following
7. Shared study groups
8. Citation/source graph
9. Mobile quick-capture actions
