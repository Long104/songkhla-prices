import { ditScraper } from "./dit";
import { eppoScraper } from "./eppo";
import { makroScraper } from "./makro";
import { simummuangScraper } from "./simummuang";
import { lotussScraper } from "./lotuss";
import type { Scraper } from "./types";

export const scrapers: Scraper[] = [
  ditScraper,
  eppoScraper,
  makroScraper,
  simummuangScraper,
  lotussScraper,
];
