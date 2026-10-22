import type { EmergencyContactType, Season } from '../types';

export interface SeedTask {
  seedKey: string;
  title: string;
  season: Season;
  /** Suggested due date (month 1–12, day), placed in the year starting with the current season. */
  month: number;
  day: number;
  description: string;
}

/** Essential US home maintenance, grouped by meteorological season. */
export const SEED_TASKS: readonly SeedTask[] = [
  // Fall (Sep–Nov)
  {
    seedKey: 'fall-hvac-service',
    title: 'Have the furnace serviced',
    season: 'Fall',
    month: 9,
    day: 30,
    description:
      'Book a tune-up before the first cold night and swap the HVAC filter. Ask the technician to check the heat exchanger and carbon monoxide levels.',
  },
  {
    seedKey: 'fall-winterize-spigots',
    title: 'Winterize outdoor spigots',
    season: 'Fall',
    month: 10,
    day: 15,
    description:
      'Disconnect and drain hoses. Close the indoor shutoff valve for each outdoor faucet, then open the outside tap to let the line drain. Add foam covers if you have them.',
  },
  {
    seedKey: 'fall-sprinkler-blowout',
    title: 'Shut down and drain the sprinkler system',
    season: 'Fall',
    month: 10,
    day: 25,
    description:
      'Turn off the irrigation water supply and have the lines blown out with compressed air before the ground freezes.',
  },
  {
    seedKey: 'fall-clear-gutters',
    title: 'Clear gutters and downspouts',
    season: 'Fall',
    month: 11,
    day: 1,
    description:
      'Remove leaves once most have fallen. Make sure downspouts carry water at least 4–6 feet away from the foundation.',
  },
  {
    seedKey: 'fall-smoke-co-test',
    title: 'Test smoke and CO alarms',
    season: 'Fall',
    month: 11,
    day: 2,
    description:
      'A good habit when the clocks change. Press the test button on every alarm and replace batteries as needed. Replace any alarm older than 10 years.',
  },
  {
    seedKey: 'fall-seal-drafts',
    title: 'Seal drafts around windows and doors',
    season: 'Fall',
    month: 11,
    day: 15,
    description: 'Check weatherstripping and re-caulk gaps. A lit incense stick near the frame will show you where air leaks in.',
  },

  // Winter (Dec–Feb)
  {
    seedKey: 'winter-test-main-shutoff',
    title: 'Find and test the main water shutoff',
    season: 'Winter',
    month: 12,
    day: 5,
    description:
      'Frozen pipes burst most often in winter. Locate the main shutoff, label it, and make sure it turns. Everyone in the house should know where it is.',
  },
  {
    seedKey: 'winter-fire-extinguishers',
    title: 'Check fire extinguishers',
    season: 'Winter',
    month: 12,
    day: 15,
    description:
      'Make sure the gauge is in the green, the pin is in place, and there is one on every floor and in the kitchen.',
  },
  {
    seedKey: 'winter-hvac-filter',
    title: 'Replace the HVAC filter',
    season: 'Winter',
    month: 1,
    day: 15,
    description: 'Heating season is the heaviest use of the system. Most 1-inch filters need changing every 1–3 months.',
  },
  {
    seedKey: 'winter-ice-dams',
    title: 'Watch for ice dams and attic moisture',
    season: 'Winter',
    month: 1,
    day: 25,
    description:
      'After a snow, look for thick ice along the roof edge and check the attic for frost or damp insulation, which point to poor ventilation.',
  },
  {
    seedKey: 'winter-flush-water-heater',
    title: 'Flush the water heater',
    season: 'Winter',
    month: 2,
    day: 10,
    description:
      'Drain a few gallons from the valve at the bottom of the tank to clear sediment. Check the manual first; tankless units need a descaling kit instead.',
  },

  // Spring (Mar–May)
  {
    seedKey: 'spring-smoke-co-test',
    title: 'Test smoke and CO alarms',
    season: 'Spring',
    month: 3,
    day: 9,
    description: 'Another check when the clocks change. Test every alarm and replace batteries as needed.',
  },
  {
    seedKey: 'spring-test-sump-pump',
    title: 'Test the sump pump',
    season: 'Spring',
    month: 3,
    day: 15,
    description:
      'Before spring rains, slowly pour a bucket of water into the pit. The pump should start on its own and empty it. Check the discharge line is clear.',
  },
  {
    seedKey: 'spring-check-roof',
    title: 'Check the roof for winter damage',
    season: 'Spring',
    month: 3,
    day: 25,
    description:
      'From the ground with binoculars, look for missing or curled shingles and damaged flashing around chimneys and vents. Call a roofer rather than climbing up.',
  },
  {
    seedKey: 'spring-dryer-vent',
    title: 'Clean the dryer vent duct',
    season: 'Spring',
    month: 4,
    day: 5,
    description: 'Lint build-up in the duct is a leading cause of dryer fires. Clean the full run to the outside flap, not just the lint trap.',
  },
  {
    seedKey: 'spring-test-ac',
    title: 'Test the AC before the first hot day',
    season: 'Spring',
    month: 4,
    day: 20,
    description:
      'Run the air conditioning for 15 minutes and feel for cold air at the vents. If it struggles, book service now, before the summer rush.',
  },
  {
    seedKey: 'spring-grading',
    title: 'Check drainage around the foundation',
    season: 'Spring',
    month: 5,
    day: 10,
    description: 'Soil should slope away from the house. Fill low spots where water pools after rain.',
  },

  // Summer (Jun–Aug)
  {
    seedKey: 'summer-storm-kit',
    title: 'Restock the storm and outage kit',
    season: 'Summer',
    month: 6,
    day: 1,
    description:
      'Hurricane season starts June 1. Check flashlights, batteries, a battery radio, first-aid kit, and at least 3 days of water (1 gallon per person per day).',
  },
  {
    seedKey: 'summer-ac-condenser',
    title: 'Clean the AC condenser',
    season: 'Summer',
    month: 6,
    day: 15,
    description:
      'Turn off power to the outdoor unit, rinse the fins gently with a hose, and keep 2 feet of clearance from plants and debris.',
  },
  {
    seedKey: 'summer-deck',
    title: 'Inspect the deck and railings',
    season: 'Summer',
    month: 7,
    day: 1,
    description: 'Look for loose boards, popped nails, wobbly railings and soft or rotting wood. Reseal wood decks every 2–3 years.',
  },
  {
    seedKey: 'summer-pests',
    title: 'Check for termites and pests',
    season: 'Summer',
    month: 7,
    day: 20,
    description: 'Look for mud tubes on the foundation, piles of discarded wings, and wood that sounds hollow when tapped.',
  },
  {
    seedKey: 'summer-fridge-coils',
    title: 'Vacuum the refrigerator coils',
    season: 'Summer',
    month: 8,
    day: 10,
    description: 'Dusty coils make the fridge work harder in hot weather. Unplug it, then vacuum the coils behind or under the unit.',
  },
];

export interface SeedContact {
  seedKey: string;
  type: EmergencyContactType;
  name: string;
  notes: string;
}

/** Blank ledger rows so the most important numbers have an obvious home. */
export const SEED_CONTACTS: readonly SeedContact[] = [
  { seedKey: 'gas-utility', type: 'gas_utility', name: 'Gas company (emergency line)', notes: 'Printed on your gas bill.' },
  { seedKey: 'electric-utility', type: 'electric_utility', name: 'Electric company (outages)', notes: 'Printed on your electric bill.' },
  { seedKey: 'water-utility', type: 'water_utility', name: 'Water utility', notes: '' },
  { seedKey: 'plumber', type: 'plumber', name: 'Plumber', notes: 'Ask if they offer 24/7 emergency service.' },
  { seedKey: 'electrician', type: 'electrician', name: 'Electrician', notes: '' },
  { seedKey: 'insurance', type: 'insurance', name: 'Home insurance claims', notes: 'Policy number:' },
];
