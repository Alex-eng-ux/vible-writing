// Server Action barrel. Re-exports every public action defined under
// `./actions/*` so existing `import { fooAction } from '@/app/actions'`
// statements keep working. The split is purely organizational — the
// underlying call signatures are identical to the previous monolithic
// `src/app/actions.ts`.
//
// Each domain file (`./actions/{project,bible,outline,chapter,extraction,
// consistency}.ts`) is marked `'use server'` at the top, which is what
// makes its async exports callable as Server Actions from a client
// component. Re-exporting them from this barrel does not require a
// `'use server'` directive here (no new exports are introduced).

export {
  createProjectAction,
  listProjectsAction,
  getProjectAction,
  getProjectDetailAction,
  optimizePromptAction,
  adoptBriefAction,
} from './actions/project';

export {
  addBibleRecordAction,
  applyFactsToBibleAction,
  updateBibleRecordAction,
  deleteBibleRecordAction,
} from './actions/bible';

export {
  generateOutlineAction,
  updateChapterOutlineAction,
} from './actions/outline';

export {
  createChapterAction,
  saveChapterAction,
  getChapterAction,
} from './actions/chapter';

export {
  extractFactsAction,
  listFactExtractionsAction,
} from './actions/extraction';

export {
  checkConsistencyAction,
  listConsistencyReportsAction,
  generateFixSuggestionAction,
  markIssueResolvedAction,
  dismissIssueAction,
} from './actions/consistency';
