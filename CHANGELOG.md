# Changelog

## 2025-11-07
### Added
- `STABILIZATION_PLAN.md` outlining strict-type, testing, and load-test strategy.
- RPC gateway helpers with dedicated unit coverage executed via Node's native test runner.
- k6 load-test scenarios for leaderboard browsing, shop traffic, and PvP hack RPCs.
- Documentation on quality gates and load testing commands.

### Changed
- Enabled strict TypeScript checking for service modules with new helper types and guards.
- Refactored Supabase RPC access to share common gateway utilities and avoid dynamic imports.
- Split Vite build output into vendor chunks to remove chunk-size warnings.
- Relaxed Supabase client environment guard to support test harnesses.

### Fixed
- Resolved Vite build warnings and improved type coverage for clan flows and question handling.
