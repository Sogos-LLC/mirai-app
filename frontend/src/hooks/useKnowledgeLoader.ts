'use client';

import { useMemo } from 'react';
import { useListKnowledgeSources, KnowledgeSourceStatus } from '@/hooks/useTeamKnowledge';
import { useListTeams } from '@/hooks/useTeams';
import type { WizardKnowledgeSource } from '@/machines/courseWizardMachine';

/**
 * useKnowledgeLoader aggregates team and global knowledge sources
 * into WizardKnowledgeSource format for the course wizard.
 *
 * Handles:
 * - Fetching global (tenant-level) knowledge sources
 * - Fetching team knowledge sources for up to 3 teams the user belongs to
 * - Deduplication of team sources across multiple teams
 * - Filtering to only READY status sources
 * - Converting to WizardKnowledgeSource format
 */
export function useKnowledgeLoader() {
  // Fetch global knowledge (no teamId = global/tenant-level knowledge)
  const { sources: globalKnowledgeSources, isLoading: globalKnowledgeLoading } = useListKnowledgeSources();

  // Fetch all teams the user is a member/lead of
  const { data: userTeams, isLoading: teamsLoading } = useListTeams();

  // Only extract team IDs after teams have finished loading.
  // Previously, accessing userTeams[0]?.id before teams loaded returned undefined.
  // The useListKnowledgeSources hook treated undefined teamId as "global query",
  // causing team knowledge to never be fetched.
  const team0Id = !teamsLoading ? userTeams[0]?.id : undefined;
  const team1Id = !teamsLoading ? userTeams[1]?.id : undefined;
  const team2Id = !teamsLoading ? userTeams[2]?.id : undefined;

  // Pass enabled option to prevent querying until teams are loaded
  const { sources: team0Sources, isLoading: team0Loading } = useListKnowledgeSources(team0Id, { enabled: !!team0Id });
  const { sources: team1Sources, isLoading: team1Loading } = useListKnowledgeSources(team1Id, { enabled: !!team1Id });
  const { sources: team2Sources, isLoading: team2Loading } = useListKnowledgeSources(team2Id, { enabled: !!team2Id });

  // Include teamsLoading to ensure we wait for teams before considering team knowledge "loaded"
  const isLoading = globalKnowledgeLoading || teamsLoading ||
    (!!team0Id && team0Loading) ||
    (!!team1Id && team1Loading) ||
    (!!team2Id && team2Loading);

  // Filter to only ready global sources
  const readyGlobalKnowledge = globalKnowledgeSources.filter(
    (source) => source.status === KnowledgeSourceStatus.READY
  );

  // Combine and deduplicate team sources, filter to ready
  const allTeamSources = useMemo(() => {
    const sources = [
      ...team0Sources,
      ...team1Sources,
      ...team2Sources,
    ];
    const seen = new Set<string>();
    return sources.filter((source) => {
      if (seen.has(source.id)) return false;
      seen.add(source.id);
      return source.status === KnowledgeSourceStatus.READY;
    });
  }, [team0Sources, team1Sources, team2Sources]);

  // Convert to wizard format
  const globalDocs: WizardKnowledgeSource[] = useMemo(
    () =>
      readyGlobalKnowledge.map((source) => ({
        id: source.id,
        name: source.name,
        tokenCount: source.tokenCount ?? 0,
        summary: source.summary ?? undefined,
        scope: 'global' as const,
      })),
    [readyGlobalKnowledge]
  );

  const teamDocs: WizardKnowledgeSource[] = useMemo(
    () =>
      allTeamSources.map((source) => ({
        id: source.id,
        name: source.name,
        tokenCount: source.tokenCount ?? 0,
        summary: source.summary ?? undefined,
        scope: 'team' as const,
      })),
    [allTeamSources]
  );

  return {
    teamDocs,
    globalDocs,
    isLoading,
  };
}
