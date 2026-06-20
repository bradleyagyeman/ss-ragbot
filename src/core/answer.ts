import { getPool } from "../db/connection.js";
import {
  findAliasEquivalenceEvidence,
  findChunksByExactMention,
  findChunksByExactMentionTerms,
  findFirstChunkMention,
  findFirstChunkMentionForTerms,
  getChapterByNumber,
  scoreAliasEvidenceText,
  type AliasEvidenceChunk,
} from "../db/queries.js";
import { createAnswerProvider } from "../providers/llm.js";
import type { AppConfig, AskResult, Citation, RetrievedChunk, SearchFilters } from "../types/index.js";
import { buildAnswerPrompt } from "./prompt.js";
import {
  parseAliasEquivalenceIntent,
  parseDirectEntityIntent,
  parseFirstAppearanceIntent,
  parseFirstNamedMentionIntent,
  parseRelationshipIntent,
  parseTrueNameIntent,
} from "./query-intents.js";
import { searchChunks } from "./retrieve.js";
import { resolveRelationshipFact } from "./relationship-facts.js";
import { canUseEntityForEquivalence, getEntityMentionTerms, hydrateEntityMetadataIfMissing, resolveEntityReference } from "./wiki-entities.js";

const DISPLAY_CITATION_LIMIT = 3;

