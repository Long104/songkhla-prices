/**
 * Database seed script.
 *
 * Populates the initial reference data:
 *  - 5 data sources (government / supermarket / wholesale) with retail/wholesale price type
 *  - 12 product categories
 *  - 77 Thai provinces (from provincesSeed)
 *  - 51 canonical products across the 12 categories
 *  - product-source mappings (DIT/EPPO real names + Makro/Si Mum Muang/Lotus's Thai names)
 *
 * All inserts use onConflictDoNothing() so the script is safe to re-run.
 * The only exception: product_source_mappings has no unique constraint, so it
 * is wiped and re-inserted each run to stay idempotent.
 *
 * Usage: pnpm seed
 */
import { getDb } from "@/db";
import { eq } from "drizzle-orm";
import {
  categories,
  products,
  productSourceMappings,
  provinces,
  sources,
} from "@/db/schema";
import { provincesSeed } from "@/lib/provinces";

const sourceSeeds = [
  {
    slug: "dit",
    nameTh: "กรมการค้าภายใน",
    nameEn: "Department of Internal Trade",
    url: "https://www.dit.go.th",
    type: "government",
    priceType: "retail",
  },
  {
    slug: "simummuang",
    nameTh: "ตลาดสี่มุมเมือง",
    nameEn: "Si Mum Muang Market",
    url: "https://www.simummuangmarket.com",
    type: "wholesale",
    priceType: "wholesale",
  },
  {
    slug: "eppo",
    nameTh: "สำนักงานนโยบายและแผนพลังงาน",
    nameEn: "Energy Policy and Planning Office",
    url: "https://www.eppo.go.th",
    type: "government",
    priceType: "retail",
  },
  {
    slug: "makro",
    nameTh: "แมคโคร",
    nameEn: "Makro Pro",
    url: "https://www.makro.pro",
    // Makro is wholesale but functions as a supermarket for our comparison.
    type: "supermarket",
    priceType: "wholesale",
  },
  {
    slug: "lotuss",
    nameTh: "โลตัส",
    nameEn: "Lotus's",
    url: "https://www.lotuss.com",
    type: "supermarket",
    priceType: "retail",
  },
];

const categorySeeds = [
  { slug: "pork", nameTh: "หมู", nameEn: "Pork", icon: "🥓", sortOrder: 1 },
  { slug: "chicken", nameTh: "ไก่", nameEn: "Chicken", icon: "🍗", sortOrder: 2 },
  { slug: "beef", nameTh: "เนื้อวัว", nameEn: "Beef", icon: "🥩", sortOrder: 3 },
  { slug: "vegetables", nameTh: "ผัก", nameEn: "Vegetables", icon: "🥬", sortOrder: 4 },
  { slug: "rice", nameTh: "ข้าว", nameEn: "Rice", icon: "🍚", sortOrder: 5 },
  { slug: "eggs", nameTh: "ไข่ & นม", nameEn: "Eggs & Dairy", icon: "🥚", sortOrder: 6 },
  { slug: "oil", nameTh: "น้ำมัน & ไขมัน", nameEn: "Oil & Fat", icon: "🛢️", sortOrder: 7 },
  { slug: "seasoning", nameTh: "เครื่องปรุง", nameEn: "Seasoning", icon: "🧂", sortOrder: 8 },
  { slug: "fuel", nameTh: "น้ำมันเชื้อเพลิง", nameEn: "Fuel", icon: "⛽", sortOrder: 9 },
  { slug: "fruit", nameTh: "ผลไม้", nameEn: "Fruit", icon: "🍎", sortOrder: 10 },
  { slug: "fish", nameTh: "ปลา", nameEn: "Fish", icon: "🐟", sortOrder: 11 },
  { slug: "shrimp", nameTh: "กุ้ง", nameEn: "Shrimp", icon: "🦐", sortOrder: 12 },
  { slug: "shellfish-crab", nameTh: "หอย & ปู", nameEn: "Shellfish & Crab", icon: "🦀", sortOrder: 13 },
  { slug: "beverages", nameTh: "เครื่องดื่ม", nameEn: "Beverages", icon: "🥤", sortOrder: 14 },
  { slug: "noodles", nameTh: "ก๋วยเตี๋ยว & บะหมี่", nameEn: "Noodles", icon: "🍜", sortOrder: 15 },
  { slug: "bakery", nameTh: "เบเกอรี่", nameEn: "Bakery", icon: "🍞", sortOrder: 16 },
  { slug: "household", nameTh: "ของใช้ในบ้าน", nameEn: "Household", icon: "🧹", sortOrder: 17 },
  { slug: "personal-care", nameTh: "ของใช้ส่วนตัว", nameEn: "Personal Care", icon: "🧴", sortOrder: 18 },
  { slug: "baby", nameTh: "ของใช้เด็ก", nameEn: "Baby Care", icon: "🍼", sortOrder: 19 },
  { slug: "pet", nameTh: "อาหาร & ของใช้สัตว์เลี้ยง", nameEn: "Pet Care", icon: "🐱", sortOrder: 20 },
  { slug: "frozen", nameTh: "อาหารแช่แข็ง", nameEn: "Frozen Foods", icon: "🧊", sortOrder: 21 },
  { slug: "snacks", nameTh: "ขนมขบเคี้ยว", nameEn: "Snacks", icon: "🍿", sortOrder: 22 },
  { slug: "coffee-tea", nameTh: "กาแฟ & ชา", nameEn: "Coffee & Tea", icon: "☕", sortOrder: 23 },
  { slug: "canned-goods", nameTh: "อาหารกระป๋อง & ของแห้ง", nameEn: "Canned Goods", icon: "🥫", sortOrder: 24 },
];

