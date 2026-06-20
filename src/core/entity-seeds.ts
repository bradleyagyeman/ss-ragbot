export interface EntitySeed {
  canonicalName: string;
  wikiTitle: string;
  manualAliases: string[];
  manualDescriptors: string[];
}

export const ENTITY_SEEDS: EntitySeed[] = [
  {
    canonicalName: "Sunny",
    wikiTitle: "Sunny",
    manualAliases: ["Sunless"],
    manualDescriptors: ["black-haired boy", "pale young man"],
  },
  {
    canonicalName: "Nephis",
    wikiTitle: "Nephis",
    manualAliases: ["Neph", "Changing Star", "Lady Nephis"],
    manualDescriptors: ["silver-haired girl", "silver haired girl"],
  },
  {
    canonicalName: "Cassie",
    wikiTitle: "Cassie",
    manualAliases: ["Cassy", "Cassia"],
    manualDescriptors: ["blind girl", "oracle girl"],
  },
  {
    canonicalName: "Mordret",
    wikiTitle: "Mordret",
    manualAliases: ["Prince of Nothing", "banished prince"],
    manualDescriptors: ["mirror fiend"],
  },
  {
    canonicalName: "Kai",
    wikiTitle: "Kai",
    manualAliases: ["Night"],
    manualDescriptors: ["handsome singer"],
  },
  {
    canonicalName: "Effie",
    wikiTitle: "Effie",
    manualAliases: [],
    manualDescriptors: ["tall huntress", "cheerful huntress"],
  },
  {
    canonicalName: "Rain",
    wikiTitle: "Rain",
    manualAliases: ["Rainy"],
    manualDescriptors: ["young archer"],
  },
];