export async function answerQuestion(
  config: AppConfig,
  question: string,
  topK: number,
  filters: SearchFilters,
  citationsOnly = false,
  emptyResultMessage = "Not enough evidence found in the indexed corpus.",
  requireExactEntityMatches = false,
): Promise<AskResult> {
  const pool = getPool(config);
  const aliasEquivalenceIntent = parseAliasEquivalenceIntent(question);
  if (aliasEquivalenceIntent) {
    const leftEntity = await resolveEntityReference(config, aliasEquivalenceIntent.left);
    const rightEntity = await resolveEntityReference(config, aliasEquivalenceIntent.right);

    if (!leftEntity || !rightEntity || !canUseEntityForEquivalence(leftEntity) || !canUseEntityForEquivalence(rightEntity)) {
      return {
        question,
        answer: `Not enough entity metadata was found to determine whether ${aliasEquivalenceIntent.left} and ${aliasEquivalenceIntent.right} are the same person.`,
        citations: [],
        chunks: [],
        model: "rule-based:alias-equivalence-refusal",
      };
    }

    if (leftEntity.id === rightEntity.id) {
      const evidenceCandidates = await findAliasEquivalenceEvidence(
        pool,
        [leftEntity.matchedText],
        [rightEntity.matchedText],
        [leftEntity.canonicalName],
        24,
        filters,
      );
      const evidence = selectAliasEquivalenceEvidence(
        evidenceCandidates,
        [leftEntity.matchedText],
        [rightEntity.matchedText],
        [leftEntity.canonicalName],
      );

      if (evidence.length === 0) {
        return {
          question,
          answer: emptyResultMessage,
          citations: [],
          chunks: [],
          model: "rule-based:alias-equivalence",
        };
      }

      const citations = uniqueCitationsInOrder(evidence);
      const lead = `Yes. ${aliasEquivalenceIntent.left} and ${aliasEquivalenceIntent.right} are the same person.`;
      const support = buildAliasEvidenceSummary(evidence);

      return {
        question,
        answer: [lead, support].filter((part) => part.length > 0).join(" "),
        citations,
        chunks: evidence,
        model: "rule-based:alias-equivalence",
      };
    }

    const leftEvidence = await findChunksByExactMentionTerms(pool, [leftEntity.matchedText], 1, filters);
    const rightEvidence = await findChunksByExactMentionTerms(pool, [rightEntity.matchedText], 1, filters);
    if ((filters.chapterFrom !== undefined || filters.chapterTo !== undefined) && (leftEvidence.length === 0 || rightEvidence.length === 0)) {
      return {
        question,
        answer: emptyResultMessage,
        citations: [],
        chunks: [],
        model: "rule-based:alias-equivalence",
      };
    }

    const chunks = [...leftEvidence, ...rightEvidence].slice(0, 2);
    return {
      question,
      answer: `No. ${aliasEquivalenceIntent.left} and ${aliasEquivalenceIntent.right} are not the same person.`,
      citations: uniqueCitationsInOrder(chunks),
      chunks,
      model: "rule-based:alias-equivalence",
    };
  }

  const firstAppearanceIntent = parseFirstAppearanceIntent(question);
  if (firstAppearanceIntent) {
    const resolvedEntity = await resolveEntityReference(config, firstAppearanceIntent.entity);
    if (resolvedEntity?.firstAppearanceChapter) {
      if (
        (filters.chapterFrom !== undefined && resolvedEntity.firstAppearanceChapter < filters.chapterFrom) ||
        (filters.chapterTo !== undefined && resolvedEntity.firstAppearanceChapter > filters.chapterTo)
      ) {
        return {
          question,
          answer: emptyResultMessage,
          citations: [],
          chunks: [],
          model: "rule-based:first-appearance",
        };
      }

      const appearanceChapter = await getChapterByNumber(pool, resolvedEntity.firstAppearanceChapter);
      const mentionTerms = getEntityMentionTerms(resolvedEntity);
      const firstMention = mentionTerms.length > 0
        ? await findFirstChunkMentionForTerms(pool, mentionTerms, filters)
        : undefined;

      const answerParts = [
        buildResolvedEntityLead(resolvedEntity),
        `According to the Shadow Slave Wiki, ${resolvedEntity.canonicalName} first appears in Chapter ${resolvedEntity.firstAppearanceChapter}${appearanceChapter ? `, "${appearanceChapter.title}"` : ""}.`,
      ].filter((part) => part.length > 0);

      const citations: Citation[] = [];
      if (appearanceChapter) {
        citations.push({
          chapterNumber: resolvedEntity.firstAppearanceChapter,
          title: appearanceChapter.title,
          sourceUrl: appearanceChapter.source_url,
        });
      }

      const chunks = firstMention ? [firstMention] : [];
      if (
        firstMention &&
        firstMention.chapterNumber !== resolvedEntity.firstAppearanceChapter
      ) {
        answerParts.push(
          `In the ingested novel text, the earliest named mention is Chapter ${firstMention.chapterNumber}, "${firstMention.chapterTitle}".`,
        );
        citations.push({
          chapterNumber: firstMention.chapterNumber,
          title: firstMention.chapterTitle,
          sourceUrl: firstMention.sourceUrl,
        });
      }

      return {
        question,
        answer: answerParts.join(" "),
        citations: dedupeCitations(citations),
        chunks,
        model: "rule-based:first-appearance",
      };
    }

    const fallbackFirstMention = await findFirstChunkMention(pool, firstAppearanceIntent.entity, filters);
    if (fallbackFirstMention) {
      return {
        question,
        answer: `Structured first-appearance metadata was not available, but the earliest named mention found in the novel text is Chapter ${fallbackFirstMention.chapterNumber}, "${fallbackFirstMention.chapterTitle}".`,
        citations: uniqueCitations([fallbackFirstMention]),
        chunks: [fallbackFirstMention],
        model: "rule-based:first-appearance-fallback",
      };
    }
  }

  const firstMentionIntent = parseFirstNamedMentionIntent(question);
  if (firstMentionIntent) {
    const resolvedEntity = await resolveEntityReference(config, firstMentionIntent.entity);
    const mentionTerms = resolvedEntity ? getEntityMentionTerms(resolvedEntity) : [firstMentionIntent.entity];
    const firstMention = mentionTerms.length > 0
      ? await findFirstChunkMentionForTerms(pool, mentionTerms, filters)
      : await findFirstChunkMention(pool, firstMentionIntent.entity, filters);
    if (firstMention) {
      const subject = resolvedEntity?.canonicalName ?? firstMentionIntent.entity;
      return {
        question,
        answer: `${subject} is first named in Chapter ${firstMention.chapterNumber}, "${firstMention.chapterTitle}".`,
        citations: uniqueCitations([firstMention]),
        chunks: [firstMention],
        model: "rule-based:first-named-mention",
      };
    }
  }

  const trueNameIntent = parseTrueNameIntent(question);
  if (trueNameIntent) {
    const resolvedEntity = await resolveEntityReferenceWithHydration(config, trueNameIntent.entity);
    const trueNames = resolvedEntity?.terms.filter((term) => term.kind === "wiki_true_name").map((term) => term.text) ?? [];
    if (resolvedEntity && trueNames.length > 0) {
      const chunks = await findChunksByExactMentionTerms(pool, trueNames, topK, filters);
      if ((filters.chapterFrom !== undefined || filters.chapterTo !== undefined) && chunks.length === 0) {
        return {
          question,
          answer: emptyResultMessage,
          citations: [],
          chunks: [],
          model: "rule-based:true-name",
        };
      }

      return {
        question,
        answer: `${resolvedEntity.canonicalName}'s True Name is "${trueNames[0]}".`,
        citations: uniqueCitationsInOrder(chunks).slice(0, DISPLAY_CITATION_LIMIT),
        chunks,
        model: "rule-based:true-name",
      };
    }

    return {
      question,
      answer: `Structured entity metadata for "${trueNameIntent.entity}" is not available locally, and the wiki source could not be refreshed.`,
      citations: [],
      chunks: [],
      model: "rule-based:true-name-refusal",
    };
  }

  const relationshipIntent = parseRelationshipIntent(question);
  if (relationshipIntent) {
    const leftEntity = await resolveEntityReference(config, relationshipIntent.left);
    const rightEntity = await resolveEntityReference(config, relationshipIntent.right);
    const fact = resolveRelationshipFact(
      leftEntity?.canonicalName ?? relationshipIntent.left,
      rightEntity?.canonicalName ?? relationshipIntent.right,
    );

    if (fact) {
      const chunks = await searchChunks(config, question, Math.max(topK, DISPLAY_CITATION_LIMIT), filters);
      if ((filters.chapterFrom !== undefined || filters.chapterTo !== undefined) && chunks.length === 0) {
        return {
          question,
          answer: emptyResultMessage,
          citations: [],
          chunks: [],
          model: "rule-based:relationship",
        };
      }

      return {
        question,
        answer: fact.answer,
        citations: selectSupportingCitations(question, fact.answer, chunks, DISPLAY_CITATION_LIMIT),
        chunks,
        model: "rule-based:relationship",
      };
    }
  }

  const directEntityIntent = parseDirectEntityIntent(question);
  const resolvedDirectEntity = directEntityIntent
    ? await resolveEntityReferenceWithHydration(config, directEntityIntent.entity)
    : undefined;
  if (resolvedDirectEntity && directEntityIntent && resolvedDirectEntity.matchedKind !== "canonical") {
    const answer = buildResolvedEntityIdentityAnswer(resolvedDirectEntity);
    if (answer) {
      const chunks = await findChunksByExactMentionTerms(
        pool,
        [resolvedDirectEntity.matchedText],
        topK,
        filters,
      );
      if ((filters.chapterFrom !== undefined || filters.chapterTo !== undefined) && chunks.length === 0) {
        return {
          question,
          answer: emptyResultMessage,
          citations: [],
          chunks: [],
          model: "rule-based:entity-identity",
        };
      }

      return {
        question,
        answer,
        citations: uniqueCitationsInOrder(chunks).slice(0, DISPLAY_CITATION_LIMIT),
        chunks,
        model: "rule-based:entity-identity",
      };
    }
  }
  if (directEntityIntent && !resolvedDirectEntity) {
    return {
      question,
      answer: `Structured entity metadata for "${directEntityIntent.entity}" is not available locally, and the wiki source could not be refreshed.`,
      citations: [],
      chunks: [],
      model: "rule-based:entity-identity-refusal",
    };
  }
  const directEntityTerms = resolvedDirectEntity ? getEntityMentionTerms(resolvedDirectEntity) : [];
  const exactEntityQuestion = resolvedDirectEntity ? `Who is ${resolvedDirectEntity.canonicalName}?` : question;
  const promptQuestion =
    resolvedDirectEntity && directEntityIntent && resolvedDirectEntity.matchedKind !== "canonical"
      ? `Trusted metadata: "${directEntityIntent.entity}" is an alias or surface form of "${resolvedDirectEntity.canonicalName}". Who is ${resolvedDirectEntity.canonicalName}?`
      : exactEntityQuestion;

  const chunks = directEntityIntent
    ? directEntityTerms.length > 0
      ? await findChunksByExactMentionTerms(pool, directEntityTerms, topK, filters)
      : requireExactEntityMatches
        ? await findChunksByExactMention(pool, directEntityIntent.entity, topK, filters)
        : await searchChunks(config, exactEntityQuestion, topK, filters)
    : await searchChunks(config, question, topK, filters);
  const citations = uniqueCitations(chunks);

  if (chunks.length === 0) {
    return {
      question,
      answer: emptyResultMessage,
      citations: [],
      chunks,
      model: config.answer.model,
    };
  }

  if (citationsOnly) {
    return {
      question,
      answer: "Citations only mode; answer generation skipped.",
      citations,
      chunks,
      model: config.answer.model,
    };
  }

  const provider = createAnswerProvider(config);
  const prompt = buildAnswerPrompt(promptQuestion, chunks);
  const response = await provider.generate(prompt);
  const answer = response.text.trim() || "Not enough evidence found in the indexed corpus.";
  const supportingCitations = selectSupportingCitations(question, answer, chunks, DISPLAY_CITATION_LIMIT);

  return {
    question,
    answer,
    citations: supportingCitations.length > 0
      ? supportingCitations
      : uniqueCitations(chunks).slice(0, DISPLAY_CITATION_LIMIT),
    chunks,
    model: response.model,
  };
}

