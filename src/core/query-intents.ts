export interface FirstAppearanceIntent {
  kind: "first_appearance";
  entity: string;
}

export interface FirstNamedMentionIntent {
  kind: "first_named_mention";
  entity: string;
}

export interface DirectEntityIntent {
  kind: "direct_entity";
  entity: string;
}

export interface TrueNameIntent {
  kind: "true_name";
  entity: string;
}

export interface RelationshipIntent {
  kind: "relationship";
  left: string;
  right: string;
}

export interface AliasEquivalenceIntent {
  kind: "alias_equivalence";
  left: string;
  right: string;
}

export function parseFirstAppearanceIntent(query: string): FirstAppearanceIntent | undefined {
  const normalized = query.trim().replace(/\s+/g, " ");

  const patterns = [
    /^when was (.+?) first introduced\??$/i,
    /^when did (.+?) first appear\??$/i,
    /^what chapter was (.+?) first introduced in\??$/i,
    /^who is (.+?) and when was (?:he|she|they) introduced\??$/i,
    /^who is (.+?) and when did (?:he|she|they) first appear\??$/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const entity = match?.[1]?.trim();
    if (entity) {
      return {
        kind: "first_appearance",
        entity: entity.replace(/^the\s+/i, "").trim(),
      };
    }
  }

  return undefined;
}

export function parseFirstNamedMentionIntent(query: string): FirstNamedMentionIntent | undefined {
  const normalized = query.trim().replace(/\s+/g, " ");

  const patterns = [
    /^when was (.+?) first mentioned\??$/i,
    /^where was (.+?) first mentioned\??$/i,
    /^when was (.+?) first named\??$/i,
    /^what chapter was (.+?) first mentioned in\??$/i,
    /^what chapter was (.+?) first named in\??$/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const entity = match?.[1]?.trim();
    if (entity) {
      return {
        kind: "first_named_mention",
        entity: entity.replace(/^the\s+/i, "").trim(),
      };
    }
  }

  return undefined;
}

export function parseDirectEntityIntent(query: string): DirectEntityIntent | undefined {
  const normalized = query.trim().replace(/\s+/g, " ");
  const patterns: Array<{
    pattern: RegExp;
    allow: (entity: string) => boolean;
  }> = [
    {
      pattern: /^who is (.+?)\??$/i,
      allow: () => true,
    },
    {
      pattern: /^who was (.+?)\??$/i,
      allow: () => true,
    },
    {
      pattern: /^what is (.+?)\??$/i,
      allow: isLikelyDirectWhatEntity,
    },
    {
      pattern: /^what was (.+?)\??$/i,
      allow: isLikelyDirectWhatEntity,
    },
  ];

  for (const { pattern, allow } of patterns) {
    const match = normalized.match(pattern);
    const entity = match?.[1]?.trim();
    if (entity && allow(entity)) {
      return {
        kind: "direct_entity",
        entity: entity.replace(/^the\s+/i, "").trim(),
      };
    }
  }

  return undefined;
}

export function parseTrueNameIntent(query: string): TrueNameIntent | undefined {
  const normalized = query.trim().replace(/\s+/g, " ");
  const patterns = [
    /^what is (.+?)'s true name\??$/i,
    /^what is the true name of (.+?)\??$/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const entity = match?.[1]?.trim();
    if (entity) {
      return {
        kind: "true_name",
        entity: entity.replace(/^the\s+/i, "").trim(),
      };
    }
  }

  return undefined;
}

export function parseRelationshipIntent(query: string): RelationshipIntent | undefined {
  const normalized = query.trim().replace(/\s+/g, " ");
  const patterns: Array<{
    pattern: RegExp;
    map: (match: RegExpMatchArray) => RelationshipIntent | undefined;
  }> = [
    {
      pattern: /^what is the relationship between (.+?) and (.+?)\??$/i,
      map: (match) => buildRelationshipIntent(match[1], match[2]),
    },
    {
      pattern: /^how are (.+?) and (.+?) related\??$/i,
      map: (match) => buildRelationshipIntent(match[1], match[2]),
    },
    {
      pattern: /^what is (.+?)'s relationship to (.+?)\??$/i,
      map: (match) => buildRelationshipIntent(match[1], match[2]),
    },
  ];

  for (const { pattern, map } of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      return map(match);
    }
  }

  return undefined;
}

function isLikelyDirectWhatEntity(entity: string): boolean {
  const normalized = entity
    .trim()
    .toLowerCase()
    .replace(/^the\s+/i, "")
    .replace(/\s+/g, " ");

  const relationalPrefixes = [
    "name of ",
    "relationship between ",
    "difference between ",
    "meaning of ",
    "significance of ",
    "importance of ",
    "history of ",
    "story of ",
    "purpose of ",
    "role of ",
    "reason for ",
    "reason behind ",
    "cause of ",
  ];

  return !relationalPrefixes.some((prefix) => normalized.startsWith(prefix));
}

export function parseAliasEquivalenceIntent(query: string): AliasEquivalenceIntent | undefined {
  const normalized = query.trim().replace(/\s+/g, " ");
  const patterns: Array<{
    pattern: RegExp;
    map: (match: RegExpMatchArray) => AliasEquivalenceIntent | undefined;
  }> = [
    {
      pattern: /^are (.+?) and (.+?) the same (?:person|character)\??$/i,
      map: (match) => buildAliasEquivalenceIntent(match[1], match[2]),
    },
    {
      pattern: /^is (.+?) the same (?:person|character) as (.+?)\??$/i,
      map: (match) => buildAliasEquivalenceIntent(match[1], match[2]),
    },
    {
      pattern: /^is (.+?) actually (.+?)\??$/i,
      map: (match) => buildAliasEquivalenceIntent(match[1], match[2]),
    },
    {
      pattern: /^is (.+?) another name for (.+?)\??$/i,
      map: (match) => buildAliasEquivalenceIntent(match[1], match[2]),
    },
  ];

  for (const { pattern, map } of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      return map(match);
    }
  }

  return undefined;
}

function buildAliasEquivalenceIntent(
  left: string | undefined,
  right: string | undefined,
): AliasEquivalenceIntent | undefined {
  const normalizedLeft = left?.replace(/^the\s+/i, "").trim();
  const normalizedRight = right?.replace(/^the\s+/i, "").trim();

  if (!normalizedLeft || !normalizedRight) {
    return undefined;
  }

  return {
    kind: "alias_equivalence",
    left: normalizedLeft,
    right: normalizedRight,
  };
}

function buildRelationshipIntent(
  left: string | undefined,
  right: string | undefined,
): RelationshipIntent | undefined {
  const normalizedLeft = left?.replace(/^the\s+/i, "").trim();
  const normalizedRight = right?.replace(/^the\s+/i, "").trim();

  if (!normalizedLeft || !normalizedRight) {
    return undefined;
  }

  return {
    kind: "relationship",
    left: normalizedLeft,
    right: normalizedRight,
  };
}
