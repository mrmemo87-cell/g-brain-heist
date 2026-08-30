import React, { useState } from 'react';
import type Konva from 'konva';
import type { BlankField } from './types';
import type { DiagramShape } from './KonvaCanvasEditor';
import {
  type GeometryQuestionBackground,
  type GeometryQuestionPaddingPreset,
} from './questionAssetExport';
import { createKonvaQuestionAssetDraft } from './konvaQuestionExport';
import { uploadGeometryQuestionAssets } from '../../services/geometryQuestionImageService';
import { brainsAlert } from '../../src/utils/brainsAlert';

export interface GeometryUseInQuestionPayload {
  imageUrl: string;
  svgUrl: string | null;
  pngUrl: string;
  title: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  width: number;
  height: number;
  padding: number;
  paddingPreset: GeometryQuestionPaddingPreset;
  background: GeometryQuestionBackground;
}

interface GeometryUseInQuestionProps {
  title: string;
  subject?: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  shapes: DiagramShape[];
  blanks: BlankField[];
  stageRef: React.MutableRefObject<unknown>;
  onUseInQuestion: (payload: GeometryUseInQuestionPayload) => void;
}

const GeometryUseInQuestion: React.FC<GeometryUseInQuestionProps> = ({
  title,
  topic,
  difficulty,
  shapes,
  blanks,
  stageRef,
  onUseInQuestion,
}) => {
  const [open, setOpen] = useState(false);
  const [paddingPreset, setPaddingPreset] = useState<GeometryQuestionPaddingPreset>('standard');
  const [preparing, setPreparing] = useState(false);

  const prepareQuestion = async () => {
    if (shapes.length === 0 && blanks.length === 0) {
      brainsAlert('Add something to the diagram before using it in a question.', 'info');
      return;
    }

    const stage = stageRef.current as Konva.Stage | null;
    if (!stage) {
      brainsAlert('Geometry canvas is not ready yet. Please try again.', 'info');
      return;
    }

    try {
      setPreparing(true);

      // Export the actual Konva scene the teacher composed. This preserves the
      // exact text metrics, shape transforms, spacing and relative coordinates;
      // only the editor palette is normalized for the white student canvas.
      const draft = await createKonvaQuestionAssetDraft(title, stage, paddingPreset);
      const uploaded = await uploadGeometryQuestionAssets(draft.svgFile, draft.pngFile);

      // The exported visual is intentionally subject-neutral. The normal
      // question builder owns academic classification and restricts its subject
      // selector to the teacher's school-admin allocations.
      onUseInQuestion({
        imageUrl: uploaded.primaryUrl,
        svgUrl: uploaded.svgUrl,
        pngUrl: uploaded.pngUrl,
        title: draft.title,
        topic,
        difficulty,
        width: draft.width,
        height: draft.height,
        padding: draft.padding,
        paddingPreset: draft.paddingPreset,
        background: draft.background,
      });
      setOpen(false);
      brainsAlert(
        uploaded.svgUrl
          ? 'Diagram attached exactly as composed. Choose the question subject in My Pool.'
          : 'PNG diagram attached exactly as composed. Choose the question subject in My Pool.',
        'success',
      );
    } catch (error) {
      console.error('Failed to prepare geometry question asset:', error);
      brainsAlert(error instanceof Error ? error.message : 'Unable to prepare the diagram for a question.', 'error');
    } finally {
      setPreparing(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-12 flex-1 rounded-lg border border-cyan-200 bg-cyan-400 px-6 py-3 font-bold text-slate-950 shadow-lg shadow-cyan-950/30 transition-all hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
      >
        ✨ Use in Question
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-cyan-400/30 bg-slate-900 p-5 shadow-2xl shadow-cyan-950/40">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-white">Use diagram in a question</h3>
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  The diagram stays subject-neutral. After attaching it, choose the question subject from the subjects your school admin assigned to you.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !preparing && setOpen(false)}
                className="rounded-lg px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 text-sm font-semibold text-slate-200">
                Student canvas
                <div className="flex min-h-11 items-center rounded-lg border border-slate-600 bg-white px-3 font-bold text-slate-950">
                  White — high contrast
                </div>
              </div>

              <label className="grid gap-2 text-sm font-semibold text-slate-200">
                Safe border
                <select
                  value={paddingPreset}
                  onChange={(event: { target: { value: string } }) => setPaddingPreset(event.target.value as GeometryQuestionPaddingPreset)}
                  className="min-h-11 rounded-lg border border-slate-600 bg-slate-950 px-3 text-white outline-none focus:border-cyan-400"
                >
                  <option value="tight">Tight — 24 px</option>
                  <option value="standard">Standard — 40 px</option>
                  <option value="worksheet">Worksheet — 64 px</option>
                </select>
              </label>
            </div>

            <p className="mt-3 text-xs leading-5 text-slate-400">
              Question exports now use the same Konva scene as the editor, so shapes, labels, spacing, size and rotation stay exactly where you placed them. Only the presentation colors are normalized for the white student canvas.
            </p>

            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-300">
              <div className="flex items-center justify-between gap-3">
                <span>Layout</span>
                <strong className="text-cyan-300">Exact teacher composition</strong>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span>Fallback</span>
                <strong className="text-slate-100">2× PNG</strong>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span>Subject</span>
                <strong className="text-emerald-300">Choose in Question Builder</strong>
              </div>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={preparing}
                className="min-h-11 rounded-lg border border-slate-600 px-4 font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void prepareQuestion()}
                disabled={preparing}
                className="min-h-11 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-5 font-bold text-white hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
              >
                {preparing ? 'Preparing exact render…' : 'Continue to Question Builder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default GeometryUseInQuestion;