function uniqueCitations(chunks: AskResult["chunks"]): Citation[] {
  const seen = new Map<number, Citation>();

  for (const chunk of chunks) {
    if (!seen.has(chunk.chapterNumber)) {
      seen.set(chunk.chapterNumber, {
        chapterNumber: chunk.chapterNumber,
        title: chunk.chapterTitle,
        sourceUrl: chunk.sourceUrl,
      });
    }
  }

  return [...seen.values()].sort((left, right) => left.chapterNumber - right.chapterNumber);
}

function selectSupportingCitations(
  question: string,
  answer: string,
  chunks: RetrievedChunk[],
  limit: number,
): Citation[] {
  const questionTerms = extractSupportTerms(question);
  const answerTerms = extractSupportTerms(answer);
  const quotedPhrases = extractQuotedPhrases(answer);

  const chapterScores = new Map<number, {
    citation: Citation;
    score: number;
    distance: number;
    chapterNumber: number;
    chunkIndex: number;
  }>();

  for (const chunk of chunks) {
    const score = scoreSupportingChunk(chunk, questionTerms, answerTerms, quotedPhrases);
    const current = chapterScores.get(chunk.chapterNumber);

    if (
      current
      && (
        current.score > score
        || (current.score === score && current.distance < chunk.distance)
        || (current.score === score && current.distance === chunk.distance && current.chunkIndex <= chunk.chunkIndex)
      )
    ) {
      continue;
    }

    chapterScores.set(chunk.chapterNumber, {
      citation: {
        chapterNumber: chunk.chapterNumber,
        title: chunk.chapterTitle,
        sourceUrl: chunk.sourceUrl,
      },
      score,
      distance: chunk.distance,
      chapterNumber: chunk.chapterNumber,
      chunkIndex: chunk.chunkIndex,
    });
  }

  return [...chapterScores.values()]
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.distance !== right.distance) {
        return left.distance - right.distance;
      }

      if (left.chapterNumber !== right.chapterNumber) {
        return left.chapterNumber - right.chapterNumber;
      }

      return left.chunkIndex - right.chunkIndex;
    })
    .slice(0, limit)
    .map((entry) => entry.citation);
}

