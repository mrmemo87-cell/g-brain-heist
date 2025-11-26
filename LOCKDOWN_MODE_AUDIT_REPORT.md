# Lockdown Mode Audit Report

## Executive Summary

After a comprehensive review of the Lockdown Mode feature (also referred to as "Clan Wars" / "Clan Territory"), I've identified several issues that need to be addressed. The system actually consists of **two separate implementations**:

1. **Lockdown Countdown** (`src/features/lockdown/`) - A heist game with alarm/coins/panic mechanics
2. **Clan Territory Wars** (`src/features/clanTerritory/`) - A zone capture game with territory control

**The App.tsx is currently using ClanTerritoryManager for the "lockdown" view, which is the active system.**

---

## ✅ ISSUES FIXED

### 1. Memory Leak in Transport - FIXED ✅
**File**: `clanTerritorySupabaseTransport.ts`

**Problem**: The `setInterval` for game ticks was never cleared.

**Solution**: 
- Added `tickInterval` property to store interval ID
- Added proper cleanup in `cleanup()` method
- Updated `onGameState()` to call `cleanup()` on unsubscribe

### 2. Interval Cleanup on Unmount - FIXED ✅
**File**: `ClanTerritoryManager.tsx`

**Problem**: Component unmount didn't clean up all intervals.

**Solution**: Updated cleanup effect to call `transport.cleanup()`

### 3. Error Boundaries Added - FIXED ✅
**File**: `ClanTerritoryErrorBoundary.tsx` (NEW)

**Solution**: Created error boundary component that:
- Catches errors in child components
- Displays user-friendly error message
- Provides retry and exit options
- Wrapped TeacherView and StudentView with error boundaries

### 4. Transport Interface Updated - FIXED ✅
**File**: `clanTerritoryTransport.ts`

**Solution**: Added missing methods to interface:
- `startDiscovery()`
- `stopDiscovery()`
- `cleanup()`

---

## 🔴 REMAINING ISSUES (Non-Critical)

### 1. Duplicate/Conflicting Type Definitions
**Severity: HIGH**

There are **3 different `lockdownTypes.ts` files** with incompatible type definitions:

| File | Purpose | Issues |
|------|---------|--------|
| `src/features/lockdown/lockdownTypes.ts` | Full game types (GameState, PlayerState, etc.) | Main definition |
| `src/lib/lockdownTypes.ts` | Simpler event types | Different GameState interface |
| `components/lockdownTypes.ts` | Legacy types | Completely different structure |

**Impact**: Import confusion, potential runtime errors if wrong types are used.

**Fix Required**: Consolidate into a single source of truth or clearly namespace them.

---

### 2. Memory Leak in Supabase Transport
**Severity: HIGH**

In `clanTerritorySupabaseTransport.ts` (line 180-189):

```typescript
setInterval(() => {
    if (this.state.phase === 'ACTIVE') {
        const newState = clanTerritoryReducer(this.state, { type: 'TICK' });
        // ...
    }
}, 1000);
```

**Problem**: This `setInterval` is **never cleared** when the component unmounts or when the game ends.

**Impact**: Memory leak, continued execution after game ends, potential multiple intervals if game is re-hosted.

**Fix Required**: Store interval ID and clear on cleanup:
```typescript
private tickInterval: NodeJS.Timer | null = null;
// In setupChannel:
this.tickInterval = setInterval(...);
// In cleanup:
if (this.tickInterval) clearInterval(this.tickInterval);
```

---

### 3. LockdownManager Not Actually Used
**Severity: HIGH**

In `App.tsx` (line 894-903):

```tsx
case 'lockdown':
  return renderLazy(
    <ClanTerritoryManager  // ← Should this be LockdownManager?
      onExit={() => setView('dashboard')}
      ...
    />
  );
```

**Problem**: The `LockdownManager` component exists but is never imported or used. The "lockdown" view actually renders `ClanTerritoryManager`.

**Impact**: The entire `src/features/lockdown/` codebase (Lockdown Countdown game) is unused.

**Fix Required**: Either:
- Import and use `LockdownManager` if the heist game is desired
- Or rename the feature to clarify it's "Clan Territory Wars"

---

## 🟡 MEDIUM ISSUES

### 4. Race Condition in Room Discovery
**Severity: MEDIUM**

In `clanTerritorySupabaseTransport.ts`:
- Students listen for `room_open` broadcasts on channel subscription
- If a student subscribes AFTER the teacher's last broadcast (2 second interval), they must wait up to 2 seconds
- No reconnection logic if the connection drops

**Impact**: Delayed room discovery, potential infinite wait if teacher leaves.

