import { runDataTests } from "./unit/data.test.js";
import { runDuplicateTests } from "./unit/duplicates.test.js";
import { runDownloaderTests } from "./unit/downloader.test.js";
import { runCategoryRuleTests } from "./unit/category-rules.test.js";
import { runStorageSettingsTests } from "./unit/storage-settings.test.js";
import { runUiPrefsTests } from "./unit/ui-prefs.test.js";
import { runHeaderUtilsTests } from "./unit/header-utils.test.js";
import { runLargeCategoryOrderTests } from "./unit/large-category-order.test.js";

const main = async () => {
  await runDataTests();
  runDuplicateTests();
  runDownloaderTests();
  runCategoryRuleTests();
  runHeaderUtilsTests();
  runLargeCategoryOrderTests();
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