interface ProductSeed {
  slug: string;
  nameTh: string;
  nameEn: string;
  categorySlug: string;
}

const productSeeds: ProductSeed[] = [
  // pork
  { slug: "pork-belly", nameTh: "หมูสามชั้น", nameEn: "Pork Belly", categorySlug: "pork" },
  { slug: "pork-shoulder", nameTh: "หมูสะโพก", nameEn: "Pork Shoulder", categorySlug: "pork" },
  { slug: "pork-mince", nameTh: "หมูสับ", nameEn: "Minced Pork", categorySlug: "pork" },
  { slug: "pork-ribs", nameTh: "ซี่โครงหมู", nameEn: "Pork Ribs", categorySlug: "pork" },
  { slug: "pork-neck", nameTh: "หมูคอสไลซ์", nameEn: "Pork Neck Slices", categorySlug: "pork" },
  { slug: "pork-ground", nameTh: "หมูบด", nameEn: "Ground Pork", categorySlug: "pork" },
  // chicken
  { slug: "chicken-whole", nameTh: "ไก่สด", nameEn: "Whole Chicken", categorySlug: "chicken" },
  { slug: "chicken-ground", nameTh: "ไก่บด", nameEn: "Ground Chicken", categorySlug: "chicken" },
  { slug: "chicken-grilled", nameTh: "ไก่ย่าง", nameEn: "Grilled Chicken", categorySlug: "chicken" },
  { slug: "chicken-wings", nameTh: "ปีกไก่", nameEn: "Chicken Wings", categorySlug: "chicken" },
  { slug: "chicken-breast", nameTh: "อกไก่", nameEn: "Chicken Breast", categorySlug: "chicken" },
  { slug: "chicken-drumstick", nameTh: "น่องไก่", nameEn: "Chicken Drumstick", categorySlug: "chicken" },
  // beef
  { slug: "beef", nameTh: "เนื้อวัว", nameEn: "Beef", categorySlug: "beef" },
  { slug: "beef-sliced", nameTh: "เนื้อวัวสไลซ์", nameEn: "Sliced Beef", categorySlug: "beef" },
  // vegetables
  { slug: "morning-glory", nameTh: "ผักบุ้ง", nameEn: "Morning Glory", categorySlug: "vegetables" },
  { slug: "chinese-kale", nameTh: "ผักคะน้า", nameEn: "Chinese Kale", categorySlug: "vegetables" },
  { slug: "long-bean", nameTh: "ถั่วฝักยาว", nameEn: "Long Bean", categorySlug: "vegetables" },
  { slug: "cucumber", nameTh: "แตงกวา", nameEn: "Cucumber", categorySlug: "vegetables" },
  { slug: "tomato", nameTh: "มะเขือเทศ", nameEn: "Tomato", categorySlug: "vegetables" },
  { slug: "chili", nameTh: "พริกขี้หนู", nameEn: "Bird's Eye Chili", categorySlug: "vegetables" },
  { slug: "chinese-cabbage", nameTh: "ผักกวางตุ้งฮุง", nameEn: "Chinese Cabbage", categorySlug: "vegetables" },
  // rice
  { slug: "jasmine-rice", nameTh: "ข้าวหอมมะลิ", nameEn: "Jasmine Rice", categorySlug: "rice" },
  { slug: "sticky-rice", nameTh: "ข้าวเหนียว", nameEn: "Sticky Rice", categorySlug: "rice" },
  { slug: "white-rice", nameTh: "ข้าวขาว", nameEn: "White Rice", categorySlug: "rice" },
  // eggs & dairy
  { slug: "chicken-egg", nameTh: "ไข่ไก่", nameEn: "Chicken Egg", categorySlug: "eggs" },
  { slug: "duck-egg", nameTh: "ไข่เป็ด", nameEn: "Duck Egg", categorySlug: "eggs" },
  { slug: "fresh-milk", nameTh: "นมสด", nameEn: "Fresh Milk", categorySlug: "eggs" },
  // oil & fat
  { slug: "palm-oil", nameTh: "น้ำมันปาล์ม", nameEn: "Palm Oil", categorySlug: "oil" },
  { slug: "soybean-oil", nameTh: "น้ำมันถั่วเหลือง", nameEn: "Soybean Oil", categorySlug: "oil" },
  // seasoning
  { slug: "sugar", nameTh: "น้ำตาลทราย", nameEn: "White Sugar", categorySlug: "seasoning" },
  { slug: "condensed-milk", nameTh: "นมข้นหวาน", nameEn: "Sweetened Condensed Milk", categorySlug: "seasoning" },
  { slug: "fish-sauce", nameTh: "น้ำปลา", nameEn: "Fish Sauce", categorySlug: "seasoning" },
  { slug: "salt", nameTh: "เกลือ", nameEn: "Salt", categorySlug: "seasoning" },
  { slug: "coconut-milk", nameTh: "กะทิ", nameEn: "Coconut Milk", categorySlug: "seasoning" },
  // fuel
  { slug: "benzine-95", nameTh: "เบนซิน 95", nameEn: "Benzine 95", categorySlug: "fuel" },
  { slug: "gasohol-91", nameTh: "แก๊สโซฮอล์ 91", nameEn: "Gasohol 91", categorySlug: "fuel" },
  { slug: "gasohol-e20", nameTh: "แก๊สโซฮอล์ E20", nameEn: "Gasohol E20", categorySlug: "fuel" },
  { slug: "diesel", nameTh: "ดีเซล", nameEn: "Diesel", categorySlug: "fuel" },
  { slug: "lpg", nameTh: "แก๊สหุงต้ม (LPG)", nameEn: "LPG", categorySlug: "fuel" },
  // fruit
  { slug: "orange", nameTh: "ส้ม", nameEn: "Orange", categorySlug: "fruit" },
  { slug: "mango", nameTh: "มะม่วง", nameEn: "Mango", categorySlug: "fruit" },
  { slug: "banana", nameTh: "กล้วยน้ำว้า", nameEn: "Banana", categorySlug: "fruit" },
  { slug: "watermelon", nameTh: "แตงโม", nameEn: "Watermelon", categorySlug: "fruit" },
  // fish
  { slug: "mackerel", nameTh: "ปลาทู", nameEn: "Short Mackerel", categorySlug: "fish" },
  { slug: "tilapia", nameTh: "ปลานิล", nameEn: "Tilapia", categorySlug: "fish" },
  { slug: "saba-fish", nameTh: "ปลาสำเตร็ง", nameEn: "Saba Fish", categorySlug: "fish" },
  { slug: "squid", nameTh: "ปลาหมึก", nameEn: "Squid", categorySlug: "fish" },
  // shrimp
  { slug: "black-tiger-shrimp", nameTh: "กุ้งกุลาดำ", nameEn: "Black Tiger Shrimp", categorySlug: "shrimp" },
  { slug: "white-shrimp", nameTh: "กุ้งขาว", nameEn: "White Shrimp", categorySlug: "shrimp" },
  // shellfish-crab
  { slug: "blue-crab", nameTh: "ปูม้า", nameEn: "Blue Crab", categorySlug: "shellfish-crab" },
  { slug: "green-mussel", nameTh: "หอยแมลงภั่ง", nameEn: "Green Mussel", categorySlug: "shellfish-crab" },
  // beverages
  { slug: "drinking-water", nameTh: "น้ำดื่ม", nameEn: "Drinking Water", categorySlug: "beverages" },
  { slug: "soda", nameTh: "น้ำอัดลม", nameEn: "Soda", categorySlug: "beverages" },
  { slug: "fruit-juice", nameTh: "น้ำผลไม้", nameEn: "Fruit Juice", categorySlug: "beverages" },
  // noodles
  { slug: "instant-noodles", nameTh: "บะหมี่กึ่งสำเร็จรูป", nameEn: "Instant Noodles", categorySlug: "noodles" },
  { slug: "rice-noodles", nameTh: "เส้นหมี่", nameEn: "Rice Noodles", categorySlug: "noodles" },
  { slug: "glass-noodles", nameTh: "วุ้นเส้น", nameEn: "Glass Noodles", categorySlug: "noodles" },
  // bakery
  { slug: "bread", nameTh: "ขนมปัง", nameEn: "Bread", categorySlug: "bakery" },
  { slug: "wheat-flour", nameTh: "แป้งสาลี", nameEn: "Wheat Flour", categorySlug: "bakery" },
  // Household
  { slug: "detergent", nameTh: "ผงซักฟอก", nameEn: "Detergent", categorySlug: "household" },
  { slug: "dish-soap", nameTh: "น้ำยาล้างจาน", nameEn: "Dish Soap", categorySlug: "household" },
  { slug: "floor-cleaner", nameTh: "น้ำยาถูพื้น", nameEn: "Floor Cleaner", categorySlug: "household" },
  { slug: "toilet-cleaner", nameTh: "น้ำยาล้างห้องน้ำ", nameEn: "Toilet Cleaner", categorySlug: "household" },
  { slug: "toilet-paper", nameTh: "ทิชชู่", nameEn: "Toilet Paper", categorySlug: "household" },
  // Personal Care
  { slug: "bar-soap", nameTh: "สบู่ก้อน", nameEn: "Bar Soap", categorySlug: "personal-care" },
  { slug: "shampoo", nameTh: "แชมพู", nameEn: "Shampoo", categorySlug: "personal-care" },
  { slug: "toothpaste", nameTh: "ยาสีฟัน", nameEn: "Toothpaste", categorySlug: "personal-care" },
  { slug: "body-wash", nameTh: "ครีมอาบน้ำ", nameEn: "Body Wash", categorySlug: "personal-care" },
  { slug: "sanitary-pads", nameTh: "ผ้าอนามัย", nameEn: "Sanitary Pads", categorySlug: "personal-care" },
  // Baby
  { slug: "baby-diaper", nameTh: "ผ้าอ้อมเด็ก", nameEn: "Baby Diaper", categorySlug: "baby" },
  { slug: "baby-formula", nameTh: "นมผง", nameEn: "Baby Formula", categorySlug: "baby" },
  { slug: "baby-soap", nameTh: "สบู่เด็ก", nameEn: "Baby Soap", categorySlug: "baby" },
  // Pet
  { slug: "cat-food", nameTh: "อาหารแมว", nameEn: "Cat Food", categorySlug: "pet" },
  { slug: "dog-food", nameTh: "อาหารสุนัข", nameEn: "Dog Food", categorySlug: "pet" },
  { slug: "cat-litter", nameTh: "ทรายแมว", nameEn: "Cat Litter", categorySlug: "pet" },
  // Frozen
  { slug: "sausage", nameTh: "ไส้กรอก", nameEn: "Sausage", categorySlug: "frozen" },
  { slug: "chicken-nuggets", nameTh: "นักเก็ตไก่", nameEn: "Chicken Nuggets", categorySlug: "frozen" },
  { slug: "frozen-ready-meal", nameTh: "อาหารพร้อมทานแช่แข็ง", nameEn: "Frozen Ready Meal", categorySlug: "frozen" },
  // Snacks
  { slug: "potato-chips", nameTh: "มันฝรั่งทอด", nameEn: "Potato Chips", categorySlug: "snacks" },
  { slug: "biscuits", nameTh: "บิสกิต", nameEn: "Biscuits", categorySlug: "snacks" },
  { slug: "cookies", nameTh: "คุกกี้", nameEn: "Cookies", categorySlug: "snacks" },
  // Coffee & Tea
  { slug: "coffee-3in1", nameTh: "กาแฟ 3in1", nameEn: "Coffee 3in1", categorySlug: "coffee-tea" },
  { slug: "ground-coffee", nameTh: "กาแฟคั่วบด", nameEn: "Ground Coffee", categorySlug: "coffee-tea" },
  { slug: "green-tea", nameTh: "ชาเขียว", nameEn: "Green Tea", categorySlug: "coffee-tea" },
  // Canned Goods
  { slug: "canned-fish", nameTh: "ปลากระป๋อง", nameEn: "Canned Fish", categorySlug: "canned-goods" },
  { slug: "canned-fruit", nameTh: "ผลไม้กระป๋อง", nameEn: "Canned Fruit", categorySlug: "canned-goods" },
  { slug: "pickled-mustard", nameTh: "ผักกาดดอง", nameEn: "Pickled Mustard", categorySlug: "canned-goods" },
];

