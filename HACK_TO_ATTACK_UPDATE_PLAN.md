# Update Hack Terminology to Attack - G-Brains Heist

This script updates all instances of "hack" terminology to "attack" throughout the codebase.

## Files to Update:

### 1. Core Game Service
- `services/gameService.ts` - Main game logic
- `services/rpcGateway.ts` - RPC function calls
- `services/audioService.ts` - Sound effect names

### 2. React Components  
- `components/PvPView.tsx` - PvP battle interface
- `components/NewsFeed.tsx` - Activity feed text
- `components/MainActions.tsx` - Action button text
- `components/TutorialModal.tsx` - Tutorial descriptions
- `components/icons/index.tsx` - Icon names
- `App.tsx` - Main app logic

### 3. Database & SQL
- `CLEAN_SUPABASE_MIGRATION.sql` - Database migration
- `COMPLETE_SUPABASE_MIGRATION.sql` - Alternative migration
- `load-tests/pvp.js` - Load testing scripts
- `supabase-functions/` - Various RPC functions

### 4. Documentation
- `README.md` - Project documentation
- `FEATURES_SUMMARY.md` - Feature descriptions
- `MULTIPLAYER-FEATURES.md` - Multiplayer documentation
- Various other markdown files

## Terminology Changes:

| Old Term | New Term |
|----------|----------|
| hack | attack |
| Hack | Attack |
| HACK | ATTACK |
| hacker | attacker |
| Hacker | Attacker |
| hacking | attacking |
| Hacking | Attacking |
| hacked | attacked |
| Hacked | Attacked |
| hack_win | attack_win |
| hack_fail | attack_fail |
| HackIcon | AttackIcon |
| performHackAttempt | performAttackAttempt |
| rpc_hack_attempt | rpc_attack_attempt |
| simulateHackAttempt | simulateAttackAttempt |

## Implementation Notes:

1. **Audio Files**: Rename sound files from `hack_win.mp3` to `attack_win.mp3` and `hack_fail.mp3` to `attack_fail.mp3`

2. **Database Functions**: Update RPC function names and references

3. **Component Props**: Update any props or interfaces that reference "hack"

4. **Comments**: Update code comments to use new terminology

5. **Toast Messages**: Update user-facing messages

6. **Achievement Names**: Update achievement descriptions

## Testing Required:

After implementing these changes, test:
- PvP attack functionality
- Audio playback for attack sounds
- News feed activity messages
- Achievement unlocking
- Database RPC calls
- Load testing scripts

## Backward Compatibility:

Consider creating aliases for old RPC function names during transition period if needed for existing data.