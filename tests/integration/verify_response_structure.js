import { normalizeStoreName, parseAmount } from "../../src/data/normalize.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(
  __dirname,
  "../fixtures/mf_cf_transactions_sample.html"
);

const parseFixture = (html) => {
  const transactions = [];
  // Relaxed regex to match tr with transaction_list class
  const rowRegex = /<tr[^>]*class=["'][^"']*transaction_list[^"']*["'][^>]*>([\s\S]*?)<\/tr>/g;
  
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const rowHtml = match[1];
    const fullRowMatch = match[0]; // The whole tr tag and content

    // ID from tr id attribute (simpler/reliable for this fixture)
    const trIdMatch = fullRowMatch.match(/id="js-transaction-(\d+)"/);
    let id = trIdMatch ? trIdMatch[1] : null;

    if (!id) {
        // Fallback to input if tr id fails
        const idInputMatch = rowHtml.match(/value="(\d+)"[^>]*name="user_asset_act\[id\]"/);
        id = idInputMatch ? idInputMatch[1] : null;
    }

    if (!id) {
        console.log("Debug: Row found but no ID.");
        continue;
    }

    // Is Income
    // Match value before OR after name
    const incomeMatch = rowHtml.match(/name="user_asset_act\[is_income\]"[^>]*value="([^"]*)"/) || 
                        rowHtml.match(/value="([^"]*)"[^>]*name="user_asset_act\[is_income\]"/);
    const isIncomeVal = incomeMatch ? incomeMatch[1] : "0";
    const isIncome = isIncomeVal === "1";

    // Store
    const contentMatch = rowHtml.match(/<td class="content">[\s\S]*?<span>(.*?)<\/span>/);
    const storeRaw = contentMatch ? contentMatch[1] : "";
    const store = normalizeStoreName(storeRaw);

    // Amount
    const amountMatch = rowHtml.match(/<td class="number amount[^>]*>[\s\S]*?<span class="offset">([\s\S]*?)<\/span>/);
    const amountRaw = amountMatch ? amountMatch[1].trim() : "";
    const amount = parseAmount(amountRaw);

    // Category
    const catMatch = rowHtml.match(/class="btn btn-small dropdown-toggle v_l_ctg">([^<]*)<\/a>/);
    const category = catMatch ? catMatch[1] : "";

    // Subcategory
    const subCatMatch = rowHtml.match(/class="btn btn-small dropdown-toggle v_m_ctg">([^<]*)<\/a>/);
    const subcategory = subCatMatch ? subCatMatch[1] : "";
    
    // Exclude logic
    const EXCLUDE_KEYWORDS = ["振替", "投資積立", "住宅ローン", "固定費"];
    const labelText = `${category}${subcategory}`;
    const excluded = EXCLUDE_KEYWORDS.some((kw) => labelText.includes(kw));

    console.log(`Row ${id}: Income=${isIncome}, Store=${store}, Amount=${amount}, Cat=${labelText}, Excluded=${excluded}`);

    if (isIncome || excluded || amount === null) continue;

    transactions.push({ id, store, amount, category, subcategory });
  }
  return transactions;
};

const simulateGeminiCall = async (transactions) => {
    // Emulate what background/index.js expects from the prompt logic:
    // "Return JSON with a 'results' array of objects: { id, score } where score is 0-100."
    
    const results = transactions.map(tx => {
        let score = 0;
        // Simple heuristic to mimic AI "thinking"
        if (tx.category.includes("通信費") || tx.store.includes("NETWORKS")) {
            score = 95;
        } else if (tx.amount === 1170) { 
            score = 10;
        }
        return { id: tx.id, score };
    });

    const responsePayload = {
        results
    };

    return responsePayload;
}

const main = async () => {
  try {
    const html = fs.readFileSync(FIXTURE_PATH, "utf-8");
    console.log(`HTML Loaded. Length: ${html.length}`);

    const transactions = parseFixture(html);
    console.log("\nExtracted Transactions:", JSON.stringify(transactions, null, 2));

    if (transactions.length === 0) {
        console.log("No valid transactions found for analysis.");
        return;
    }

    console.log("\nSimulating Gemini API Response...");
    const response = await simulateGeminiCall(transactions);
    
    console.log("Gemini Response Data Structure:");
    console.log(JSON.stringify(response, null, 2));

    // Verify structure matches expectation: { results: [ { id, score }, ... ] }
    if (!response.results || !Array.isArray(response.results)) {
        throw new Error("Response missing 'results' array");
    }
    const validItem = response.results.find(item => item.id && typeof item.score === 'number');
    if (validItem) {
        console.log("\nVerification Successful: Response contains valid { id, score } objects.");
    } else {
        console.error("\nVerification Failed: No valid items found.");
    }

  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
};

main();