/**
 * Maps a canonical product to the exact raw name a source emits.
 * - DIT names are copied verbatim from the pricelist.dit.go.th catalog
 *   (getdata.php?TYPE=product) so scraped rows match.
 * - EPPO names are what the eppo scraper emits (PTT retail fuels).
 * - Makro/Lotus's names are what their scrapers emit (Thai product titles).
 * - Si Mum Muang emits the canonical Thai name, so the mapping reuses
 *   productSeeds[].nameTh below.
 */
interface MappingSeed {
  sourceSlug: string;
  productSlug: string;
  sourceProductName: string;
}

const ditMappings: MappingSeed[] = [
  // meat
  { sourceSlug: "dit", productSlug: "pork-belly", sourceProductName: "สุกรชำแหละ เนื้อสามชั้น" },
  { sourceSlug: "dit", productSlug: "pork-shoulder", sourceProductName: "สุกรชำแหละ เนื้อแดง สะโพก (ตัดแต่ง)" },
  { sourceSlug: "dit", productSlug: "chicken-whole", sourceProductName: "ไก่สดทั้งตัว (รวมเครื่องใน)" },
  { sourceSlug: "dit", productSlug: "beef", sourceProductName: "เนื้อโค สะโพก" },
  // eggs & dairy
  { sourceSlug: "dit", productSlug: "chicken-egg", sourceProductName: "ไข่ไก่ เบอร์ 2" },
  { sourceSlug: "dit", productSlug: "duck-egg", sourceProductName: "ไข่เป็ด กลาง" },
  // vegetables
  { sourceSlug: "dit", productSlug: "chinese-kale", sourceProductName: "ผักคะน้า คละ" },
  { sourceSlug: "dit", productSlug: "morning-glory", sourceProductName: "ผักบุ้งจีน คละ" },
  { sourceSlug: "dit", productSlug: "chinese-cabbage", sourceProductName: "ผักกวางตุ้ง คละ" },
  { sourceSlug: "dit", productSlug: "long-bean", sourceProductName: "ถั่วฝักยาว คละ" },
  { sourceSlug: "dit", productSlug: "cucumber", sourceProductName: "แตงกวา คละ" },
  { sourceSlug: "dit", productSlug: "tomato", sourceProductName: "มะเขือเทศผลใหญ่ คละ" },
  { sourceSlug: "dit", productSlug: "chili", sourceProductName: "พริกขี้หนูสวน (เม็ดกลาง)" },
  // rice
  { sourceSlug: "dit", productSlug: "jasmine-rice", sourceProductName: "ข้าวสารเจ้า 100% ข้าวหอม ร้านค้าทั่วไป" },
  { sourceSlug: "dit", productSlug: "white-rice", sourceProductName: "ข้าวสารเจ้า 100% ธรรมดา ร้านค้าทั่วไป" },
  { sourceSlug: "dit", productSlug: "sticky-rice", sourceProductName: "ข้าวสารเหนียว สันป่าตอง (เขี้ยวงู) 100%" },
  // oil & fat
  { sourceSlug: "dit", productSlug: "palm-oil", sourceProductName: "น้ำมันปาล์มสำเร็จรูป บรรจุขวด1 ลิตร" },
  { sourceSlug: "dit", productSlug: "soybean-oil", sourceProductName: "น้ำมันถั่วเหลืองบริสุทธิ์ บรรจุขวด 1 ลิตร ตรากุ๊ก" },
  // fruit
  { sourceSlug: "dit", productSlug: "orange", sourceProductName: "ส้มเขียวหวาน สายน้ำผึ้ง เบอร์ 4" },
  { sourceSlug: "dit", productSlug: "mango", sourceProductName: "มะม่วงน้ำดอกไม้ เบอร์ 0" },
  { sourceSlug: "dit", productSlug: "banana", sourceProductName: "กล้วยน้ำว้า" },
  { sourceSlug: "dit", productSlug: "watermelon", sourceProductName: "แตงโม พันธุ์กินรี" },
];

