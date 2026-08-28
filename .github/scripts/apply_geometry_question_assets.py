from pathlib import Path
import re

ROOT = Path(".")
diagram_builder = ROOT / "components/geometry/DiagramBuilder.tsx"
toolbar = ROOT / "components/geometry/DiagramToolbar.tsx"
teacher_portal = ROOT / "components/TeacherPortal.tsx"

def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

source = diagram_builder.read_text(encoding="utf-8")
source = replace_once(
    source,
    "import ShapesLibrary from './ShapesLibrary';\n",
    "import ShapesLibrary from './ShapesLibrary';\nimport { buildDiagramQuestionAsset, downloadDiagramFile, type DiagramPaddingPreset, type DiagramQuestionAsset } from './diagramExport';\n",
    "DiagramBuilder exporter import",
)
source = replace_once(
    source,
    "  schoolId?: string | null;\n}",
    "  schoolId?: string | null;\n  onUseInQuestion?: (asset: DiagramQuestionAsset) => void;\n}",
    "DiagramBuilder callback prop",
)
source = replace_once(
    source,
    "const DiagramBuilder: React.FC<DiagramBuilderProps> = ({ teacherId, onComplete, schoolName = 'Brains Heist', schoolLogoUrl, teacherName = 'Teacher', schoolId }) => {",
    "const DiagramBuilder: React.FC<DiagramBuilderProps> = ({ teacherId, onComplete, schoolName = 'Brains Heist', schoolLogoUrl, teacherName = 'Teacher', schoolId, onUseInQuestion }) => {",
    "DiagramBuilder callback destructure",
)
source = replace_once(
    source,
    "  const [view, setView] = useState<'editor' | 'list'>('list');\n",
    "  const [view, setView] = useState<'editor' | 'list'>('list');\n  const [questionPadding, setQuestionPadding] = useState<DiagramPaddingPreset>('standard');\n  const [exportingAssets, setExportingAssets] = useState(false);\n",
    "DiagramBuilder export state",
)
old_export = r'''  // Export diagram as PNG image (for use in regular questions)
  const handleExportImage = () => {
    const stage = stageRef.current as { toDataURL?: (config: { pixelRatio: number }) => string } | null;
    if (!stage?.toDataURL) {
      brainsAlert('Cannot export — canvas not ready.', 'error');
      return;
    }

    try {
      const dataUrl = stage.toDataURL({ pixelRatio: 4 });

      // Create download link
      const link = document.createElement('a');
      link.download = `diagram-${title || 'untitled'}-${Date.now()}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Also copy to clipboard if supported
      if (navigator.clipboard) {
        fetch(dataUrl)
          .then(res => res.blob())
          .then(blob => {
            navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]).then(() => {
              brainsAlert('Image downloaded and copied to clipboard. You can now paste it directly into question creation.', 'success');
            }).catch(() => {
              // Clipboard failed, but download succeeded
            });
          });
      }
    } catch (e) {
      console.error('Export failed:', e);
      brainsAlert('Unable to export image.', 'error');
    }
  };
'''
new_export = r'''  const createQuestionAssets = async () => buildDiagramQuestionAsset({
    shapes,
    blanks,
    title,
    subject,
    difficulty,
    paddingPreset: questionPadding,
  });

  // Export classroom-ready SVG plus a transparent PNG fallback.
  const handleExportImage = async () => {
    if (shapes.length === 0 && blanks.length === 0) {
      brainsAlert('Add at least one visible diagram element before exporting.', 'info');
      return;
    }

    try {
      setExportingAssets(true);
      const asset = await createQuestionAssets();
      downloadDiagramFile(asset.svgFile);
      window.setTimeout(() => downloadDiagramFile(asset.pngFile), 150);
      brainsAlert(`Exported cropped SVG + PNG with ${asset.padding}px safe padding.`, 'success');
    } catch (error) {
      console.error('Export failed:', error);
      brainsAlert(error instanceof Error ? error.message : 'Unable to export diagram assets.', 'error');
    } finally {
      setExportingAssets(false);
    }
  };

  const handleUseInQuestion = async () => {
    if (!onUseInQuestion) return;
    if (shapes.length === 0 && blanks.length === 0) {
      brainsAlert('Add at least one visible diagram element before using it in a question.', 'info');
      return;
    }

    try {
      setExportingAssets(true);
      const asset = await createQuestionAssets();
      onUseInQuestion(asset);
    } catch (error) {
      console.error('Question handoff failed:', error);
      brainsAlert(error instanceof Error ? error.message : 'Unable to prepare this diagram for a question.', 'error');
    } finally {
      setExportingAssets(false);
    }
  };
'''
source = replace_once(source, old_export, new_export, "DiagramBuilder export handler")
source = replace_once(
    source,
    "Build clean classroom diagrams, export a high-resolution PNG for a normal question, or add answer blanks for an interactive diagram question.",
    "Build clean classroom diagrams, export cropped SVG + PNG assets, or send a diagram straight into a normal question.",
    "DiagramBuilder empty state copy",
)
source = replace_once(
    source,
    '<span><strong className="text-slate-200">3.</strong> Export PNG or add blanks</span>',
    '<span><strong className="text-slate-200">3.</strong> Use in Question or export</span>',
    "DiagramBuilder helper copy",
)
save_anchor = r'''        {/* Save Button */}
        <div className="flex gap-3 mt-4">
'''
save_replacement = r'''        {onUseInQuestion && (
          <section className="mt-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-xl">
                <h3 className="font-heading text-lg font-bold text-cyan-300">Use in Question</h3>
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  Auto-crops every edge, keeps a safe border, and prepares a transparent SVG with a high-resolution PNG fallback.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="grid gap-1 text-xs font-semibold text-slate-300">
                  Safe padding
                  <select
                    value={questionPadding}
                    onChange={(event: { target: { value: string } }) => setQuestionPadding(event.target.value as DiagramPaddingPreset)}
                    className="min-h-11 rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white"
                  >
                    <option value="tight">Tight · 24px</option>
                    <option value="standard">Standard · 40px</option>
                    <option value="worksheet">Worksheet · 64px</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={handleUseInQuestion}
                  disabled={exportingAssets || (shapes.length === 0 && blanks.length === 0)}
                  className="min-h-11 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-5 text-sm font-bold text-white shadow-lg shadow-cyan-950/30 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {exportingAssets ? 'Preparing assets...' : 'Use in Question →'}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Save Button */}
        <div className="flex gap-3 mt-4">
'''
source = replace_once(source, save_anchor, save_replacement, "DiagramBuilder question handoff UI")
diagram_builder.write_text(source, encoding="utf-8")

