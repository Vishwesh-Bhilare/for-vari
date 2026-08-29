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

export interface MeetingPointLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: 'station' | 'midpoint';
  requesterDistanceMeters: number;
  helperDistanceMeters: number;
}

/**
 * Intelligent Spatial Engine:
 * Computes optimal meeting spot between Pilgrim A (Requester) and Pilgrim B (Helper).
 * 
 * Logic:
 * 1. Computes geographic centroid (midpoint) between both pilgrims' live positions.
 * 2. Checks if a formal Wari Route Station Node is close to the midpoint (< 2.5km).
 * 3. If a station node is nearby, uses the station node (e.g. "Saswad Station").
 * 4. Otherwise, generates an exact Midpoint Trail Checkpoint (e.g. "Midpoint Trail Spot (between Dehu & Pune Halt)").
 */
export function findOptimalMeetingNode(
  reqLat: number,
  reqLng: number,
  helpLat: number,
  helpLng: number,
  nodes: NodePoint[]
): MeetingPointLocation {
  const midLat = (reqLat + helpLat) / 2;
  const midLng = (reqLng + helpLng) / 2;

  let nearestStation: NodePoint | null = null;
  let minStationDistToMid = Infinity;

  if (nodes && nodes.length > 0) {
    for (const node of nodes) {
      const distToMid = calculateHaversineDistance(midLat, midLng, node.lat, node.lng);
      if (distToMid < minStationDistToMid) {
        minStationDistToMid = distToMid;
        nearestStation = node;
      }
    }
  }

  // If a formal route station is close to the midpoint (< 2.5km), pick the station node
  if (nearestStation && minStationDistToMid <= 2500) {
    const reqDist = calculateHaversineDistance(reqLat, reqLng, nearestStation.lat, nearestStation.lng);
    const helpDist = calculateHaversineDistance(helpLat, helpLng, nearestStation.lat, nearestStation.lng);

    return {
      id: nearestStation.id,
      name: nearestStation.name,
      lat: nearestStation.lat,
      lng: nearestStation.lng,
      type: 'station',
      requesterDistanceMeters: Math.round(reqDist),
      helperDistanceMeters: Math.round(helpDist)
    };
  }

  // Otherwise, use the exact geographic midpoint checkpoint between both pilgrims
  // Find closest two stations to give descriptive name (e.g. "Midpoint Trail Checkpoint")
  let s1Name = 'Start Station';
  let s2Name = 'End Station';

  if (nodes && nodes.length >= 2) {
    const sortedNodes = [...nodes].sort((a, b) => {
      const dA = calculateHaversineDistance(midLat, midLng, a.lat, a.lng);
      const dB = calculateHaversineDistance(midLat, midLng, b.lat, b.lng);
      return dA - dB;
    });
    s1Name = sortedNodes[0].name;
    s2Name = sortedNodes[1].name;
  }

  const reqDistMid = calculateHaversineDistance(reqLat, reqLng, midLat, midLng);
  const helpDistMid = calculateHaversineDistance(helpLat, helpLng, midLat, midLng);

  return {
    id: `midpoint-${Date.now()}`,
    name: `🤝 Trail Midpoint Checkpoint (${s1Name} - ${s2Name} Trail)`,
    lat: midLat,
    lng: midLng,
    type: 'midpoint',
    requesterDistanceMeters: Math.round(reqDistMid),
    helperDistanceMeters: Math.round(helpDistMid)
  };
}