const eppoMappings: MappingSeed[] = [
  { sourceSlug: "eppo", productSlug: "benzine-95", sourceProductName: "เบนซิน 95" },
  { sourceSlug: "eppo", productSlug: "gasohol-91", sourceProductName: "แก๊สโซฮอล์ 91" },
  { sourceSlug: "eppo", productSlug: "gasohol-e20", sourceProductName: "แก๊สโซฮอล์ E20" },
  { sourceSlug: "eppo", productSlug: "diesel", sourceProductName: "ดีเซล" },
  { sourceSlug: "eppo", productSlug: "lpg", sourceProductName: "แก๊สหุงต้ม (LPG)" },
];

/** Products the Si Mum Muang API reports on (Thai canonical names). */
const MOCK_PRODUCT_SLUGS = [
  // meat
  "pork-belly",
  "pork-ribs",
  "pork-ground",
  "chicken-breast",
  "chicken-drumstick",
  // vegetables
  "morning-glory",
  "chinese-kale",
  "long-bean",
  "cucumber",
  "tomato",
  "chili",
  "chinese-cabbage",
  // fruit
  "orange",
  "mango",
  "banana",
  "watermelon",
  // seafood
  "white-shrimp",
  "squid",
  "blue-crab",
  "tilapia",
  // eggs & dairy
  "chicken-egg",
  "duck-egg",
  // oil & fat
  // seasoning
  "sugar",
  "coconut-milk",
];

