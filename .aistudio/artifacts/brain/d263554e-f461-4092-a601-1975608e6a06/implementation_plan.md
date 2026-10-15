# Implementation Plan: 300-Participant High-Concurrency Optimization on Supabase

Scale the Bhagavad Gita Live Quiz platform to reliably support **300 simultaneous participants** within Supabase free quota limits using **Realtime Broadcast with intelligent staggered fallback polling** and **host-aggregated leaderboard distribution**.

---

## 1. Concurrency Analysis & Bottlenecks

1. **200 Realtime Connection Cap (Free Tier)**:
   * Supabase Free tier enforces a cap of 200 concurrent Realtime connections. When player count reaches 300, ~100 participants may fail to establish or maintain a persistent WebSocket channel.
   * **Solution**: Implement a hybrid transport in `ParticipantView`. If WebSocket disconnects or fails to subscribe, seamlessly fall back to lightweight HTTP polling with randomized jitter (3–4s ± 500ms) to prevent thundering herd.

2. **Thundering Herd on Question Transitions**:
   * If all 300 participants independently query `SELECT * FROM participants` when a question ends, 300 simultaneous queries hit PostgreSQL in the exact same second, causing query timeouts and log spikes.
   * **Solution**: Host-side leaderboard aggregation. During `REVEAL` and `INTERMISSION`, the Host calculates the top leaderboard standings and publishes them via Realtime Broadcast payload. Participants receive the ready-to-render standings without querying the database.

3. **Burst Write Contention on Answer Submissions**:
   * 300 participants submitting answers in a 2-second window can exhaust direct database connection pools.
   * **Solution**:
     * Immediate optimistic UI lock-in (instant feedback to participant).
     * Micro-staggered async submission with randomized jitter (0–250ms).
     * Lean update payload targeting only `(score, total_time_taken, last_time_taken, last_answered_correctly, answered_question_index)` on the primary key `id`.

---

## 2. Proposed Architecture & Changes

### A. Realtime Broadcast & Staggered Polling (`services/syncService.ts`)
* **Realtime Broadcast Channel**: Use Supabase `broadcast` (ephemeral high-throughput pub/sub) for room state updates (`question_change`, `reveal`, `intermission_leaderboard`).
* **Connection Resiliency Listener**: Monitor `CHANNEL_STATUS` (`SUBSCRIBED`, `CLOSED`, `CHANNEL_ERROR`). If WebSocket is rejected or closed (e.g. over 200 connection limit), automatically activate the jittered HTTP polling fallback.
* **Lightweight Jittered Polling**:
  ```ts
  // Avoid all 300 clients hitting the database simultaneously
  const nextInterval = 3000 + Math.random() * 1500;
  ```
* **Payload Thinning**: Stop querying unnecessary columns; retrieve only essential columns for room status and leaderboard calculation.

### B. Host Leaderboard Broadcasting (`components/LiveAdminSession.tsx`)
* When transitioning from `ACTIVE` → `REVEAL` and `REVEAL` → `INTERMISSION`:
  * Host computes `sortLeaderboard(participants)` in memory.
  * Host broadcasts the Top 20 and stats snapshot over the `room-broadcast-${roomCode}` channel.
  * Host saves the final standings so participants can read them directly.

### C. Participant Resilient Synchronization (`components/ParticipantView.tsx`)
* **Hybrid Sync Listener**:
  * Listens to both Realtime Broadcast and Postgres changes.
  * Updates instantly when the Host broadcasts a question change or leaderboard.
  * If disconnected or on fallback, polls with randomized intervals (3–4.5s) only while the tab is visible.
* **Micro-Staggered Submission**:
  * Immediate client-side lock-in with 3D particle feedback.
  * Subtle 0–250ms async jitter on database `updateParticipantInRoom` to smooth out traffic spikes.
* **Efficient My-Rank Resolution**:
  * Participant determines their rank from the broadcasted leaderboard snapshot or single participant record lookup.

### D. Database Indexing & Query Tuning
* Verify index on `participants(room_code)` and `rooms(room_code)`.
* Replace any remaining `ILIKE` operations with exact uppercase matches (`.eq('room_code', code)`), which utilize B-tree indexes with O(log n) efficiency.

---

## 3. Verification & Load Validation Plan

1. **Compilation & Linting**:
   * Run `compile_applet` and `tsc --noEmit` to ensure clean type safety and zero build warnings.
2. **Simulated High-Concurrency Test**:
   * Create a local test script simulating 50–100 rapid concurrent answer submissions to verify no connection pool drops or timeouts.
3. **Graceful Fallback Verification**:
   * Simulate WebSocket disconnect in the browser console to verify that the jittered HTTP fallback activates automatically and transitions correctly between Waiting, Active, Reveal, and Intermission.
4. **End-to-End Quiz Flow**:
   * Test hosting a quiz from Admin, joining from multiple windows/devices, submitting answers simultaneously, and observing instant leaderboard updates.
