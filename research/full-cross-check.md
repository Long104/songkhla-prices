# Full Data Cross-Check Report

**Summary:** 112/131 price matches (±0.01 tolerance). 19 mismatches found, all from `lotuss` source due to unit mismatch (DB: "บาท/ชิ้น", Live: "บาท/กก."). 1 unmapped item ("ไก่ย่าง"). 75/75 UI verification requests failed (404), indicating routes are likely `/[locale]/products/[slug]` or similar.

**Detailed Findings:**
- **Matches:** 112/131
- **Mismatches:** 19 (Lotus's units)
- **Reverse Gaps:** 1 (ไก่ย่าง)
- **UI Verification:** 75/75 failed (404 status).

**Recommendations:**
1. Fix Lotus's unit parsing or normalize the unit strings in the DB to match the "บาท/กก." format reported by the source.
2. Add "ไก่ย่าง" to the mapping table for Lotus's.
3. Correct the UI verification endpoint to match the app's routing structure (`/th/products/...`).
