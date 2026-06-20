import { normalizeEntityText } from "./entity-normalize.js";

export interface RelationshipFact {
  id: string;
  leftTerms: string[];
  rightTerms: string[];
  answer: string;
}

const RELATIONSHIP_FACTS: RelationshipFact[] = [
  {
    id: "sunny-rain",
    leftTerms: ["Sunny", "Sunless"],
    rightTerms: ["Rain"],
    answer: "Sunny and Rain are siblings; Rain is Sunny's younger sister. Sunny also becomes her teacher later in the story.",
  },
  {
    id: "mordret-valor",
    leftTerms: ["Mordret", "Prince Mordret", "Prince of Nothing"],
    rightTerms: ["Valor", "Clan Valor", "House Valor"],
    answer: "Mordret is tied to Clan Valor by bloodline and family lineage.",
  },
];

export function resolveRelationshipFact(
  left: string,
  right: string,
): RelationshipFact | undefined {
  const normalizedLeft = normalizeEntityText(left);
  const normalizedRight = normalizeEntityText(right);

  if (!normalizedLeft || !normalizedRight) {
    return undefined;
  }

  return RELATIONSHIP_FACTS.find((fact) => {
    const leftMatches = fact.leftTerms.some((term) => normalizeEntityText(term) === normalizedLeft);
    const rightMatches = fact.rightTerms.some((term) => normalizeEntityText(term) === normalizedRight);
    const reversedLeftMatches = fact.leftTerms.some((term) => normalizeEntityText(term) === normalizedRight);
    const reversedRightMatches = fact.rightTerms.some((term) => normalizeEntityText(term) === normalizedLeft);

    return (leftMatches && rightMatches) || (reversedLeftMatches && reversedRightMatches);
  });
}