const nameThBySlug = new Map(productSeeds.map((p) => [p.slug, p.nameTh]));

const simummuangMappings: MappingSeed[] = MOCK_PRODUCT_SLUGS.map((productSlug) => ({
  sourceSlug: "simummuang",
  productSlug,
  sourceProductName: nameThBySlug.get(productSlug) ?? productSlug,
}));

/**
 * Makro sells wholesale quantities, but for consistency with the other
 * sources we use the Thai product name as-is. Real Makro data will introduce
 * bulk units (บาท/กล่อง 5 กก. etc.) — per-unit normalization is Phase 3.
 */
const makroMappings: MappingSeed[] = [
  // seafood
  { sourceSlug: "makro", productSlug: "mackerel", sourceProductName: "ปลาทู" },
  { sourceSlug: "makro", productSlug: "white-shrimp", sourceProductName: "กุ้งขาว" },
  { sourceSlug: "makro", productSlug: "squid", sourceProductName: "ปลาหมึก" },
  { sourceSlug: "makro", productSlug: "blue-crab", sourceProductName: "ปูม้า" },
  { sourceSlug: "makro", productSlug: "tilapia", sourceProductName: "ปลานิล" },
  // dry goods
  { sourceSlug: "makro", productSlug: "jasmine-rice", sourceProductName: "ข้าวหอมมะลิ" },
  { sourceSlug: "makro", productSlug: "white-rice", sourceProductName: "ข้าวขาว" },
  { sourceSlug: "makro", productSlug: "sugar", sourceProductName: "น้ำตาลทราย" },
  { sourceSlug: "makro", productSlug: "palm-oil", sourceProductName: "น้ำมันปาล์ม" },
  { sourceSlug: "makro", productSlug: "soybean-oil", sourceProductName: "น้ำมันถั่วเหลือง" },
  { sourceSlug: "makro", productSlug: "fish-sauce", sourceProductName: "น้ำปลา" },
  { sourceSlug: "makro", productSlug: "drinking-water", sourceProductName: "น้ำดื่ม" },
  { sourceSlug: "makro", productSlug: "instant-noodles", sourceProductName: "บะหมี่กึ่งสำเร็จรูป" },
  { sourceSlug: "makro", productSlug: "wheat-flour", sourceProductName: "แป้งสาลี" },
  { sourceSlug: "makro", productSlug: "chicken-egg", sourceProductName: "ไข่ไก่" },
  // Meat
  { sourceSlug: "makro", productSlug: "pork-mince", sourceProductName: "หมูสับ" },
  { sourceSlug: "makro", productSlug: "pork-belly", sourceProductName: "หมูสามชั้น" },
  { sourceSlug: "makro", productSlug: "pork-shoulder", sourceProductName: "หมูสะโพก" },
  { sourceSlug: "makro", productSlug: "pork-ribs", sourceProductName: "ซี่โครงหมู" },
  { sourceSlug: "makro", productSlug: "pork-neck", sourceProductName: "หมูคอสไลซ์" },
  { sourceSlug: "makro", productSlug: "pork-ground", sourceProductName: "หมูบด" },
  { sourceSlug: "makro", productSlug: "chicken-whole", sourceProductName: "ไก่สด" },
  { sourceSlug: "makro", productSlug: "chicken-ground", sourceProductName: "ไก่บด" },
  { sourceSlug: "makro", productSlug: "chicken-grilled", sourceProductName: "ไก่ย่าง" },
  { sourceSlug: "makro", productSlug: "chicken-wings", sourceProductName: "ปีกไก่" },
  { sourceSlug: "makro", productSlug: "chicken-breast", sourceProductName: "อกไก่" },
  { sourceSlug: "makro", productSlug: "chicken-drumstick", sourceProductName: "น่องไก่" },
  { sourceSlug: "makro", productSlug: "beef", sourceProductName: "เนื้อวัว" },
  // Vegetables
  { sourceSlug: "makro", productSlug: "chinese-kale", sourceProductName: "ผักคะน้า" },
  { sourceSlug: "makro", productSlug: "morning-glory", sourceProductName: "ผักบุ้ง" },
  { sourceSlug: "makro", productSlug: "chili", sourceProductName: "พริกขี้หนู" },
  { sourceSlug: "makro", productSlug: "tomato", sourceProductName: "มะเขือเทศ" },
  { sourceSlug: "makro", productSlug: "cucumber", sourceProductName: "แตงกวา" },
  { sourceSlug: "makro", productSlug: "long-bean", sourceProductName: "ถั่วฝักยาว" },
  { sourceSlug: "makro", productSlug: "chinese-cabbage", sourceProductName: "ผักกวางตุ้งฮุง" },
  // Fruit
  { sourceSlug: "makro", productSlug: "orange", sourceProductName: "ส้ม" },
  { sourceSlug: "makro", productSlug: "mango", sourceProductName: "มะม่วง" },
  { sourceSlug: "makro", productSlug: "banana", sourceProductName: "กล้วยน้ำว้า" },
  { sourceSlug: "makro", productSlug: "watermelon", sourceProductName: "แตงโม" },
  // Household
  { sourceSlug: "makro", productSlug: "detergent", sourceProductName: "ผงซักฟอก" },
  { sourceSlug: "makro", productSlug: "dish-soap", sourceProductName: "น้ำยาล้างจาน" },
  { sourceSlug: "makro", productSlug: "floor-cleaner", sourceProductName: "น้ำยาถูพื้น" },
  { sourceSlug: "makro", productSlug: "toilet-cleaner", sourceProductName: "น้ำยาล้างห้องน้ำ" },
  { sourceSlug: "makro", productSlug: "toilet-paper", sourceProductName: "ทิชชู่" },
  // Personal Care
  { sourceSlug: "makro", productSlug: "bar-soap", sourceProductName: "สบู่ก้อน" },
  { sourceSlug: "makro", productSlug: "shampoo", sourceProductName: "แชมพู" },
  { sourceSlug: "makro", productSlug: "toothpaste", sourceProductName: "ยาสีฟัน" },
  { sourceSlug: "makro", productSlug: "body-wash", sourceProductName: "ครีมอาบน้ำ" },
  { sourceSlug: "makro", productSlug: "sanitary-pads", sourceProductName: "ผ้าอนามัย" },
  // Pet Care
  { sourceSlug: "makro", productSlug: "cat-food", sourceProductName: "อาหารแมว" },
  { sourceSlug: "makro", productSlug: "dog-food", sourceProductName: "อาหารสุนัข" },
];