function scoreSupportingChunk(
  chunk: RetrievedChunk,
  questionTerms: string[],
  answerTerms: string[],
  quotedPhrases: string[],
): number {
  const chunkTerms = extractSupportTerms(`${chunk.chapterTitle} ${chunk.chunkText}`);
  const chunkTermSet = new Set(chunkTerms);
  const normalizedChunk = normalizeSupportText(`${chunk.chapterTitle} ${chunk.chunkText}`);

  const answerMatches = countMatchingTerms(answerTerms, chunkTermSet);
  const questionMatches = countMatchingTerms(questionTerms, chunkTermSet);
  const quotedMatches = countMatchingPhrases(quotedPhrases, normalizedChunk);

  return (quotedMatches * 30) + (answerMatches * 5) + (questionMatches * 2);
}

function countMatchingTerms(terms: string[], chunkTerms: Set<string>): number {
  let matches = 0;

  for (const term of terms) {
    if (chunkTerms.has(term)) {
      matches += 1;
    }
  }

  return matches;
}

function countMatchingPhrases(phrases: string[], normalizedChunk: string): number {
  let matches = 0;

  for (const phrase of phrases) {
    if (phrase.length > 0 && normalizedChunk.includes(phrase)) {
      matches += 1;
    }
  }

  return matches;
}