---

### 5. No Error Boundaries in Lockdown Views
**Severity: MEDIUM**

The React components (`LockdownTeacherView`, `LockdownStudentView`, `ClanTerritoryStudentView`) don't have error boundaries.

**Impact**: A single error crashes the entire game view.

---

### 6. Asset Path Issue - Territory Map
**Severity: MEDIUM**

In `LockdownMap.tsx`:
```typescript
// @ts-expect-error - Vite injects raw SVG strings for ?raw imports
import territoryMapSvgRaw from "./assets/territory_map.svg?raw";
```

The `@ts-expect-error` suppresses the type error, but the import may fail if:
- Build system doesn't support `?raw` imports
- File doesn't exist

**Note**: The file exists at `src/features/lockdown/assets/territory_map.svg`, but the Vite-specific import syntax could cause issues.

---

### 7. Missing Cleanup in SupabaseLockdownTransport
**Severity: MEDIUM**

In `src/lib/lockdownSupabaseTransport.ts` (line 41):
```typescript
this.tickInterval = setInterval(() => {
    if (this.state && this.state.phase === "ACTIVE_ROUNDS") {
        this.handleAction({ type: "TICK", elapsedMs: 1000 });
    }
}, 1000);
```

The `cleanup()` method exists and handles this, but components must explicitly call it. If the component unmounts without calling cleanup, the interval continues.

---

### 8. Hardcoded Questions in Student View
**Severity: MEDIUM**

In `LockdownStudentView.tsx`:
```typescript
const generateQuestion = () => {
  const a = Math.floor(Math.random() * 12) + 2;
  const b = Math.floor(Math.random() * 12) + 2;
  // Generates basic arithmetic questions
};
```

**Problem**: Questions are generated client-side with simple arithmetic, not from the teacher's question bank.

**Impact**: No customization, no variety, no curriculum integration.

---

## 🟢 MINOR ISSUES

### 9. Unused Imports and Code
**Severity: LOW**

- `src/lib/lockdownAnalytics.ts` - File exists but usage unclear
- `src/lib/brains_heist/lockdownCountdownTypes.ts` - Duplicate types
- `src/lockdownDemo.ts` - Demo file, may be for testing only

---

### 10. Type Assertion Warnings
**Severity: LOW**

Multiple `as any` casts in action handling:
```typescript
sendCommand({ type: 'KICK_PLAYER', playerId: p.id } as any)
```

These bypass TypeScript's type safety.

---

### 11. Missing Player Validation
**Severity: LOW**

When a player submits an answer, there's no server-side validation that:
- The player exists
- The answer submission is within the time limit
- The player hasn't already answered

---

## 📋 RECOMMENDED FIXES (Priority Order)

1. **[CRITICAL]** Decide on one implementation (Lockdown Countdown vs Clan Territory Wars) or properly differentiate them in the UI
2. **[CRITICAL]** Fix memory leaks by adding proper interval cleanup
3. **[CRITICAL]** Consolidate type definitions into one location
4. **[HIGH]** Add error boundaries to game view components
5. **[MEDIUM]** Connect question system to teacher's question bank
6. **[MEDIUM]** Add reconnection logic for dropped connections
7. **[LOW]** Clean up unused files and imports

---

## Quick Fix Commands

To run TypeScript checks on lockdown files specifically:
```bash
npx tsc --noEmit src/features/lockdown/*.ts src/features/lockdown/*.tsx
```

To find all lockdown-related files:
```bash
Get-ChildItem -Recurse -Filter "*lockdown*"
```

---

## Files Reviewed

1. `src/features/lockdown/lockdownTypes.ts` ✅
2. `src/features/lockdown/lockdownEngine.ts` ✅
3. `src/features/lockdown/regionCalculator.ts` ✅
4. `src/features/lockdown/defaultRoomSettings.ts` ✅
5. `src/features/lockdown/LockdownManager.tsx` ✅
6. `src/features/lockdown/LockdownTeacherView.tsx` ✅
7. `src/features/lockdown/LockdownStudentView.tsx` ✅
8. `src/features/lockdown/LockdownMap.tsx` ✅
9. `src/lib/lockdownTransport.ts` ✅
10. `src/lib/lockdownSupabaseTransport.ts` ✅
11. `src/lib/lockdownQuestions.ts` ✅
12. `src/features/clanTerritory/ClanTerritoryManager.tsx` ✅
13. `src/features/clanTerritory/clanTerritorySupabaseTransport.ts` ✅
14. `App.tsx` (lockdown view) ✅
15. `tests/lockdownEngine.test.ts` ✅

---

*Report generated after comprehensive code audit*