/**
 * Lotus's is a full supermarket — same product coverage as Makro plus the
 * retail staples DIT tracks (rice, eggs, oil, sugar). Thai names are what the
 * Lotus's BFF emits.
 */
const lotussMappings: MappingSeed[] = [
  { sourceSlug: "lotuss", productSlug: "pork-belly", sourceProductName: "หมูสามชั้น" },
  { sourceSlug: "lotuss", productSlug: "pork-shoulder", sourceProductName: "หมูสะโพก" },
  { sourceSlug: "lotuss", productSlug: "pork-ribs", sourceProductName: "ซี่โครงหมู" },
  { sourceSlug: "lotuss", productSlug: "pork-neck", sourceProductName: "หมูคอสไลซ์" },
  { sourceSlug: "lotuss", productSlug: "pork-ground", sourceProductName: "หมูบด" },
  { sourceSlug: "lotuss", productSlug: "chicken-ground", sourceProductName: "ไก่บด" },
  { sourceSlug: "lotuss", productSlug: "chicken-grilled", sourceProductName: "ไก่ย่าง" },
  { sourceSlug: "lotuss", productSlug: "chicken-wings", sourceProductName: "ปีกไก่" },
  { sourceSlug: "lotuss", productSlug: "chicken-breast", sourceProductName: "อกไก่" },
  { sourceSlug: "lotuss", productSlug: "chicken-drumstick", sourceProductName: "น่องไก่" },
  { sourceSlug: "lotuss", productSlug: "beef-sliced", sourceProductName: "เนื้อวัวสไลซ์" },
  { sourceSlug: "lotuss", productSlug: "mackerel", sourceProductName: "ปลาทู" },
  { sourceSlug: "lotuss", productSlug: "pork-mince", sourceProductName: "หมูสับ" },
  { sourceSlug: "lotuss", productSlug: "beef", sourceProductName: "เนื้อวัว" },
  { sourceSlug: "lotuss", productSlug: "chinese-kale", sourceProductName: "ผักคะน้า" },
  { sourceSlug: "lotuss", productSlug: "morning-glory", sourceProductName: "ผักบุ้ง" },
  { sourceSlug: "lotuss", productSlug: "chili", sourceProductName: "พริกขี้หนู" },
  { sourceSlug: "lotuss", productSlug: "tomato", sourceProductName: "มะเขือเทศ" },
  { sourceSlug: "lotuss", productSlug: "cucumber", sourceProductName: "แตงกวา" },
  { sourceSlug: "lotuss", productSlug: "long-bean", sourceProductName: "ถั่วฝักยาว" },
  { sourceSlug: "lotuss", productSlug: "jasmine-rice", sourceProductName: "ข้าวหอมมะลิ" },
  { sourceSlug: "lotuss", productSlug: "white-rice", sourceProductName: "ข้าวขาว" },
  { sourceSlug: "lotuss", productSlug: "chicken-egg", sourceProductName: "ไข่ไก่" },
  { sourceSlug: "lotuss", productSlug: "palm-oil", sourceProductName: "น้ำมันปาล์ม" },
  { sourceSlug: "lotuss", productSlug: "soybean-oil", sourceProductName: "น้ำมันถั่วเหลือง" },
  { sourceSlug: "lotuss", productSlug: "sugar", sourceProductName: "น้ำตาลทราย" },
  { sourceSlug: "lotuss", productSlug: "detergent", sourceProductName: "ผงซักฟอก" },
  { sourceSlug: "lotuss", productSlug: "dish-soap", sourceProductName: "น้ำยาล้างจาน" },
  { sourceSlug: "lotuss", productSlug: "shampoo", sourceProductName: "แชมพู" },
  { sourceSlug: "lotuss", productSlug: "toothpaste", sourceProductName: "ยาสีฟัน" },
  { sourceSlug: "lotuss", productSlug: "baby-diaper", sourceProductName: "ผ้าอ้อมเด็ก" },
  { sourceSlug: "lotuss", productSlug: "baby-formula", sourceProductName: "นมผง" },
  { sourceSlug: "lotuss", productSlug: "baby-soap", sourceProductName: "สบู่เด็ก" },
  { sourceSlug: "lotuss", productSlug: "bread", sourceProductName: "ขนมปัง" },
  { sourceSlug: "lotuss", productSlug: "fruit-juice", sourceProductName: "น้ำผลไม้" },
  { sourceSlug: "lotuss", productSlug: "soda", sourceProductName: "น้ำอัดลม" },
  { sourceSlug: "lotuss", productSlug: "canned-fruit", sourceProductName: "ผลไม้กระป๋อง" },
  { sourceSlug: "lotuss", productSlug: "pickled-mustard", sourceProductName: "ผักกาดดอง" },
  { sourceSlug: "lotuss", productSlug: "coffee-3in1", sourceProductName: "กาแฟ 3in1" },
  { sourceSlug: "lotuss", productSlug: "ground-coffee", sourceProductName: "กาแฟคั่วบด" },
  { sourceSlug: "lotuss", productSlug: "green-tea", sourceProductName: "ชาเขียว" },
  { sourceSlug: "lotuss", productSlug: "frozen-ready-meal", sourceProductName: "อาหารพร้อมทานแช่แข็ง" },
  { sourceSlug: "lotuss", productSlug: "sausage", sourceProductName: "ไส้กรอก" },
  { sourceSlug: "lotuss", productSlug: "chicken-nuggets", sourceProductName: "นักเก็ตไก่" },
  { sourceSlug: "lotuss", productSlug: "toilet-cleaner", sourceProductName: "น้ำยาล้างห้องน้ำ" },
  { sourceSlug: "lotuss", productSlug: "floor-cleaner", sourceProductName: "น้ำยาถูพื้น" },
  { sourceSlug: "lotuss", productSlug: "toilet-paper", sourceProductName: "ทิชชู่" },
  { sourceSlug: "lotuss", productSlug: "rice-noodles", sourceProductName: "เส้นหมี่" },
  { sourceSlug: "lotuss", productSlug: "glass-noodles", sourceProductName: "วุ้นเส้น" },
  { sourceSlug: "lotuss", productSlug: "body-wash", sourceProductName: "ครีมอาบน้ำ" },
  { sourceSlug: "lotuss", productSlug: "sanitary-pads", sourceProductName: "ผ้าอนามัย" },
  { sourceSlug: "lotuss", productSlug: "bar-soap", sourceProductName: "สบู่ก้อน" },
  { sourceSlug: "lotuss", productSlug: "cat-litter", sourceProductName: "ทรายแมว" },
  { sourceSlug: "lotuss", productSlug: "dog-food", sourceProductName: "อาหารสุนัข" },
  { sourceSlug: "lotuss", productSlug: "cat-food", sourceProductName: "อาหารแมว" },
  { sourceSlug: "lotuss", productSlug: "coconut-milk", sourceProductName: "กะทิ" },
  { sourceSlug: "lotuss", productSlug: "salt", sourceProductName: "เกลือ" },
  { sourceSlug: "lotuss", productSlug: "condensed-milk", sourceProductName: "นมข้นหวาน" },
  { sourceSlug: "lotuss", productSlug: "potato-chips", sourceProductName: "มันฝรั่งทอด" },
  { sourceSlug: "lotuss", productSlug: "biscuits", sourceProductName: "บิสกิต" },
  { sourceSlug: "lotuss", productSlug: "cookies", sourceProductName: "คุกกี้" },
  { sourceSlug: "lotuss", productSlug: "detergent", sourceProductName: "ผงซักฟอก" },
  { sourceSlug: "lotuss", productSlug: "dish-soap", sourceProductName: "น้ำยาล้างจาน" },
  { sourceSlug: "lotuss", productSlug: "shampoo", sourceProductName: "แชมพู" },
];

