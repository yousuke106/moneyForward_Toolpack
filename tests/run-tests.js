import { runDataTests } from "./unit/data.test.js";
import { runDuplicateTests } from "./unit/duplicates.test.js";
import { runDownloaderTests } from "./unit/downloader.test.js";
import { runCategoryRuleTests } from "./unit/category-rules.test.js";
import { runStorageSettingsTests } from "./unit/storage-settings.test.js";
import { runUiPrefsTests } from "./unit/ui-prefs.test.js";
import { runHeaderUtilsTests } from "./unit/header-utils.test.js";
import { runLargeCategoryOrderTests } from "./unit/large-category-order.test.js";
import { runGeminiUtilsTests } from "./unit/gemini-utils.test.js";
import { runGeminiAnalysisTests } from "./unit/gemini-analysis.test.js";
import { runBackgroundGeminiRequestTests } from "./unit/background-gemini-request.test.js";
import { runNativeSortableRegistryTests } from "./unit/native-sortable-registry.test.js";
import { runSummaryOutgoCopyTests } from "./unit/summary-outgo-copy.test.js";
import { runContentMaskingTests } from "./unit/content-masking.test.js";
import { runSettingsConstantsTests } from "./unit/settings-constants.test.js";

const main = async () => {
  await runDataTests();
  runDuplicateTests();
  runDownloaderTests();
  runCategoryRuleTests();
  runHeaderUtilsTests();
  runLargeCategoryOrderTests();
  runGeminiUtilsTests();
  runGeminiAnalysisTests();
  runBackgroundGeminiRequestTests();
  runSettingsConstantsTests();
  runNativeSortableRegistryTests();
  runSummaryOutgoCopyTests();
  await runContentMaskingTests();
  await runStorageSettingsTests();
  await runUiPrefsTests();
  // eslint-disable-next-line no-console
  console.log("All tests passed.");
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
