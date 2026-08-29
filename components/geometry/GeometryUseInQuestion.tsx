import React, { useState } from 'react';
import type { BlankField } from './types';
import type { DiagramShape } from './KonvaCanvasEditor';
import {
  createGeometryQuestionAssetDraft,
  type GeometryQuestionBackground,
  type GeometryQuestionPaddingPreset,
} from './questionAssetExport';
import { uploadGeometryQuestionAssets } from '../../services/geometryQuestionImageService';
import { brainsAlert } from '../../src/utils/brainsAlert';

export interface GeometryUseInQuestionPayload {
  imageUrl: string;
  svgUrl: string | null;
  pngUrl: string;
  title: string;
  subject: string;
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
  subject: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  shapes: DiagramShape[];
  blanks: BlankField[];
  onUseInQuestion: (payload: GeometryUseInQuestionPayload) => void;
}

const GeometryUseInQuestion: React.FC<GeometryUseInQuestionProps> = ({
  title,
  subject,
  topic,
  difficulty,
  shapes,
  blanks,
  onUseInQuestion,
}) => {
  const [open, setOpen] = useState(false);
  const [paddingPreset, setPaddingPreset] = useState<GeometryQuestionPaddingPreset>('standard');
  const [background, setBackground] = useState<GeometryQuestionBackground>('transparent');
  const [preparing, setPreparing] = useState(false);

  const prepareQuestion = async () => {
    if (shapes.length === 0 && blanks.length === 0) {
      brainsAlert('Add something to the diagram before using it in a question.', 'info');
      return;
    }

    try {
      setPreparing(true);
      const draft = await createGeometryQuestionAssetDraft(title, shapes, blanks, {
        paddingPreset,
        background,
      });
      const uploaded = await uploadGeometryQuestionAssets(draft.svgFile, draft.pngFile);

      onUseInQuestion({
        imageUrl: uploaded.primaryUrl,
        svgUrl: uploaded.svgUrl,
        pngUrl: uploaded.pngUrl,
        title: draft.title,
        subject,
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
          ? 'Diagram attached to a new question as SVG, with PNG fallback ready.'
          : 'SVG was unavailable, so the PNG fallback was attached to the new question.',
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
        className="min-h-12 flex-1 rounded-lg border border-emerald-400/60 bg-emerald-500/15 px-6 py-3 font-semibold text-emerald-200 transition-all hover:bg-emerald-500/25"
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
                  We will tightly crop the diagram, keep a safe border, upload SVG first, and store a transparent PNG fallback beside it.
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
              <label className="grid gap-2 text-sm font-semibold text-slate-200">
                Background
                <select
                  value={background}
                  onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setBackground(event.target.value as GeometryQuestionBackground)}
                  className="min-h-11 rounded-lg border border-slate-600 bg-slate-950 px-3 text-white outline-none focus:border-cyan-400"
                >
                  <option value="transparent">Transparent — recommended</option>
                  <option value="white">White</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-200">
                Safe border
                <select
                  value={paddingPreset}
                  onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setPaddingPreset(event.target.value as GeometryQuestionPaddingPreset)}
                  className="min-h-11 rounded-lg border border-slate-600 bg-slate-950 px-3 text-white outline-none focus:border-cyan-400"
                >
                  <option value="tight">Tight — 24 px</option>
                  <option value="standard">Standard — 40 px</option>
                  <option value="worksheet">Worksheet — 64 px</option>
                </select>
              </label>
            </div>

            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-300">
              <div className="flex items-center justify-between gap-3">
                <span>Primary format</span>
                <strong className="text-cyan-300">SVG</strong>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span>Fallback</span>
                <strong className="text-slate-100">2× PNG</strong>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span>Crop</span>
                <strong className="text-slate-100">Content bounds + safe border</strong>
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
                {preparing ? 'Preparing SVG + PNG…' : 'Continue to Question Builder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default GeometryUseInQuestion;
