import type { EmergencyContactType } from '../types';

export type Urgency = 'life-safety' | 'urgent' | 'act-now';

export interface TriageStep {
  title: string;
  detail?: string;
}

export interface TriageQuestion {
  kind: 'question';
  id: string;
  prompt: string;
  help?: string;
  options: { label: string; next: string }[];
}

export interface TriageGuide {
  kind: 'guide';
  id: string;
  title: string;
  urgency: Urgency;
  /** Shown above the steps in the loudest style. */
  callout?: string;
  steps: TriageStep[];
  /** Contact types to surface next to this guide, in order. */
  contacts: EmergencyContactType[];
}

export type TriageNode = TriageQuestion | TriageGuide;

export interface Disaster {
  id: 'water' | 'gas' | 'power' | 'storm';
  title: string;
  summary: string;
  root: string;
}

export const DISASTERS: readonly Disaster[] = [
  { id: 'water', title: 'Burst pipe or water leak', summary: 'Water coming from a pipe, appliance or ceiling', root: 'water-start' },
  { id: 'gas', title: 'Gas leak', summary: 'Rotten-egg smell, hissing, or a CO alarm', root: 'gas-start' },
  { id: 'power', title: 'Power outage', summary: 'Lights out in part or all of the house', root: 'power-start' },
  { id: 'storm', title: 'Storm damage', summary: 'Wind, hail, fallen tree or flooding', root: 'storm-start' },
];

const SHUT_OFF_WATER: TriageStep[] = [
  {
    title: 'Find the main water shutoff valve',
    detail:
      'It is usually where the water line enters the house: a basement or crawl-space wall facing the street, the garage, a utility closet, or next to the water heater. In warm states it may be outside or in a box near the curb.',
  },
  {
    title: 'Turn it clockwise until it stops',
    detail:
      'Round wheel handle: turn right (clockwise) as far as it goes. Lever handle: turn it a quarter-turn so it sits across the pipe. If it is stuck, the water utility can shut it off at the meter.',
  },
  {
    title: 'Open the lowest faucet in the house',
    detail: 'Open an upstairs tap too. This drains the water still in the pipes and takes pressure off the leak.',
  },
  {
    title: 'Turn off the water heater',
    detail: 'Gas: set the dial to "Pilot" or "Vacation." Electric: switch off its breaker. This keeps it from heating an empty tank.',
  },
  {
    title: 'Photograph the damage, then start drying',
    detail:
      'Take photos and video for insurance before you clean up. Move valuables, mop up, and run fans or a dehumidifier. Mold can start growing in 24–48 hours.',
  },
  { title: 'Call a plumber, then your insurer', detail: 'Keep receipts for anything you buy to limit the damage.' },
];

