// The three sorties. Each one is a different job, not the same loop with
// bigger numbers: rings to thread, crates to collect through a canyon, and
// a night storm rescue with a crosswind. Terrain, sky and hazards change
// with the mission so the frames look different from each other.

export const MISSIONS = [
  {
    id: 0,
    name: 'Valley Ring Run',
    short: 'RING RUN',
    brief:
      'Thread all 12 rings over Green Valley, then land on runway 09. ' +
      'Full throttle burns fuel fast — ease off on the straights.',
    goal: 'rings',
    goalCount: 12,
    skyTop: '#2f7fd0',
    skyMid: '#7ec3ee',
    skyLow: '#cfe9f7',
    sun: '#fff3b0',
    groundA: '#5da244',
    groundB: '#79b657',
    fieldA: '#e8c96a',
    fieldB: '#c98a4b',
    river: '#4f8fc9',
    mountain: '#4a6b8a',
    mountainFar: '#7fa3c4',
    runway: '#3a3f4a',
    night: false,
    storm: false,
    crosswind: 0,
    peaks: 0,
    balloons: 4,
    birds: 2,
    clouds: 10,
    fuelStart: 100,
  },
  {
    id: 1,
    name: 'Canyon Pass',
    short: 'CANYON',
    brief:
      'Six supply crates wait in Red Canyon. Peaks are solid — fly around ' +
      'them or over them, never through them. Collect every crate, then land.',
    goal: 'crates',
    goalCount: 6,
    skyTop: '#e8823c',
    skyMid: '#f2a45e',
    skyLow: '#f7cf9a',
    sun: '#ffe9a8',
    groundA: '#a85a33',
    groundB: '#c47a45',
    fieldA: '#8f4a2c',
    fieldB: '#b96a3a',
    river: '#c9a06a',
    mountain: '#6e3420',
    mountainFar: '#9c5a38',
    runway: '#3a3f4a',
    night: false,
    storm: false,
    crosswind: 0.04,
    peaks: 7,
    balloons: 3,
    birds: 3,
    clouds: 6,
    fuelStart: 92,
  },
  {
    id: 2,
    name: 'Storm Ridge Rescue',
    short: 'STORM',
    brief:
      'Night rescue over Storm Ridge: 8 rings in the lightning, crosswind ' +
      'pushes you sideways the whole way. Watch the fuel — there is no ' +
      'second chance out here.',
    goal: 'rings',
    goalCount: 8,
    skyTop: '#0b1026',
    skyMid: '#1b2547',
    skyLow: '#31406e',
    sun: '#dfe8ff',
    groundA: '#1d2b1f',
    groundB: '#27382a',
    fieldA: '#16241a',
    fieldB: '#2c3d2f',
    river: '#22355e',
    mountain: '#0e1420',
    mountainFar: '#232c44',
    runway: '#2c3140',
    night: true,
    storm: true,
    crosswind: 0.09,
    peaks: 5,
    balloons: 2,
    birds: 0,
    clouds: 14,
    fuelStart: 100,
  },
];

export function missionById(id) {
  return MISSIONS[Math.max(0, Math.min(MISSIONS.length - 1, id))];
}
