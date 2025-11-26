# Visual Guide: Cancel Pending Clan Join Requests

## User Interface

### Pending Request Card - Before
```
┌─────────────────────────────────────────────┐
│ Request Pending                             │
│                                             │
│ Awaiting approval to join Alpha Clan. A     │
│ leader or moderator will review your        │
│ request soon.                               │
└─────────────────────────────────────────────┘
```

### Pending Request Card - After
```
┌───────────────────────────────────────────────────┐
│ Request Pending                              ✕   │
│ Awaiting approval to join Alpha Clan. A           │
│ leader or moderator will review your request soon.│
└───────────────────────────────────────────────────┘
         Click ✕ to cancel your request
```

### Loading State
```
┌───────────────────────────────────────────────────┐
│ Request Pending                              ...  │
│ (button is disabled while processing)            │
└───────────────────────────────────────────────────┘
```

### Success
```
Toast notification appears:
┌──────────────────────────────┐
│ ✓ Join request canceled.     │
└──────────────────────────────┘

Pending request card disappears
```

### Error
```
Toast notification appears:
┌──────────────────────────────────────┐
│ ✗ Only pending requests can be       │
│   canceled.                          │
└──────────────────────────────────────┘

Pending request card remains
```

## Component Architecture

### ClanView Component Flow
```
ClanView (Main Component)
├── State Management
│   ├── pendingJoinRequest (loaded on mount)
│   ├── isCancelingRequest (loading state)
│   └── other clan-related state
│
├── Handlers
│   ├── handleCancelJoinRequest() ✨ NEW
│   ├── handleApproveJoinRequest()
│   ├── handleRejectJoinRequest()
│   └── other handlers
│
└── Render
    ├── renderInClan()
    ├── renderNoClan() ← Contains pending request UI
    └── renderJoinView()
```

### renderNoClan Component Structure
```
<div className="text-center">
  <h2>Join the Syndicate</h2>
  <p>You are not currently part of a clan...</p>
  
  {pendingJoinRequest && (
    <div className="card-glass">                    ← Updated
      <div className="flex justify-between">       ← New flex layout
        <div>
          <p>Request Pending</p>
          <p>Awaiting approval...</p>
        </div>
        <button                                     ← New cancel button
          onClick={handleCancelJoinRequest}
          disabled={isCancelingRequest}
        >
          {isCancelingRequest ? '...' : '✕'}
        </button>
      </div>
    </div>
  )}
  
  <div className="space-y-4">
    <button>Create a Clan</button>
    <button>Join a Clan</button>
  </div>
</div>
```

## Data Flow Diagram

### User Cancels Request

```
User clicks ✕ button
        ↓
handleCancelJoinRequest() is called
        ↓
setIsCancelingRequest(true)  [Loading state begins]
        ↓
Call: GameService.clan_cancel_join_request(requestId)
        ↓
     API Layer (gameService.ts)
        ↓
     Fetch request from DB
        ↓
     Validate ownership & status
        ↓
     Delete request
        ↓
     Return success
        ↓
setPendingJoinRequest(null)  [Clear from UI]
        ↓
Show success toast
        ↓
setIsCancelingRequest(false)  [Loading state ends]
```

## Database Interaction

### Before Cancel Request
```
clan_join_requests table
┌─────────────────────────────────┐
│ id    │ clan_id │ user_id │ ... │
├───────┼─────────┼─────────┼─────┤
│ req-1 │ clan-a  │ user-1  │ ... │ ← This request exists
│ req-2 │ clan-b  │ user-2  │ ... │
└─────────────────────────────────┘
```

### After Cancel Request
```
clan_join_requests table
┌─────────────────────────────────┐
│ id    │ clan_id │ user_id │ ... │
├───────┼─────────┼─────────┼─────┤
│ req-2 │ clan-b  │ user-2  │ ... │
└─────────────────────────────────┘
       ↑ req-1 was deleted
```

## API Call Sequence

### Request/Response Flow

```
Client (React Component)
    │
    │ clan_cancel_join_request(requestId)
    ↓
Backend (gameService.ts)
    │
    ├─→ getCurrentUser()
    │       ↓
    │    Returns current user ID
    │
    ├─→ Fetch request by ID
    │       ↓
    │    SELECT user_id, status FROM clan_join_requests WHERE id = ?
    │
    ├─→ Validate ownership
    │       if request.user_id !== user.id → Error
    │
    ├─→ Validate status
    │       if request.status !== 'pending' → Error
    │
    ├─→ Delete request
    │       DELETE FROM clan_join_requests WHERE id = ?
    │       (RLS enforces: user_id = auth.uid())
    │
    └─→ Return success
            ↓
        UI updates: setPendingJoinRequest(null)
            ↓
        Toast: "Join request canceled."
```

