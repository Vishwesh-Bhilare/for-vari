import type { NodePoint } from '../types';

export function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Returns distance in meters
}

export interface MeetingMatchResult {
  node: NodePoint;
  requesterDistanceMeters: number;
  helperDistanceMeters: number;
  totalDistanceMeters: number;
}

/**
 * Smart P2P Matching Algorithm:
 * Computes the optimal Wari route station node for meeting between Requester and Helper.
 * Minimizes total travel distance (d_requester + d_helper).
 */
export function findOptimalMeetingNode(
  reqLat: number,
  reqLng: number,
  helpLat: number,
  helpLng: number,
  nodes: NodePoint[]
): MeetingMatchResult | null {
  if (!nodes || nodes.length === 0) return null;

  let bestNode: NodePoint = nodes[0];
  let minTotalDistance = Infinity;
  let bestReqDist = 0;
  let bestHelpDist = 0;

  for (const node of nodes) {
    const reqDist = calculateHaversineDistance(reqLat, reqLng, node.lat, node.lng);
    const helpDist = calculateHaversineDistance(helpLat, helpLng, node.lat, node.lng);
    const totalDist = reqDist + helpDist;

    if (totalDist < minTotalDistance) {
      minTotalDistance = totalDist;
      bestNode = node;
      bestReqDist = reqDist;
      bestHelpDist = helpDist;
    }
  }

  return {
    node: bestNode,
    requesterDistanceMeters: Math.round(bestReqDist),
    helperDistanceMeters: Math.round(bestHelpDist),
    totalDistanceMeters: Math.round(minTotalDistance)
  };
}
