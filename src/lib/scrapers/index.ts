import { ditScraper } from "./dit";
import { oaeScraper } from "./oae";
import { taladthaiScraper } from "./taladthai";
import { simummuangScraper } from "./simummuang";
import { eppoScraper } from "./eppo";
import type { Scraper } from "./types";

export const scrapers: Scraper[] = [
  ditScraper,
  oaeScraper,
  taladthaiScraper,
  simummuangScraper,
  eppoScraper,
];