export const TRIAGE: Record<string, TriageNode> = {
  'water-start': {
    kind: 'question',
    id: 'water-start',
    prompt: 'Is water near outlets, appliances, or the electrical panel?',
    help: 'Water and electricity together can kill. Answer this first.',
    options: [
      { label: 'Yes, or I am not sure', next: 'water-electrical' },
      { label: 'No, it is away from anything electrical', next: 'water-shutoff' },
    ],
  },
  'water-electrical': {
    kind: 'guide',
    id: 'water-electrical',
    title: 'Water near electricity',
    urgency: 'life-safety',
    callout: 'Do not walk through standing water that could be touching outlets, cords or appliances.',
    steps: [
      {
        title: 'Shut off power only if you can reach the panel on dry ground',
        detail: 'Flip the main breaker to OFF. If the panel is wet or you would have to stand in water, stay out and call the electric utility.',
      },
      ...SHUT_OFF_WATER,
    ],
    contacts: ['electric_utility', 'plumber', 'electrician', 'insurance'],
  },
  'water-shutoff': {
    kind: 'guide',
    id: 'water-shutoff',
    title: 'Stop the water',
    urgency: 'urgent',
    steps: SHUT_OFF_WATER,
    contacts: ['plumber', 'water_utility', 'restoration', 'insurance'],
  },

  'gas-start': {
    kind: 'question',
    id: 'gas-start',
    prompt: 'What is happening?',
    options: [
      { label: 'I smell rotten eggs or hear hissing', next: 'gas-leak' },
      { label: 'A carbon monoxide (CO) alarm is going off', next: 'gas-co' },
    ],
  },
  'gas-leak': {
    kind: 'guide',
    id: 'gas-leak',
    title: 'Get out, then call',
    urgency: 'life-safety',
    callout: 'Leave now. Do not look for the leak.',
    steps: [
      {
        title: 'Do not create a spark',
        detail: 'Do not switch lights or appliances on or off, use the doorbell, light a match, or start a car in the garage.',
      },
      { title: 'Get everyone out, including pets', detail: 'Leave the door open behind you if you can.' },
      {
        title: 'Call from a safe distance',
        detail: 'Once you are well away from the house, call 911 and your gas company emergency line. Do not use your phone inside.',
      },
      {
        title: 'Leave the meter to the professionals',
        detail: 'Do not try to shut off gas at the meter unless the gas company tells you to.',
      },
      { title: 'Wait for the all-clear', detail: 'Only go back in when the gas company or fire department says it is safe. They will relight pilot lights.' },
    ],
    contacts: ['gas_utility', 'hvac', 'insurance'],
  },
  'gas-co': {
    kind: 'guide',
    id: 'gas-co',
    title: 'Carbon monoxide alarm',
    urgency: 'life-safety',
    callout: 'CO has no smell. Treat every alarm as real.',
    steps: [
      { title: 'Get everyone outside into fresh air now', detail: 'Do not stop to open windows.' },
      {
        title: 'Call 911',
        detail: 'Tell them a CO alarm is sounding and whether anyone has a headache, dizziness, nausea or confusion.',
      },
      { title: 'Stay out until responders say it is safe' },
      {
        title: 'Have fuel-burning appliances inspected',
        detail: 'Furnace, water heater, stove, fireplace and generator are the usual sources. Do not use them until checked.',
      },
    ],
    contacts: ['gas_utility', 'hvac'],
  },

  'power-start': {
    kind: 'question',
    id: 'power-start',
    prompt: 'Which best describes it?',
    options: [
      { label: 'A power line is down outside', next: 'power-line' },
      { label: 'Someone relies on powered medical equipment', next: 'power-medical' },
      { label: 'The power is just out', next: 'power-outage' },
    ],
  },
  'power-line': {
    kind: 'guide',
    id: 'power-line',
    title: 'Downed power line',
    urgency: 'life-safety',
    callout: 'Assume every downed line is live. Stay at least 35 feet away.',
    steps: [
      { title: 'Keep everyone and pets far away', detail: 'Do not touch anything the line is touching, including fences, cars, or puddles.' },
      { title: 'Call 911, then your electric company' },
      {
        title: 'If a line falls on your car, stay inside',
        detail: 'Only leave if the car is on fire. Then jump clear with both feet together and shuffle away without lifting your feet.',
      },
    ],
    contacts: ['electric_utility'],
  },
  'power-medical': {
    kind: 'guide',
    id: 'power-medical',
    title: 'Medical equipment without power',
    urgency: 'urgent',
    callout: 'If anyone is in danger right now, call 911.',
    steps: [
      { title: 'Switch to backup batteries or oxygen tanks' },
      {
        title: 'Tell your electric company someone depends on power',
        detail: 'Most US utilities have a medical priority or "medical baseline" program. Ask to be enrolled for future outages.',
      },
      { title: 'Plan where to go if power stays off', detail: 'A hospital, fire station, or a friend with power. Many cities open warming or cooling centers.' },
    ],
    contacts: ['electric_utility', 'neighbor'],
  },
  'power-outage': {
    kind: 'guide',
    id: 'power-outage',
    title: 'Power outage',
    urgency: 'act-now',
    steps: [
      {
        title: 'Check whether it is just your home',
        detail: 'Look at the breaker panel for a tripped switch and check if neighbors have lights. Your utility\u2019s outage map will show known outages.',
      },
      { title: 'Report the outage to your electric company' },
      {
        title: 'Unplug electronics and leave one light switched on',
        detail: 'This protects them from a surge when power returns, and the light tells you when it is back.',
      },
      {
        title: 'Keep the fridge and freezer closed',
        detail: 'A closed fridge stays cold for about 4 hours. A full freezer holds for about 48 hours (24 if half full).',
      },
      {
        title: 'Run generators outside only',
        detail: 'At least 20 feet from the house, away from windows and doors. Never in a garage, basement or porch: CO can kill in minutes.',
      },
      { title: 'When in doubt, throw it out', detail: 'Discard perishable food that has been above 40°F for more than 2 hours.' },
    ],
    contacts: ['electric_utility', 'electrician'],
  },

  'storm-start': {
    kind: 'question',
    id: 'storm-start',
    prompt: 'Is anyone hurt, or does the house look unsafe?',
    help: 'Unsafe means a sagging roof or ceiling, large new cracks, a gas smell, or floodwater inside.',
    options: [
      { label: 'Yes, or I am not sure', next: 'storm-unsafe' },
      { label: 'No, everyone is OK and the house is standing', next: 'storm-damage' },
    ],
  },
  'storm-unsafe': {
    kind: 'guide',
    id: 'storm-unsafe',
    title: 'Get to safety',
    urgency: 'life-safety',
    callout: 'Call 911 for injuries, fire, gas smell or anyone trapped.',
    steps: [
      { title: 'Get everyone out of the damaged area' },
      { title: 'If you smell gas, follow the Gas leak guide', detail: 'Leave first, then call the gas company from outside.' },
      {
        title: 'Stay out of floodwater',
        detail: 'It can be electrified or hide debris. Six inches of moving water can knock you down.',
      },
      { title: 'Do not go back in until it has been checked', detail: 'The fire department or a structural engineer can tell you when it is safe.' },
      { title: 'Call your insurer to open a claim', detail: 'Ask about coverage for temporary housing.' },
    ],
    contacts: ['insurance', 'gas_utility', 'electric_utility', 'neighbor'],
  },
  'storm-damage': {
    kind: 'guide',
    id: 'storm-damage',
    title: 'After the storm',
    urgency: 'act-now',
    steps: [
      { title: 'Wait until the storm has fully passed', detail: 'Watch for downed lines and hanging branches before you go outside.' },
      {
        title: 'Photograph everything before cleaning up',
        detail: 'Wide shots and close-ups of the roof, siding, windows, fences and inside rooms. Note the date and time.',
      },
      {
        title: 'Prevent more damage',
        detail: 'Tarp roof holes, board broken windows, and shut off water to broken pipes. Insurers expect reasonable temporary repairs. Keep receipts.',
      },
      { title: 'Call your insurer to start a claim' },
      {
        title: 'Hire carefully',
        detail: 'Get written estimates from licensed, local contractors. Be wary of door-to-door "storm chasers" asking for cash up front.',
      },
    ],
    contacts: ['insurance', 'roofer', 'restoration', 'electrician'],
  },
};