source = toolbar.read_text(encoding="utf-8")
source = replace_once(
    source,
    "            Export high-resolution PNG\n",
    "            Export SVG + PNG\n",
    "Toolbar export label",
)
source = replace_once(
    source,
    "            Page-safe classroom output\n",
    "            Transparent · auto-cropped · safe padding\n",
    "Toolbar export helper",
)
toolbar.write_text(source, encoding="utf-8")

source = teacher_portal.read_text(encoding="utf-8")
source = replace_once(
    source,
    "import BackButton from './BackButton';\n",
    "import BackButton from './BackButton';\nimport type { DiagramQuestionAsset } from './geometry/diagramExport';\n",
    "TeacherPortal diagram asset import",
)
source = replace_once(
    source,
    "  const [questionImage, setQuestionImage] = useState<File | null>(null);\n  const [questionImageUrl, setQuestionImageUrl] = useState<string>('');\n",
    "  const [questionImage, setQuestionImage] = useState<File | null>(null);\n  const [questionImageFallback, setQuestionImageFallback] = useState<File | null>(null);\n  const [questionImageUrl, setQuestionImageUrl] = useState<string>('');\n",
    "TeacherPortal fallback state",
)

handoff = r'''  const handleUseGeometryInQuestion = (asset: DiagramQuestionAsset) => {
    setEditingQuestion(null);
    setQuestionText(asset.title.trim() || 'Find the missing value.');
    setQuestionType('multiple_choice');
    setQuestionImage(asset.svgFile);
    setQuestionImageFallback(asset.pngFile);
    setQuestionImageUrl('');
    setDifficulty(asset.difficulty);
    setPoints(getDefaultPointsForDifficulty(asset.difficulty));
    if (teacherAssignedSubjects.length === 0 || teacherAssignedSubjects.includes(asset.subject)) {
      setSubject(asset.subject as Subject);
    }
    setOptions([
      { text: '', image_url: undefined },
      { text: '', image_url: undefined },
      { text: '', image_url: undefined },
      { text: '', image_url: undefined },
    ]);
    setOptionImages([null, null, null, null]);
    setCorrectAnswer('');
    setExplanation('');
    setTopicMode('custom');
    setCustomTopicName('Geometry');
    setEligibleGradeLevels([]);
    setView('create-question');
  };

'''
source = replace_once(
    source,
    "  const handleCreateQuestion = async (e: React.FormEvent) => {\n",
    handoff + "  const handleCreateQuestion = async (e: React.FormEvent) => {\n",
    "TeacherPortal handoff handler",
)

