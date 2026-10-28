import type { StringKey } from '../i18n';
import type { FrameAction, CommonActionId } from './types';

type LabelKey = StringKey;

interface CommonActionSpec {
	id: CommonActionId;
	icon: string;
	labelKey: LabelKey;
}

/** The single source of truth for common-action order, Lucide icon names and labels. */
export const COMMON_ACTIONS: readonly CommonActionSpec[] = [
	{ id: 'magnifier', icon: 'zoom-in', labelKey: 'magnifier' },
	{ id: 'fit', icon: 'scaling', labelKey: 'autoFit' },
	{ id: 'apply-view', icon: 'pin', labelKey: 'applyView' },
	{ id: 'copy-block', icon: 'clipboard-copy', labelKey: 'copyAsCodeBlock' },
	{ id: 'copy-visio', icon: 'copy', labelKey: 'copyAsVisioObject' },
	{ id: 'switch-file', icon: 'folder-open', labelKey: 'switchFile' },
	{ id: 'open-external', icon: 'external-link', labelKey: 'openExternal' },
	{ id: 'fullscreen', icon: 'maximize', labelKey: 'fullscreen' },
];

export type ActionSlot =
	| { kind: 'common'; spec: CommonActionSpec; run: () => void }
	| { kind: 'separator' }
	| { kind: 'specific'; action: FrameAction };

/**
 * Orders the status bar's button strip: the common actions a format supports
 * (always in COMMON_ACTIONS order), then — only if there is something on
 * both sides — a divider, then the format's own actions.
 */
export function layoutActions(
	handlers: Partial<Record<CommonActionId, () => void>>,
	specific: readonly FrameAction[],
): ActionSlot[] {
	const slots: ActionSlot[] = [];
	for (const spec of COMMON_ACTIONS) {
		const run = handlers[spec.id];
		if (run) slots.push({ kind: 'common', spec, run });
	}
	if (slots.length > 0 && specific.length > 0) slots.push({ kind: 'separator' });
	for (const action of specific) slots.push({ kind: 'specific', action });
	return slots;
}
