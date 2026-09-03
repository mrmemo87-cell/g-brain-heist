from pathlib import Path

path = Path('components/AdminPortal.tsx')
source = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    source = source.replace(old, new, 1)


replace_once(
    "import BackButton from './BackButton';\n",
    '',
    'remove legacy back button import',
)

replace_once(
    "import AdminContext from './admin/AdminContext';\n",
    "import AdminContext from './admin/AdminContext';\nimport SuperadminShell from './admin/SuperadminShell';\n",
    'superadmin shell import',
)

replace_once(
    "  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');\n",
    "  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');\n"
    "  const [visitedTabs, setVisitedTabs] = useState<Set<AdminTab>>(() => new Set<AdminTab>(['dashboard']));\n"
    "  const [viewRefreshVersions, setViewRefreshVersions] = useState<Partial<Record<AdminTab, number>>>({});\n",
    'visited tab state',
)

visited_effect_anchor = "  // Helper to calculate quiz stats\n"
visited_effect = """  // Keep a tab mounted after its first visit. This preserves filters, scroll state and
  // already-loaded local data instead of re-fetching/resetting every time the admin
  // moves between sections. Explicit Refresh can still remount independent views.
  useEffect(() => {
    setVisitedTabs((previous) => {
      if (previous.has(activeTab)) return previous;
      const next = new Set(previous);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

"""
replace_once(visited_effect_anchor, visited_effect + visited_effect_anchor, 'visited tab cache effect')

context_anchor = "\n\n  // ─── Context value for child components ──────────────\n"
refresh_active_view = r'''

  const refreshActiveView = useCallback(async () => {
    switch (activeTab) {
      case 'dashboard':
        await refreshAdminData();
        return;
      case 'users':
        await fetchUsers(userPage, searchQuery);
        return;
      case 'schools': {
        const tasks: Promise<unknown>[] = [loadSchoolOptions(), loadSchoolRequests()];
        if (schoolAdminSchoolId) {
          tasks.push(loadSchoolMembers(schoolAdminSchoolId));
          tasks.push(loadSchoolQuotas(schoolAdminSchoolId));
        }
        await Promise.all(tasks);
        return;
      }
      case 'applications':
        await Promise.all([loadSchoolRequests(), loadSchoolOptions()]);
        return;
      case 'analytics':
        await fetchAnalytics();
        return;
      case 'cambridge':
        await fetchQuizScores();
        return;
      case 'system':
        await fetchAnnouncements();
        return;
      default:
        // Tabs with self-contained loaders refresh by remounting only that visited
        // view. Other cached tabs remain mounted and keep their working state.
        setViewRefreshVersions((previous) => ({
          ...previous,
          [activeTab]: (previous[activeTab] ?? 0) + 1,
        }));
    }
  }, [
    activeTab,
    fetchAnalytics,
    fetchAnnouncements,
    fetchQuizScores,
    fetchUsers,
    loadSchoolMembers,
    loadSchoolOptions,
    loadSchoolQuotas,
    loadSchoolRequests,
    refreshAdminData,
    schoolAdminSchoolId,
    searchQuery,
    userPage,
  ]);
'''
replace_once(context_anchor, refresh_active_view + context_anchor, 'active view refresh controller')

return_start = source.find("  return (\n    <AdminContext.Provider value={contextValue}>")
if return_start < 0:
    raise SystemExit('return shell start marker not found')

export_marker = "\nexport default AdminPortal;"
export_start = source.find(export_marker, return_start)
if export_start < 0:
    raise SystemExit('export marker not found')

new_return = r'''  return (
    <AdminContext.Provider value={contextValue}>
      <SuperadminShell
        profile={profile}
        activeTab={activeTab}
        availableTabs={isSuperadmin ? SUPERADMIN_TABS : ADMIN_TABS}
        onTabChange={(tab) => setActiveTab(tab as AdminTab)}
        applicationsUnreadTotal={applicationsUnreadTotal}
        isSuperadmin={isSuperadmin}
        adminVisible={adminVisible}
        onToggleAdminVisibility={toggleAdminVisibility}
        onRefresh={refreshActiveView}
        onLogout={handleLogout}
        isLoggingOut={isLoggingOut}
      >
        <div className="min-w-0">
          {Array.from(visitedTabs).map((tab) => (
            <div
              key={`${tab}-${viewRefreshVersions[tab] ?? 0}`}
              hidden={tab !== activeTab}
              aria-hidden={tab !== activeTab}
            >
              {tab === 'dashboard' && <DashboardTab />}
              {tab === 'users' && <UsersTab />}
              {tab === 'question-bank' && isSuperadmin && (
                <React.Suspense fallback={<div className="card-glass p-8 text-center text-slate-400">Opening the protected question vault…</div>}>
                  <QuestionBankInspectorTab />
                </React.Suspense>
              )}
              {tab === 'schools' && <SchoolsTab />}
              {tab === 'applications' && <ApplicationsTab />}
              {tab === 'identity-requests' && isSuperadmin && <IdentityRequestsTab addToast={addToast} />}
              {tab === 'booked-appointments' && <BookedAppointmentsTab />}
              {tab === 'billing' && <BillingAccessTab />}
              {tab === 'game' && <GameTab />}
              {tab === 'clans' && <ClansTab />}
              {tab === 'analytics' && <AnalyticsTab />}
              {tab === 'cambridge' && <CambridgeTab />}
              {tab === 'ielts' && <IeltsTab />}
              {tab === 'system' && <SystemTab />}
            </div>
          ))}
        </div>
      </SuperadminShell>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-content, .print-content * { visibility: visible; }
          .print-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
          }
          .print-modal-overlay {
            position: static !important;
            display: block !important;
            overflow: visible !important;
            background: white !important;
            padding: 0 !important;
          }
          .no-print, .print-content button { display: none !important; }
        }
      `}</style>

      <ReportModal />
      <AnswerReflectionModal />
      <AnnouncementModal />
    </AdminContext.Provider>
  );
};
'''

source = source[:return_start] + new_return + source[export_start:]
path.write_text(source, encoding='utf-8')
print('Applied guarded Superadmin portal shell + cached-view refresh architecture.')
