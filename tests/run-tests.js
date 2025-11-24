import { runDataTests } from "./unit/data.test.js";

const main = async () => {
  await runDataTests();
  // eslint-disable-next-line no-console
  console.log("All tests passed.");
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
