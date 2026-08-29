from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def patch_diagram_builder() -> None:
    path = Path('components/geometry/DiagramBuilder.tsx')
    text = path.read_text(encoding='utf-8')

    text = replace_once(
        text,
        "import ShapesLibrary from './ShapesLibrary';\n",
        "import ShapesLibrary from './ShapesLibrary';\nimport GeometryUseInQuestion, { type GeometryUseInQuestionPayload } from './GeometryUseInQuestion';\n",
        'DiagramBuilder import',
    )
    text = replace_once(
        text,
        "  onComplete: () => void;\n",
        "  onComplete: () => void;\n  onUseInQuestion?: (payload: GeometryUseInQuestionPayload) => void;\n",
        'DiagramBuilder prop type',
    )
    text = replace_once(
        text,
        "const DiagramBuilder: React.FC<DiagramBuilderProps> = ({ teacherId, onComplete, schoolName = 'Brains Heist', schoolLogoUrl, teacherName = 'Teacher', schoolId }) => {",
        "const DiagramBuilder: React.FC<DiagramBuilderProps> = ({ teacherId, onComplete, onUseInQuestion, schoolName = 'Brains Heist', schoolLogoUrl, teacherName = 'Teacher', schoolId }) => {",
        'DiagramBuilder props destructure',
    )
    text = replace_once(
        text,
        "Build clean classroom diagrams, export a high-resolution PNG for a normal question, or add answer blanks for an interactive diagram question.",
        "Build clean classroom diagrams, send a tightly cropped SVG + PNG fallback straight into a normal question, or add answer blanks for an interactive diagram question.",
        'DiagramBuilder empty-state copy',
    )
    text = replace_once(
        text,
        "<span><strong className=\"text-slate-200\">3.</strong> Export PNG or add blanks</span>",
        "<span><strong className=\"text-slate-200\">3.</strong> Use in Question or add blanks</span>",
        'DiagramBuilder helper copy',
    )

    save_button_marker = """          <button
            onClick={handleSave}
"""
    use_in_question = """          {onUseInQuestion && (
            <GeometryUseInQuestion
              title={title}
              subject={subject}
              topic={topic}
              difficulty={difficulty}
              shapes={shapes}
              blanks={blanks}
              onUseInQuestion={onUseInQuestion}
            />
          )}
"""
    text = replace_once(
        text,
        save_button_marker,
        use_in_question + save_button_marker,
        'DiagramBuilder Use in Question button',
    )

    path.write_text(text, encoding='utf-8')


def patch_teacher_portal() -> None:
    path = Path('components/TeacherPortal.tsx')
    text = path.read_text(encoding='utf-8')

    marker = """              onComplete={() => setView('dashboard')}
"""
    replacement = """              onComplete={() => setView('dashboard')}
              onUseInQuestion={(asset) => {
                openMyPoolQuestionForm('Maths', asset.topic || 'Geometry');
                setQuestionImage(null);
                setQuestionImageUrl(asset.imageUrl);
                setSubject('Maths');
                setDifficulty(asset.difficulty);
                setQuestionType('multiple_choice');
                setQuestionText(asset.title === 'Geometry diagram' ? '' : asset.title);
              }}
"""
    text = replace_once(text, marker, replacement, 'TeacherPortal geometry handoff')
    path.write_text(text, encoding='utf-8')


if __name__ == '__main__':
    patch_diagram_builder()
    patch_teacher_portal()
    print('Patched geometry Use in Question integration.')
