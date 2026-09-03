from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


# 1) LightModeProvider must not force the professional platform palette onto public auth pages.
path = Path("src/contexts/LightModeContext.tsx")
text = path.read_text()
old = """  useEffect(() => {\n    document.body.classList.add('platform-light-theme');\n    return () => {\n      document.body.classList.remove('platform-light-theme');\n    };\n  }, []);\n"""
text = replace_once(text, old, "", "remove global platform light body class")
path.write_text(text)

# 2) Activate the professional light palette only for authenticated Brains Heist sessions.
path = Path("index.tsx")
text = path.read_text()
anchor = """  useEffect(() => {\n    isAuthenticatedRef.current = isAuthenticated;\n  }, [isAuthenticated]);\n"""
insertion = anchor + """\n  useEffect(() => {\n    if (isAuthenticated) {\n      document.body.classList.add('platform-light-theme');\n    } else {\n      document.body.classList.remove('platform-light-theme');\n    }\n\n    return () => {\n      document.body.classList.remove('platform-light-theme');\n    };\n  }, [isAuthenticated]);\n"""
text = replace_once(text, anchor, insertion, "authenticated platform theme scope")
path.write_text(text)

# 3) Strengthen Superadmin contrast while preserving the current UX structure and controls.
path = Path("src/styles/platform-light-theme.css")
text = path.read_text()
contrast = r'''

/* Superadmin accessibility contrast pass.
 * Legacy tabs still carry neon-era text utilities. On the professional light shell
 * those pale values resolve to readable enterprise colors instead of pastel-on-white.
 */
body.platform-light-theme .superadmin-shell [class*="text-cyan-100"],
body.platform-light-theme .superadmin-shell [class*="text-cyan-200"],
body.platform-light-theme .superadmin-shell [class*="text-cyan-300"] {
  color: #0e5f7a !important;
}

body.platform-light-theme .superadmin-shell [class*="text-blue-100"],
body.platform-light-theme .superadmin-shell [class*="text-blue-200"],
body.platform-light-theme .superadmin-shell [class*="text-blue-300"] {
  color: #1d4ed8 !important;
}

body.platform-light-theme .superadmin-shell [class*="text-emerald-100"],
body.platform-light-theme .superadmin-shell [class*="text-emerald-200"],
body.platform-light-theme .superadmin-shell [class*="text-green-100"],
body.platform-light-theme .superadmin-shell [class*="text-green-200"] {
  color: #047857 !important;
}

body.platform-light-theme .superadmin-shell [class*="text-amber-100"],
body.platform-light-theme .superadmin-shell [class*="text-amber-200"],
body.platform-light-theme .superadmin-shell [class*="text-yellow-100"],
body.platform-light-theme .superadmin-shell [class*="text-yellow-200"] {
  color: #92400e !important;
}

body.platform-light-theme .superadmin-shell [class*="text-red-100"],
body.platform-light-theme .superadmin-shell [class*="text-red-200"],
body.platform-light-theme .superadmin-shell [class*="text-rose-100"],
body.platform-light-theme .superadmin-shell [class*="text-rose-200"] {
  color: #b42318 !important;
}

body.platform-light-theme .superadmin-shell [class*="text-purple-100"],
body.platform-light-theme .superadmin-shell [class*="text-purple-200"],
body.platform-light-theme .superadmin-shell [class*="text-fuchsia-100"],
body.platform-light-theme .superadmin-shell [class*="text-fuchsia-200"] {
  color: #6d28d9 !important;
}

body.platform-light-theme .superadmin-shell [class*="text-gray-500"],
body.platform-light-theme .superadmin-shell [class*="text-slate-500"] {
  color: #64748b !important;
}

body.platform-light-theme .superadmin-shell .card-glass {
  border-color: #dbe3ee !important;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06) !important;
}

body.platform-light-theme .superadmin-shell :is(input, textarea, select) {
  color: #0f172a !important;
  background-color: #ffffff !important;
}

body.platform-light-theme .superadmin-shell :is(input, textarea)::placeholder {
  color: #94a3b8 !important;
  opacity: 1 !important;
}

body.platform-light-theme .superadmin-shell button:disabled {
  opacity: 0.58 !important;
}
'''
if "Superadmin accessibility contrast pass." not in text:
    text += contrast
path.write_text(text)

# 4) Lock the regression contract in tests.
path = Path("tests/platformLightTheme.test.ts")
text = path.read_text()
text = replace_once(
    text,
    "  assert.match(context, /platform-light-theme/);",
    "  assert.doesNotMatch(context, /classList\\.add\\('platform-light-theme'\\)/);\n  assert.match(entry, /if \\(isAuthenticated\\)[\\s\\S]{0,220}classList\\.add\\('platform-light-theme'\\)/);",
    "theme scoping test",
)
extra = r'''

test('public LoginView keeps its original branded UX outside the authenticated light palette', () => {
  const login = readFileSync('components/LoginView.tsx', 'utf8');
  assert.match(login, /bg-\[#030a14\]/);
  assert.match(login, /bg-\[#081321\]\/90/);
  assert.match(login, /text-white/);
  assert.match(login, /from-cyan-300 via-cyan-400 to-teal-300/);
});

test('Superadmin legacy accent text is remapped to readable light-theme contrast', () => {
  assert.match(styles, /Superadmin accessibility contrast pass/);
  assert.match(styles, /text-cyan-100/);
  assert.match(styles, /#0e5f7a/i);
  assert.match(styles, /#047857/i);
  assert.match(styles, /#92400e/i);
  assert.match(styles, /#b42318/i);
});
'''
if "public LoginView keeps its original branded UX" not in text:
    text += extra
path.write_text(text)

print("Theme scoping and Superadmin contrast patch applied.")
