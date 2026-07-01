// Server Action barrel. Re-exports every public action defined under
// `./actions/*` so existing `import { fooAction } from '@/app/actions'`
// statements keep working.

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
  generateChapterAction,
  continueChapterAction,
  polishChapterAction,
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

export {
  getAISettingsAction,
  saveAISettingsAction,
  clearAISettingsAction,
} from './actions/settings';
