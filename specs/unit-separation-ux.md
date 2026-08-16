# Unit-Separated Price Comparison UX Specification
**Project:** Songkhla Prices (`songkhla-prices`)  
**Target Surface:** Category Pages (`product-card.tsx`), Product Detail Page (`price-table.tsx`, `product/[slug]/page.tsx`), Unit Helper (`unit-warning-badge.tsx`)  
**Status:** Approved Specification  

---

## 1. Executive Summary & Core Rules

### The Problem
Previously, raw unit prices (e.g., `฿31.60/แพ็ค`) and per-weight prices (e.g., `฿78.00/กก.`) were compared directly within single price ranges and tables. This falsely crowned small-pack prices as "ถูกที่สุด" (cheapest) even when their unit cost was higher.

### Core Design Invariant
1. **Zero Cross-Family Comparison**: Prices from different unit families must NEVER be sorted against each other, min-max ranged together, or awarded cross-family "cheapest" status.
2. **Unit Families**:
   - `weight` (กิโลกรัม / กก.): Primary baseline for fresh food (meat, produce, seafood).
   - `volume` (ลิตร): Primary baseline for liquids (cooking oil, milk, fuel).
   - `pack` (แพ็ค / ชิ้น / ถุง / ถาด): Packaged retail units with fixed or variable weights.
   - `count` (ฟอง / ขวด / ซอง / ตัว): Countable item units.
3. **Primary Unit Preference**: For items with both `weight` and `pack` prices (e.g., Pork Belly), `weight` is treated as the primary comparison family.

---

## 2. Component Specifications

### 2.1 Category Product Card (`src/components/product-card.tsx`)

#### Props & Data Model Update
Update `ProductCardProps` (or pass grouped price summaries):
```typescript
export interface UnitFamilySummary {
  family: "weight" | "volume" | "pack" | "count";
  unitLabel: string; // e.g., "กก.", "แพ็ค", "ฟอง"
  minPrice: number;
  maxPrice: number | null;
  cheapestSourceNameTh: string | null;
  cheapestSourceNameEn: string | null;
}

interface ProductCardProps {
  slug: string;
  nameTh: string;
  nameEn: string | null;
  primarySummary: UnitFamilySummary | null;
  secondarySummary: UnitFamilySummary | null;
  sourceCount: number;
  locale: string;
}
```

#### Visual Layout & Hierarchy
- **Primary Family Range (Bold font, green accent)**: Shown first using `primarySummary`. If `minPrice === maxPrice`, displays `฿78.00/กก.`. If range exists, displays `฿78.00 – ฿95.00/กก.`.
- **Secondary Family Hint (Muted text)**: Shown directly under primary range if `secondarySummary` exists. E.g., `เริ่มต้น ฿21.50/แพ็ค` in `text-xs text-zinc-500`.
- **Cheapest Source Pill**: Cites the store and unit clearly: `ถูกสุด ฿78.00/กก. ที่ โลตัส` (never ambiguous).

#### ASCII Wireframe (Product Card with Dual Unit Summary)
```
+-------------------------------------------------------+
|  หมูสามชั้นเส้น                                [ 3 แหล่ง ] |
|  Pork Belly                                           |
|                                                       |
|  ฿78.00 – ฿95.00 / กก.                                |
|  เริ่มต้น ฿21.50 / แพ็ค                                   |
|                                                       |
|  [ ถูกสุด ฿78.00/กก. ที่ Lotus's ]                      |
|                                                       |
|                                         ดูราคา >      |
+-------------------------------------------------------+
```

---

### 2.2 Product Detail Price Table (`src/components/price-table.tsx`)

#### Segmented Control UI
Above the price list, render a mobile-friendly Segmented Control (`shadcn/ui` button toggle or tab bar) grouping prices by unit family.

- **Tabs**:
  - `ต่อกิโลกรัม (3)` (or `ต่อลิตร`)
  - `ต่อแพ็ค (2)` (or count unit)
- **Active State**: `bg-white text-zinc-900 shadow-sm font-semibold`
- **Inactive State**: `bg-zinc-100 text-zinc-500 hover:text-zinc-700`
- **Default Selection Logic**: Select `weight` tab if available; else `volume`; else `pack`/`count`.

#### Price Row Cards
Within the selected tab, rows are sorted strictly by price ascending (`minPrice` to `maxPrice`).

- **Pack Row Per-Kg Equivalent**:
  If viewing the `pack` tab and `weightGrams` is present (e.g., 200g pack for ฿49.00):
  - Primary price display: `฿49.00/แพ็ค`
  - Subtext: `(≈ ฿245.00/กก. · 200 กรัม)`
