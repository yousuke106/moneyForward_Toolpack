import { runDataTests } from "./unit/data.test.js";
import { runDuplicateTests } from "./unit/duplicates.test.js";

const main = async () => {
  await runDataTests();
  runDuplicateTests();
  // eslint-disable-next-line no-console
  console.log("All tests passed.");
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