const mappingSeeds: MappingSeed[] = [
  ...ditMappings,
  ...eppoMappings,
  ...makroMappings,
  ...simummuangMappings,
  ...lotussMappings,
];

async function main() {
  const db = getDb();
  if (!db) {
    console.error("Database not available: DATABASE_URL is not set. Skipping seed.");
    process.exit(1);
  }

  console.log("Seeding sources...");
  await db.insert(sources).values(sourceSeeds).onConflictDoNothing();
  console.log(`  Inserted ${sourceSeeds.length} sources (conflicts ignored)`);

  // Update priceType/type/names for existing sources (onConflictDoNothing won't update)
  for (const s of sourceSeeds) {
    await db
      .update(sources)
      .set({ priceType: s.priceType, type: s.type, nameTh: s.nameTh, nameEn: s.nameEn })
      .where(eq(sources.slug, s.slug));
  }
  console.log(`  Updated priceType/type on ${sourceSeeds.length} sources`);

  console.log("Seeding categories...");
  await db.insert(categories).values(categorySeeds).onConflictDoNothing();
  console.log(`  Inserted ${categorySeeds.length} categories (conflicts ignored)`);

  console.log("Seeding provinces...");
  await db.insert(provinces).values(provincesSeed).onConflictDoNothing();
  console.log(`  Inserted ${provincesSeed.length} provinces (conflicts ignored)`);

  console.log("Seeding products...");
  const categoryRows = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories);
  const categoryIdBySlug = new Map(categoryRows.map((c) => [c.slug, c.id]));

  const productValues = productSeeds.map((p) => {
    const categoryId = categoryIdBySlug.get(p.categorySlug);
    if (!categoryId) {
      throw new Error(
        `Unknown category slug "${p.categorySlug}" for product "${p.slug}"`,
      );
    }
    return {
      slug: p.slug,
      nameTh: p.nameTh,
      nameEn: p.nameEn,
      categoryId,
    };
  });
  await db.insert(products).values(productValues).onConflictDoNothing();
  console.log(`  Inserted ${productValues.length} products (conflicts ignored)`);

  // Reassign products to new categories (onConflictDoNothing doesn't update categoryId)
  for (const p of productSeeds) {
    const categoryId = categoryIdBySlug.get(p.categorySlug);
    if (categoryId) {
      await db
        .update(products)
        .set({ categoryId, nameTh: p.nameTh, nameEn: p.nameEn })
        .where(eq(products.slug, p.slug));
    }
  }
  console.log(`  Updated category assignments for ${productSeeds.length} products`);

  console.log("Seeding product-source mappings...");
  const sourceRows = await db.select({ id: sources.id, slug: sources.slug }).from(sources);
  const sourceIdBySlug = new Map(sourceRows.map((s) => [s.slug, s.id]));
  const productRows = await db.select({ id: products.id, slug: products.slug }).from(products);
  const productIdBySlug = new Map(productRows.map((p) => [p.slug, p.id]));

  // Mappings are reference data owned by this seed and the table has no
  // unique constraint — wipe and re-insert so the script stays idempotent.
  await db.delete(productSourceMappings);

  const mappingValues = mappingSeeds.flatMap((m) => {
    const sourceId = sourceIdBySlug.get(m.sourceSlug);
    const productId = productIdBySlug.get(m.productSlug);
    if (!sourceId || !productId) {
      console.warn(`  Skipping mapping ${m.sourceSlug}/${m.productSlug}: ids not found`);
      return [];
    }
    return { sourceId, productId, sourceProductName: m.sourceProductName };
  });
  await db.insert(productSourceMappings).values(mappingValues);
  console.log(`  Inserted ${mappingValues.length} product-source mappings`);

  console.log("Seed completed successfully");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