function extractSupportTerms(text: string): string[] {
  const normalized = normalizeSupportText(text);
  if (normalized.length === 0) {
    return [];
  }

  const tokens = normalized.match(/[\p{L}\p{N}']+/gu) ?? [];
  const terms = new Set<string>();

  for (const token of tokens) {
    if (token.length < 3 || SUPPORT_STOPWORDS.has(token)) {
      continue;
    }

    terms.add(token);
  }

  return [...terms];
}

function extractQuotedPhrases(text: string): string[] {
  const phrases = new Set<string>();
  const matches = text.matchAll(/"([^"]+)"/g);

  for (const match of matches) {
    const phrase = normalizeSupportText(match[1] ?? "");
    if (phrase.length > 0) {
      phrases.add(phrase);
    }
  }

  return [...phrases];
}

function normalizeSupportText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SUPPORT_STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "because",
  "been",
  "before",
  "being",
  "both",
  "but",
  "can",
  "chapter",
  "does",
  "enough",
  "evidence",
  "final",
  "first",
  "from",
  "have",
  "her",
  "here",
  "him",
  "his",
  "into",
  "is",
  "later",
  "name",
  "named",
  "not",
  "of",
  "only",
  "or",
  "proper",
  "question",
  "referred",
  "simply",
  "son",
  "state",
  "states",
  "that",
  "the",
  "their",
  "there",
  "therefore",
  "they",
  "this",
  "temporarily",
  "what",
  "when",
  "while",
  "with",
]);

function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Map<number, Citation>();

  for (const citation of citations) {
    if (!seen.has(citation.chapterNumber)) {
      seen.set(citation.chapterNumber, citation);
    }
  }

  return [...seen.values()].sort((left, right) => left.chapterNumber - right.chapterNumber);
}

function uniqueCitationsInOrder(chunks: AskResult["chunks"]): Citation[] {
  const seen = new Set<number>();
  const citations: Citation[] = [];

  for (const chunk of chunks) {
    if (seen.has(chunk.chapterNumber)) {
      continue;
    }

    seen.add(chunk.chapterNumber);
    citations.push({
      chapterNumber: chunk.chapterNumber,
      title: chunk.chapterTitle,
      sourceUrl: chunk.sourceUrl,
    });
  }

  return citations;
}