old_upload = r'''      // Upload question image if selected
      let imageUrl = questionImageUrl;
      if (questionImage) {
        try {
          imageUrl = await GameService.upload_question_image(questionImage);
        } catch (uploadError) {
          brainsAlert('Unable to upload question image: ' + (uploadError as Error).message, 'error');
          setUploadingImage(false);
          return;
        }
      }
'''
new_upload = r'''      // Geometry handoffs use SVG first and keep an equivalent PNG ready
      // as a fallback for storage/browser environments that reject SVG uploads.
      let imageUrl = questionImageUrl;
      if (questionImage) {
        try {
          imageUrl = await GameService.upload_question_image(questionImage);
        } catch (uploadError) {
          if (questionImageFallback && questionImage.type === 'image/svg+xml') {
            try {
              imageUrl = await GameService.upload_question_image(questionImageFallback);
              brainsAlert('SVG upload was unavailable, so the PNG fallback was attached automatically.', 'info');
            } catch (fallbackError) {
              brainsAlert(
                'Unable to upload the diagram as SVG or PNG: ' + (fallbackError as Error).message,
                'error',
              );
              setUploadingImage(false);
              return;
            }
          } else {
            brainsAlert('Unable to upload question image: ' + (uploadError as Error).message, 'error');
            setUploadingImage(false);
            return;
          }
        }
      }
'''
source = replace_once(source, old_upload, new_upload, "TeacherPortal SVG upload fallback")

source = re.sub(
    r"(?m)^(\s*)setQuestionImage\(null\);(?!\n\1setQuestionImageFallback\(null\);)",
    lambda match: f"{match.group(1)}setQuestionImage(null);\n{match.group(1)}setQuestionImageFallback(null);",
    source,
)

source = re.sub(
    r"(?m)^(\s*)setQuestionImage\(file\);(?!\n\1setQuestionImageFallback\(null\);)",
    lambda match: f"{match.group(1)}setQuestionImage(file);\n{match.group(1)}setQuestionImageFallback(null);",
    source,
)

geometry_prop_anchor = r'''    onComplete={() => setView('dashboard')}
    schoolName={resolvedBranding.schoolName}
'''
source = replace_once(
    source,
    geometry_prop_anchor,
    r'''    onComplete={() => setView('dashboard')}
    onUseInQuestion={handleUseGeometryInQuestion}
    schoolName={resolvedBranding.schoolName}
''',
    "TeacherPortal geometry callback wiring",
)
teacher_portal.write_text(source, encoding="utf-8")

print("Geometry SVG + PNG question handoff patch applied.")