## State Management Timeline

### Initial Load
```
Time: Page loads
State: {
  pendingJoinRequest: null,      ← No request yet
  isCancelingRequest: false      ← Not processing
}
        ↓
useEffect runs
        ↓
API: clan_get_my_pending_request()
        ↓
State: {
  pendingJoinRequest: { id, clan_id, clan_name, ... },  ← Request loaded
  isCancelingRequest: false
}
```

### User Clicks Cancel
```
Time: User clicks ✕ button
State: {
  pendingJoinRequest: { ... },   ← Still exists
  isCancelingRequest: false      ← About to process
}
        ↓
handleCancelJoinRequest() called
        ↓
State: {
  pendingJoinRequest: { ... },   ← Still displaying
  isCancelingRequest: true       ← Processing started
}
        ↓
API call completes
        ↓
State: {
  pendingJoinRequest: null,      ← Cleared (card disappears)
  isCancelingRequest: false      ← Processing finished
}
```

## Security Boundaries

### RLS Policy Enforcement
```
User makes DELETE request
        ↓
RLS Policy evaluated:
├─ Is user_id = auth.uid()? 
│  YES → Allow
│  NO → Check next condition
│
├─ Is user in clan_members with leader/moderator role?
│  YES → Allow
│  NO → DENY (403 Forbidden)
        ↓
Request processed or rejected
```

### Multi-Layer Validation
```
Layer 1: Client-side
├─ Check request exists
├─ Check button not already loading
└─ Send request

Layer 2: API validation
├─ Check user owns request
├─ Check request is pending
└─ Proceed to delete

Layer 3: Database RLS
├─ Check auth.uid() = user_id
└─ Execute or deny

Result: Defense in depth
```

## Error Scenarios

### Scenario 1: Request Already Rejected
```
Flow:
1. User has pending request
2. Leader rejects it (status → 'rejected')
3. User clicks cancel button
4. API returns: "Only pending requests can be canceled"
5. Toast shows error
6. Card remains visible (not deleted)

Result: User can still request to join another clan
```

### Scenario 2: No Permission (Shouldn't Happen)
```
Flow:
1. User somehow makes DELETE request for another user's request
2. RLS policy evaluates
3. user_id ≠ auth.uid() AND not leader of clan
4. RLS denies request (403 Forbidden)
5. Client shows generic error

Result: Request not deleted, security maintained
```

### Scenario 3: Network Error During Cancel
```
Flow:
1. User clicks cancel button
2. State: isCancelingRequest = true
3. Network request fails
4. API throws error
5. Error toast displayed
6. State: isCancelingRequest = false
7. Card remains (can retry)

Result: User can try again
```

## Code Snippets

### Frontend Handler
```typescript
const handleCancelJoinRequest = async () => {
    if (!pendingJoinRequest) return;
    setIsCancelingRequest(true);
    try {
        await GameService.clan_cancel_join_request(pendingJoinRequest.id);
        setPendingJoinRequest(null);
        addToast("Join request canceled.", "success");
    } catch (error: any) {
        addToast(error?.message || "Failed to cancel request.", "error");
    } finally {
        setIsCancelingRequest(false);
    }
};
```

### Backend Function
```typescript
export const clan_cancel_join_request = async (requestId: string) => {
    const user = await getCurrentUser();
    
    // Fetch request
    const { data: request } = await supabase
        .from('clan_join_requests')
        .select('user_id, status')
        .eq('id', requestId)
        .single();

    // Validate
    if (request.user_id !== user.id) throw Error("Not your request");
    if (request.status !== 'pending') throw Error("Already processed");

    // Delete (RLS enforced)
    await supabase
        .from('clan_join_requests')
        .delete()
        .eq('id', requestId);

    return true;
};
```

### SQL RLS Policy
```sql
CREATE POLICY "clan_join_requests_delete" ON clan_join_requests
    FOR DELETE
    USING (
        -- Users can delete their own requests
        user_id = auth.uid()
        OR
        -- Leaders can delete requests in their clan
        clan_id IN (
            SELECT clan_id FROM clan_members 
            WHERE user_id = auth.uid() 
            AND role IN ('leader', 'moderator')
        )
    );
```

## Deployment Order

```
1. Deploy SQL migration
   └─ Updates RLS policy in Supabase
   └─ ✅ Users can now delete their requests

2. Deploy gameService.ts
   └─ Adds clan_cancel_join_request() function
   └─ ✅ API layer ready

3. Deploy ClanView.tsx
   └─ Adds UI and handlers
   └─ ✅ Users see cancel button

4. Clear browser cache
   └─ Users refresh
   └─ ✅ New code loaded

5. Test feature
   └─ End-to-end verification
   └─ ✅ Ready for production
```