function buildResolvedEntityLead(entity: {
  canonicalName: string;
  matchedText: string;
  matchedKind: string;
}): string {
  if (entity.matchedKind === "canonical") {
    return "";
  }

  return `"${entity.matchedText}" refers to ${entity.canonicalName}.`;
}

function buildResolvedEntityIdentityAnswer(entity: {
  canonicalName: string;
  matchedText: string;
  matchedKind: string;
}): string | undefined {
  if (entity.matchedKind === "wiki_true_name") {
    return `"${entity.matchedText}" is ${entity.canonicalName}'s True Name.`;
  }

  if (entity.matchedKind === "manual_alias" || entity.matchedKind === "wiki_alias") {
    return `"${entity.matchedText}" refers to ${entity.canonicalName}.`;
  }

  return undefined;
}

async function resolveEntityReferenceWithHydration(
  config: AppConfig,
  input: string,
): Promise<Awaited<ReturnType<typeof resolveEntityReference>>> {
  const resolved = await resolveEntityReference(config, input);
  if (resolved) {
    return resolved;
  }

  return hydrateEntityMetadataIfMissing(config, input);
}

function buildAliasEvidenceSummary(chunks: AliasEvidenceChunk[]): string {
  const top = chunks[0];
  if (!top) {
    return "";
  }

  if (top.hasLeftTerm && top.hasRightTerm && top.hasIdentityPhrase) {
    return `The clearest supporting evidence appears in Chapter ${top.chapterNumber}, "${top.chapterTitle}", where the text directly links both names.`;
  }

  if (top.hasLeftTerm && top.hasRightTerm) {
    return `The clearest supporting evidence appears in Chapter ${top.chapterNumber}, "${top.chapterTitle}", where both names appear together.`;
  }

  return `The clearest supporting evidence appears in Chapter ${top.chapterNumber}, "${top.chapterTitle}".`;
}

function selectAliasEquivalenceEvidence(
  candidates: AliasEvidenceChunk[],
  leftTerms: string[],
  rightTerms: string[],
  canonicalTerms: string[],
): AliasEvidenceChunk[] {
  const ranked = [...candidates]
    .sort((left, right) => {
      const leftScore = scoreCandidate(left, leftTerms, rightTerms, canonicalTerms);
      const rightScore = scoreCandidate(right, leftTerms, rightTerms, canonicalTerms);

      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }

      if (left.chapterNumber !== right.chapterNumber) {
        return left.chapterNumber - right.chapterNumber;
      }

      return left.chunkIndex - right.chunkIndex;
    });

  const selected: AliasEvidenceChunk[] = [];
  const addChunk = (chunk: AliasEvidenceChunk | undefined) => {
    if (!chunk || selected.some((candidate) => candidate.chunkId === chunk.chunkId)) {
      return;
    }

    selected.push(chunk);
  };

  addChunk(ranked.find((chunk) => chunk.hasLeftTerm && chunk.hasRightTerm && chunk.hasIdentityPhrase));
  addChunk(ranked.find((chunk) => chunk.hasLeftTerm && chunk.hasRightTerm));
  addChunk(ranked.find((chunk) => chunk.hasLeftTerm));
  addChunk(ranked.find((chunk) => chunk.hasRightTerm));

  for (const chunk of ranked) {
    if (selected.length >= 3) {
      break;
    }

    addChunk(chunk);
  }

  return selected.slice(0, 3);
}

function scoreCandidate(
  chunk: AliasEvidenceChunk,
  leftTerms: string[],
  rightTerms: string[],
  canonicalTerms: string[],
): number {
  return chunk.evidenceScore + scoreAliasEvidenceText(chunk.chunkText, leftTerms, rightTerms, canonicalTerms);
}