- **"ถูกที่สุด" Badge**:
  - Appears ONLY on row(s) with the lowest price within the active tab.
  - Rendered in solid green `bg-green-600 text-white`.

#### ASCII Wireframe (Product Detail Page with Segmented Control)
```
+-------------------------------------------------------+
|  [  ต่อกิโลกรัม (3)  |  ต่อแพ็ค (2)  ]                  |
+-------------------------------------------------------+
|  💡 เปรียบเทียบราคาเฉพาะกลุ่ม "ต่อกิโลกรัม"               |
+-------------------------------------------------------+
|  ร้านค้า                     ราคา              วันที่  |
+-------------------------------------------------------+
|  [V] Lotus's [ถูกที่สุด]     ฿78.00/กก.    15 ส.ค. 69  |
+-------------------------------------------------------+
|      Makro                   ฿82.00/กก.    15 ส.ค. 69  |
+-------------------------------------------------------+
|      ตลาดศรีเมือง             ฿85.00/กก.    14 ส.ค. 69  |
+-------------------------------------------------------+
```

When switching to `ต่อแพ็ค (2)` tab:
```
+-------------------------------------------------------+
|  [  ต่อกิโลกรัม (3)  |  *ต่อแพ็ค (2)*  ]                |
+-------------------------------------------------------+
|  ร้านค้า                     ราคา              วันที่  |
+-------------------------------------------------------+
|  [V] Makro [ถูกที่สุด]       ฿21.50/แพ็ค   15 ส.ค. 69  |
|                              (≈ ฿215.00/กก. · 100g)   |
+-------------------------------------------------------+
|      Lotus's                 ฿49.00/แพ็ค   15 ส.ค. 69  |
|                              (≈ ฿245.00/กก. · 200g)   |
+-------------------------------------------------------+
```

---

### 2.3 Unit Warning / Context Banner (`src/components/unit-warning-badge.tsx`)

Replace the generic red warning badge with a contextual info chip under the tab bar:
```tsx
export function UnitInfoBanner({ familyCount }: { familyCount: number }) {
  if (familyCount <= 1) return null;
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 border border-amber-200/60">
      <Info className="h-3.5 w-3.5 shrink-0 text-amber-600" />
      <span>สินค้านี้มีหลายหน่วย เลือกสลับดูราคาตามหน่วยด้านบน</span>
    </div>
  );
}
```

---

## 3. i18n Copy Dictionary

### `src/messages/th.json`
```json
{
  "product": {
    "unitFamilyWeight": "ต่อกิโลกรัม",
    "unitFamilyVolume": "ต่อลิตร",
    "unitFamilyPack": "ต่อแพ็ค",
    "unitFamilyCount": "ต่อ{unit}",
    "fromPackStarting": "เริ่มต้น {price}/{unit}",
    "approxPerKg": "≈ ฿{price}/กก.",
    "weightSpecification": "{grams} กรัม",
    "unitMultiInfo": "สินค้านี้มีหลายหน่วย เลือกสลับดูราคาตามหน่วยด้านบน",
    "cheapestInFamily": "ถูกที่สุดในกลุ่มนี้"
  }
}
```

### `src/messages/en.json`
```json
{
  "product": {
    "unitFamilyWeight": "Per Kg",
    "unitFamilyVolume": "Per Liter",
    "unitFamilyPack": "Per Pack",
    "unitFamilyCount": "Per {unit}",
    "fromPackStarting": "From {price}/{unit}",
    "approxPerKg": "≈ ฿{price}/kg",
    "weightSpecification": "{grams}g",
    "unitMultiInfo": "Multiple units available. Switch tabs above to compare.",
    "cheapestInFamily": "Cheapest in this unit"
  }
}
```

---

## 4. Edge Cases & Missing Data Rules

1. **Single Unit Family Only (e.g. Eggs - ฿/ฟอง)**:
   - Segmented control is hidden automatically.
   - Prices display cleanly with single unit sorting.
2. **Pack with Missing `weightGrams`**:
   - Render `฿49.00/แพ็ค` without pseudo per-kg math. Never guess weight.
3. **No Price Data (`sourceCount === 0`)**:
   - Render empty state component consistently (`ยังไม่มีข้อมูลราคา`).

---

## 5. Verification Checklist for Implementation

- [ ] Category cards show primary unit range + secondary starting price without blending ranges.
- [ ] Product detail page renders Segmented Control toggling between per-kg and per-pack.
- [ ] "ถูกที่สุด" badge is isolated per tab.
- [ ] Pack rows calculate per-kg equivalent when `weightGrams` is present.
- [ ] No hardcoded strings — all copy uses Next-Intl i18n keys.