// Hollow Creek — game data tables
'use strict';

// Tile ids
HC.T = { GRASS: 0, TALL: 1, DIRT: 2, GRAVEL: 3, ROAD: 4, MULCH: 5, SOD: 6, PAVER: 7, BED: 8, MOWED: 9 };

// Tree species. Heights and crowns are in tiles; times in seconds of work.
HC.TREES = {
  pine:  { name: 'White Pine', height: 6.5, crown: 1.15, trunk: 7, cut: 5, buck: 3,   grind: 4, logs: 3, logValue: 35, pay: 150, spread: 6,  color: '#2f6b45' },
  oak:   { name: 'Red Oak',    height: 5.6, crown: 1.75, trunk: 9, cut: 9, buck: 5,   grind: 7, logs: 4, logValue: 65, pay: 230, spread: 8,  color: '#3f7d2c' },
  maple: { name: 'Sugar Maple',height: 5.2, crown: 1.45, trunk: 8, cut: 7, buck: 4,   grind: 6, logs: 3, logValue: 50, pay: 190, spread: 8,  color: '#5c9b2f' },
  dead:  { name: 'Dead Ash (hazard)', height: 4.8, crown: 1.0, trunk: 7, cut: 3, buck: 2, grind: 4, logs: 2, logValue: 8, pay: 210, spread: 28, color: '#8a7558', hazard: true },
};

// Game version: co-op players must match (bump whenever the game changes)
HC.VERSION = '2026.11.21-7';
HC.MAP_VER = 4; // bump whenever the world layout changes (saves then park everything back at the yard)

// Equipment. key = number key. fuel in units, use per second.
HC.EQUIP = {
  saw: {
    name: 'Chainsaw Crew', short: 'Saw', key: 1, move: 'walk', speed: 85, r: 8,
    fuelCap: 40, fuelUse: 0.5, wear: 0.05, price: 0, start: true,
    help: 'Get close to a tree, aim with the mouse, hold left click to fell. Hold click on a downed tree to buck it into logs.',
  },
  skid: {
    name: 'Skid Steer', short: 'Skid', key: 2, move: 'tank', speed: 125, turn: 2.6, r: 14,
    fuelCap: 100, fuelUse: 0.32, wear: 0.03, price: 0, start: true,
    help: 'W/S drive, A/D turn. E grabs logs, brush and rocks with the grapple. E near the trailer loads it.',
  },
};

HC.FUEL_PRICE = 0.8;      // $ per unit (halved)
HC.DUMP_FEE = 12;          // $ per trailer unit of brush/rock
HC.TRAILER_CAP = 12;       // trailer units
HC.HAUL_MINUTES = 40;
HC.LOAD = { log: 2, brush: 1, rock: 3 };

HC.PENALTY = {
  house:   { label: 'Tree hit the house',        cost: 900,  q: 30 },
  fence:   { label: 'Fence damaged',             cost: 70,   q: 4 },
  wire:    { label: 'Power line down',           cost: 1400, q: 35 },
  tree:    { label: 'Damaged a keeper tree',     cost: 200,  q: 8 },
  wrong:   { label: 'Cut an unmarked tree',      cost: 300,  q: 15 },
  injury:  { label: 'Crew member hit by tree',   cost: 600,  q: 30 },
};

HC.CLIENTS = ['Delia Marsh', 'Hank Purvis', 'The Okafor Family', 'Pastor Jim', 'Ruth Abernathy', 'Cody & Mae Lyle',
  'Creekside Church', 'Bev Tolliver', 'Marcus Webb', 'Old Mill Apartments', 'Sheriff Dunn', 'Linda Faye Cobb',
  'Hollow Creek School', 'Amos Kettle', 'Rosalind Pike', 'The Haddix Farm'];
HC.ROADS = ['Hollow Creek Rd', 'Persimmon Ln', 'Old Quarry Rd', 'Tanyard Hill', 'Mill Branch Rd', 'Cedar Knob Way', 'Fox Run', 'Sawmill Ct'];

// Job types
HC.JOBS = {
  tree_removal: {
    name: 'Tree Removal', color: '#e0702c', needs: ['saw', 'skid'],
    blurb: 'Fell the flagged trees, buck them, and clear every log and brush pile off the lot.',
  },
};

// Rating tiers unlock bigger lots
HC.TIERS = [
  { name: 'Small residential', minRating: 0,   minJobs: 0, size: 1.0, payMul: 1.0 },
  { name: 'Estate lots',       minRating: 3.6, minJobs: 3, size: 1.25, payMul: 1.5 },
  { name: 'Commercial',        minRating: 4.2, minJobs: 7, size: 1.5, payMul: 2.2 },
];

// ================= Step 3 additions =================
HC.TREES.sapling = { name: 'Sapling / scrub', height: 2.2, crown: 0.6, trunk: 4, cut: 1, buck: 0.8, grind: 1.5, logs: 0, logValue: 0, pay: 20, spread: 15, color: '#7fb54a' };

Object.assign(HC.EQUIP, {
  grinder: {
    name: 'Stump Grinder', short: 'Grinder', key: 3, move: 'tank', speed: 62, turn: 2.2, r: 12,
    fuelCap: 60, fuelUse: 0.25, work: 0.5, wear: 0.05, price: 2200, repair: 7,
    help: 'Drive the cutting wheel over a stump and hold left click to grind it below grade.',
  },
  chipper: {
    name: 'Wood Chipper', short: 'Chipper', key: 4, move: 'tank', speed: 45, turn: 1.8, r: 15,
    fuelCap: 50, fuelUse: 0.15, work: 0.4, wear: 0.04, price: 1800, repair: 6,
    help: 'Hold left click to hand-feed brush within reach. The skid steer can also drop brush into it. Chipped brush costs nothing to dump.',
  },
  truck: {
    name: 'Truck & Dump Trailer', short: 'Truck', key: 5, move: 'car', speed: 150, turn: 2.2, r: 16,
    fuelCap: 120, fuelUse: 0.3, wear: 0.02, price: 0, start: true, repair: 8,
    help: 'Drive the trailer close to the work. Pull onto the road and press E to haul the load to the yard.',
  },
  mower: {
    name: 'Zero-Turn Mower', short: 'Mower', key: 6, move: 'tank', speed: 115, turn: 3.2, r: 12,
    fuelCap: 40, fuelUse: 0.18, wear: 0.03, price: 1200, repair: 4,
    help: 'Drive over tall grass to cut it. Steer clear of rocks.',
  },
  land: {
    name: 'Landscaping Crew', short: 'Landscape', key: 7, move: 'walk', speed: 80, r: 8,
    fuelCap: 0, fuelUse: 0, wear: 0.0, price: 1500, repair: 2,
    help: 'Q changes tool (sod, shrubs, pavers, bed mulch). Click a marked tile within reach to install it.',
  },
  mulcher: {
    name: 'Forestry Mulcher Head', short: 'Mulcher', noUnit: true, price: 3500,
    help: 'Attachment for the skid steer. Press Q in the skid steer to swap between grapple and mulcher.',
  },
});
HC.EQUIP.saw.repair = 3;
HC.EQUIP.skid.repair = 9;
HC.EQUIP.skid.help = 'W/S drive, A/D turn. E grabs logs, brush and rocks. E near the trailer or chipper unloads. Q swaps to the mulcher head if you own it.';

HC.UPGRADES = {
  engine:  { name: 'Engine tune', desc: 'All machines drive 12% faster per level.', stat: 'drive', per: 1.12, prices: [600, 1200, 2000] },
  grapple: { name: 'Wider grapple', desc: 'Carry one more log or pile per trip.', prices: [700, 1500] },
  trailer: { name: 'Bigger dump trailer', desc: '+6 trailer capacity per level.', prices: [900, 1800] },
  tanks:   { name: 'Auxiliary fuel tanks', desc: '+25% fuel capacity per level.', stat: 'tank', per: 1.25, prices: [400, 800] },
  teeth:   { name: 'Carbide grinder teeth', desc: 'Grind stumps 30% faster per level.', stat: 'grind', per: 1.3, prices: [500, 1100], needs: 'grinder' },
  rotor:   { name: 'Heavy mulcher rotor', desc: 'Mulch 30% faster per level.', stat: 'mulch', per: 1.3, prices: [800, 1600], needs: 'mulcher' },
};

HC.CREW = {
  climber:  { name: 'Rosa Vance', role: 'Climber', hire: 500, wage: 140, desc: 'Halves felling spread and cuts 15% faster.' },
  ground:   { name: 'Deke Harlan', role: 'Groundsman', hire: 350, wage: 110, desc: 'Bucks 60% faster and feeds the chipper twice as fast.' },
  operator: { name: 'Lou Brannon', role: 'Operator', hire: 450, wage: 130, desc: 'Machines run 15% faster on 15% less fuel.' },
};

HC.WEATHER = [
  { id: 'sunny', name: 'Sunny', p: 0.4, wind: 0, wet: false, dark: 0, note: 'Good day for it.' },
  { id: 'overcast', name: 'Overcast', p: 0.22, wind: 2, wet: false, dark: 0.12, note: 'Gray but dry.' },
  { id: 'windy', name: 'Windy', p: 0.16, wind: 10, wet: false, dark: 0.05, note: 'Felling spread is 10° wider. Watch the cone.' },
  { id: 'rain', name: 'Rain', p: 0.16, wind: 3, wet: true, dark: 0.2, note: 'Machines run slower in the mud.' },
  { id: 'storm', name: 'Thunderstorms', p: 0.06, wind: 16, wet: true, dark: 0.32, note: 'Wet ground and gusts. Consider the small jobs.' },
];

Object.assign(HC.JOBS, {
  lot_clearing: { name: 'Lot Clearing', color: '#b8892b', needs: ['saw', 'skid'],
    blurb: 'Take down every tree inside the taped line and haul out the wood, brush and rocks.' },
  stump_grinding: { name: 'Stump Grinding', color: '#8b5a3c', needs: ['grinder'],
    blurb: 'Grind every stump on the property below grade.' },
  mulching: { name: 'Forestry Mulching', color: '#5f7d2a', needs: ['skid', 'mulcher'],
    blurb: 'Mulch the brush and scrub saplings inside the line. Leave the big trees standing.' },
  sod_planting: { name: 'Sod & Planting', color: '#3e9c4f', needs: ['land', 'mower'],
    blurb: 'Mow the lawn, lay sod on the bare patch and plant the new beds.' },
  hardscape: { name: 'Hardscape Patio', color: '#7a6f9b', needs: ['land', 'skid'],
    blurb: 'Pull the rocks out of the patio area and lay the pavers.' },
});

// What customers say when they call. {n} = quantity.
HC.REQUESTS = {
  tree_removal: ['A storm cracked a few trees over the house. Can you take the {n} flagged ones before the next one?',
    'We tied pink ribbon on the {n} trees that have to go. Please don\'t touch the others.',
    'The power company says those trees are too close to the lines. {n} of them.'],
  lot_clearing: ['We bought the lot to build on. Everything inside the stakes has to go.',
    'Clearing for a pole barn. Take it down to dirt inside the tape.'],
  stump_grinding: ['The last outfit left {n} stumps and I keep hitting them with the mower.',
    '{n} old stumps. Want it smooth enough to seed.'],
  mulching: ['The back acre is a wall of briars. Mulch it, but leave my oaks.',
    'Can\'t even walk the fence line anymore. Chew up the scrub please.'],
  sod_planting: ['Daughter\'s wedding is in the yard next month. Needs to look like a magazine.',
    'New house, dirt yard. Sod, shrubs and a mowed lawn please.'],
  hardscape: ['Want a paver patio off the back porch. There are rocks in the way.',
    'Fire pit patio. I marked it with spray paint.'],
};

// ================= Logistics update: trailers, yards, second truck =================
HC.T.WATER = 10;
Object.assign(HC.EQUIP.chipper, {
  move: 'tow', speed: 0, r: 16,
  help: 'A tow-behind disc chipper. Hitch it to a truck (R) to move it. With a crew member standing by, hold left click to feed brush into the infeed.',
});
Object.assign(HC.EQUIP.truck, {
  name: 'Crew Truck', short: 'Truck',
  help: 'Crew-cab dually. R hitches or drops a trailer. Crews press E beside it to ride along. E at the sawmill sells logs from the dump trailer; E at the county brush dump unloads the rest.',
});
HC.EQUIP.truck2 = {
  name: 'Second Truck', short: 'Truck 2', key: 8, move: 'car', speed: 150, turn: 2.2, r: 16,
  fuelCap: 120, fuelUse: 0.3, wear: 0.02, price: 9000, repair: 8, color: '#2f6fb0',
  help: 'Run two trailers at once: one truck hauls machines while the other runs debris.',
};
HC.EQUIP.dually = {
  name: 'Lifted Dually Pickup', short: 'Dually', key: 8, move: 'car', speed: 160, turn: 2.1, r: 16,
  fuelCap: 140, fuelUse: 0.32, wear: 0.02, price: 14000, repair: 9,
  help: 'Lifted 1-ton extended-cab dually on 35" mud tires and polished wheels. Tows any trailer except the lowboy (R), and crews ride along (E).',
};
HC.EQUIP.grinder.help = 'Tracked stump grinder. Load it on the equipment trailer. Hold left click with the wheel over a stump.';
HC.EQUIP.mower.help = 'Zero-turn mower. Load it on the equipment trailer. Drive over tall grass to cut it.';

// Trailers: len = axle centre to coupler, r = collision radius
HC.TRAILERS = {
  dump:  { name: 'Dump trailer', len: 40, r: 18, solid: true },
  equip: { name: 'Equipment trailer', len: 50, r: 18, slots: [16, -18] },
  chipper: { name: 'Chipper', len: 36, r: 16, solid: true },
};
HC.YARDS = {
  hq: { name: 'Home Yard', price: 0 },
  ridge: { name: 'Ridge Yard', price: 6500 },
};

// ================= Big iron: heavy machines, more trucks, more trailers =================
Object.assign(HC.EQUIP, {
  excavator: {
    name: 'Excavator (thumb)', short: 'Excavator', move: 'tank', speed: 55, turn: 1.6, r: 22, heavy: true,
    fuelCap: 160, fuelUse: 0.5, work: 0.7, wear: 0.03, price: 18000, repair: 14,
    help: 'Long reach. E grabs up to three logs, rocks or brush piles and drops them in a dump trailer, dump truck or log truck. Hold left click on a stump to rip it out whole. Needs the lowboy and semi to move between jobs.',
  },
  fmulcher: {
    name: 'Forestry Mulcher (tracked)', short: 'Mulcher', move: 'tank', speed: 72, turn: 2.0, r: 22, heavy: true,
    fuelCap: 180, fuelUse: 0.6, work: 1.1, wear: 0.04, price: 26000, repair: 16,
    help: 'A dedicated 300 hp mulching tractor. Hold left click to run the drum. Clears brush and saplings about twice as fast as the skid steer head, in a wider swath. Rides on the lowboy.',
  },
  chipper2: {
    name: '18" Whole-Tree Chipper', short: 'Big chipper', move: 'tow', speed: 0, r: 20,
    fuelCap: 90, fuelUse: 0.2, work: 0.7, wear: 0.04, price: 9500, repair: 9,
    help: 'Feeds twice as fast as the small chipper and takes small logs too. Chips blow out the chute into the chip truck it is hitched to, a dump body under the chute, or a pile. Sell chips at the landscape supply.',
  },
  dumptruck: {
    name: 'Single-Axle Dump Truck', short: 'Dump truck', move: 'car', speed: 135, turn: 2.0, r: 18,
    fuelCap: 160, fuelUse: 0.4, wear: 0.02, price: 14000, repair: 10, bed: 18,
    help: 'Has its own 18-unit dump bed (load it like a trailer) and can still tow a trailer. E at the county brush dump (or the sawmill, for logs) unloads it.',
  },
  logtruck: {
    name: 'Knuckleboom Log Truck', short: 'Log truck', move: 'car', speed: 125, turn: 1.8, r: 20, bed: 30, logsOnly: true,
    fuelCap: 200, fuelUse: 0.5, wear: 0.02, price: 22000, repair: 12,
    help: 'Loads itself: park beside logs and press E to swing them aboard with the crane (30 units, logs only). Sells the whole load at the sawmill.',
  },
  bucket: {
    name: 'Bucket Truck (60 ft)', short: 'Bucket', move: 'car', speed: 130, turn: 2.0, r: 18,
    fuelCap: 140, fuelUse: 0.35, wear: 0.02, price: 15000, repair: 11,
    help: 'Park it beside a tree and the climber in the bucket rigs it down: felling spread drops by 75% and hazard trees can\'t let go early. Crews can ride in it.',
  },
  semi: {
    name: 'Semi Tractor', short: 'Semi', move: 'car', speed: 120, turn: 1.5, r: 20,
    fuelCap: 260, fuelUse: 0.6, wear: 0.02, price: 20000, repair: 12,
    help: 'The only rig that can pull the lowboy. Pulls any other trailer too.',
  },
});
HC.TRAILERS.equip.slots = [16, -18];
HC.TRAILERS.lowboy = { name: 'Lowboy', len: 74, r: 22, slots: [22, -30], heavy: true, deck: [-62, 50, 22], price: 7000 };
HC.TRAILERS.equip.deck = [-36, 32, 16];
HC.TRAILERS.dump2 = { name: 'Dump trailer #2', len: 40, r: 18, solid: true, price: 2400, kindOf: 'dump' };
HC.TRAILERS.chipper2 = { name: 'Big chipper', len: 44, r: 20, solid: true };
HC.TRAILERS.bed = { name: 'Dump bed', len: 0, r: 0 };
HC.TRAILERS.logbed = { name: 'Log bunks', len: 0, r: 0 };
HC.LOAD.stump = 3;

for (const k of ['truck', 'truck2', 'dually', 'dumptruck', 'semi']) HC.EQUIP[k].tows = true;
HC.EQUIP.dumptruck.hitchOff = 52; HC.EQUIP.semi.hitchOff = 30;

// You: one operator who climbs into whichever machine you drive (F gets out / in on foot)
HC.EQUIP.op = { name: 'You (on foot)', short: 'You', move: 'walk', speed: 95, r: 8, fuelCap: 0, fuelUse: 0, wear: 0, price: 0, start: true, hidden: true,
  help: 'Walk up to a machine and press F to climb in.' };
HC.DRIVEN = (k) => HC.EQUIP[k] && (HC.EQUIP[k].move === 'tank' || HC.EQUIP[k].move === 'car');

// ---- real-world sizes (32 px = 3 m): coupler distance from the axle, deck extents, strap points ----
Object.assign(HC.TRAILERS.dump, { len: 45, r: 20 });
Object.assign(HC.TRAILERS.dump2, { len: 45, r: 20 });
Object.assign(HC.TRAILERS.equip, { len: 63, r: 18, deck: [-22, 46, 12], slots: [30, 0] });
Object.assign(HC.TRAILERS.lowboy, { len: 117, r: 24, deck: [12, 92, 14], slots: [70, 32] });
Object.assign(HC.TRAILERS.chipper, { len: 32, r: 18 });
Object.assign(HC.TRAILERS.chipper2, { len: 43, r: 22 });
HC.EQUIP.truck.hitchOff = 36; HC.EQUIP.truck2.hitchOff = 36; HC.EQUIP.dually.hitchOff = 37; HC.EQUIP.dumptruck.hitchOff = 42; HC.EQUIP.semi.hitchOff = 33;
HC.EQUIP.fmulcher.r = 24; HC.EQUIP.excavator.r = 24; HC.EQUIP.semi.r = 22; HC.EQUIP.logtruck.r = 22; HC.EQUIP.bucket.r = 20; HC.EQUIP.dumptruck.r = 20;

// the crew no longer *is* the chainsaw: the saw is an item (fuel/wear tracked under 'saw')
Object.assign(HC.EQUIP.saw, { name: 'Ground Crew', short: 'Crew', fuelCap: 0,
  help: 'Your ground hand. Carries and runs the chainsaw (G picks it up or sets it down), feeds the chipper, rides in trucks.' });

// ================= Real speeds, sizes, dozers, harvester, forwarder, log trailer, quarry =================
// Top speeds in px/s (32 px = 3 m, so 10.7 px/s = 1 m/s). Real machines are slow; trucks get a road bonus.
Object.assign(HC.EQUIP.saw, { speed: 46 });
Object.assign(HC.EQUIP.land, { speed: 46 });
Object.assign(HC.EQUIP.op, { speed: 50 });
Object.assign(HC.EQUIP.skid, { speed: 46, turn: 1.9, mass: 4.3 });      // ~4.3 m/s high range
Object.assign(HC.EQUIP.grinder, { speed: 22, turn: 1.4, mass: 0.7 });
Object.assign(HC.EQUIP.mower, { speed: 52, turn: 2.6, mass: 0.5 });
Object.assign(HC.EQUIP.excavator, { speed: 30, turn: 0.9, mass: 13, reach: 50, cap: 3 });
Object.assign(HC.EQUIP.fmulcher, { speed: 34, turn: 1.0, mass: 14 });
for (const k of ['truck', 'truck2']) Object.assign(HC.EQUIP[k], { speed: 150, mass: 3.6 });
Object.assign(HC.EQUIP.dually, { speed: 160, mass: 3.8 });
Object.assign(HC.EQUIP.dumptruck, { speed: 130, mass: 9 });
Object.assign(HC.EQUIP.logtruck, { speed: 120, mass: 12 });
Object.assign(HC.EQUIP.bucket, { speed: 125, mass: 11 });
Object.assign(HC.EQUIP.semi, { speed: 130, turn: 1.4, mass: 8, wheelbase: 5.5 });

Object.assign(HC.EQUIP, {
  miniex: {
    name: 'Mini Excavator (3.5 t)', short: 'Mini ex', move: 'tank', speed: 24, turn: 1.3, r: 17, mass: 3.5, reach: 38, cap: 2,
    fuelCap: 60, fuelUse: 0.25, work: 0.35, wear: 0.03, price: 9000, repair: 7,
    help: 'Small enough for the equipment trailer. E grabs three pieces at a time; hold left click on a stump to pull it (slower than the big excavator).',
  },
  dozerS: {
    name: 'Compact Dozer (D3 class)', short: 'Dozer', move: 'tank', speed: 28, turn: 1.1, r: 20, mass: 8, heavy: true, blade: 28,
    fuelCap: 120, fuelUse: 0.45, work: 0.6, wear: 0.03, price: 24000, repair: 12,
    help: 'Drive into logs, brush, rocks and stumps to shove them with the blade: push debris into one pile or straight to the trailer. Hold left click to cut the blade in and strip tall grass, mulch and brush down to dirt. Rides the lowboy.',
  },
  dozerL: {
    name: 'Crawler Dozer (D6 class)', short: 'Big dozer', move: 'tank', speed: 30, turn: 0.9, r: 26, mass: 20, heavy: true, blade: 38, pushTrees: true,
    fuelCap: 260, fuelUse: 0.8, work: 1.0, wear: 0.03, price: 48000, repair: 18,
    help: 'A full-size dozer with a 3.6 m blade. Shoves big piles and, with the blade down (left click), pushes over saplings, dead trees and small trees. Push over a keeper and you pay for it. Rides the lowboy.',
  },
  harvester: {
    name: 'Wheeled Harvester (8-wheel)', short: 'Harvester', move: 'tank', artic: true, wheelbase: 4.9, speed: 34, turn: 0.95, r: 26, mass: 22, heavy: true, reach: 95,
    fuelCap: 300, fuelUse: 0.7, work: 0.9, wear: 0.03, price: 65000, repair: 20,
    help: 'Cut-to-length logging. Point at a standing tree within about 9 m, aim where it should fall with the mouse and hold left click: the head grabs, fells, strips and cuts it into logs in one go, with almost no spread. Leaves the brush as slash. Rides the lowboy.',
  },
  forwarder: {
    name: 'Forwarder (14 t)', short: 'Forwarder', move: 'tank', artic: true, wheelbase: 5.6, speed: 38, turn: 0.95, r: 26, mass: 14, heavy: true, bed: 24, logsOnly: true, reach: 100,
    fuelCap: 220, fuelUse: 0.6, work: 0.6, wear: 0.03, price: 52000, repair: 16,
    help: 'Off-road log hauler. Park within crane reach of logs and press E to load them onto the bunks (24 units). At the sawmill, a log truck or the log trailer, press E to unload everything into it. Rides the lowboy.',
  },
});
HC.TRAILERS.logtrailer = { name: 'Log trailer', len: 115, r: 24, solid: true, price: 16000, heavy: true, cap: 40, logsOnly: true };
HC.TRAILERS.fwdbed = { name: 'Forwarder bunks', len: 0, r: 0 };
HC.YARDS.quarry = { name: 'Stone Creek Quarry', price: 15000 };
HC.ROCK_PRICE = 45; // per rock sold at your quarry
HC.T.FIELD = 11; HC.T.QUARRY = 12; HC.T.DIRTROAD = 13;

HC.EQUIP.mulcher.help = 'A separate attachment for the skid steer, delivered to your yard. With nothing on the quick-attach, drive up to it and press Q to lock it on; Q again drops it. Lower it to the ground (G) and hold left click to mulch.';
HC.EQUIP.skid.help = 'W/S drive, A/D turn. Hold T/G to raise and lower the arms. Grapple: lower it to grab (E), raise it to dump into a trailer or chipper (E). Q drops or picks up an attachment.';

HC.EQUIP.dozerS.help = 'Drive into anything (trees, brush, stumps, logs, rocks) and it goes over and into one push pile in front of the blade. Big trees take a while. Back up to leave the pile, then load it into a trailer with a grapple. Hold left click to cut in and strip the ground. Rides the lowboy.';
HC.EQUIP.dozerL.help = 'A full-size dozer with a 3.6 m blade: pushes over even big trees fast and rolls everything into one push pile. Back up to leave the pile, then load it with a grapple. Mind the houses and power lines. Rides the lowboy.';

HC.T.ROCKFACE = 14;

// duplicates: an extra machine is a new key ('skid_2') whose .base points at the original
HC.baseOf = (k) => { let n = 0; while (HC.EQUIP[k] && HC.EQUIP[k].base && n++ < 4) k = HC.EQUIP[k].base; return k; }; // a second mini is still a skid-type machine
HC.trailerKindOf = (id) => id.replace(/_\d+$/, '');
// starter equipment can be bought again too
HC.EQUIP.skid.price = 9000;
HC.EQUIP.truck.price = 8500;

// Fuel & service truck: carries its own fuel supply and a hose reel to fill any machine or truck in the field
HC.EQUIP.fueltruck = {
  name: 'Fuel & Service Truck', short: 'Fuel Truck', move: 'car', speed: 130, turn: 2.0, r: 18, mass: 7.5, wheelbase: 4.7,
  fuelCap: 150, fuelUse: 0.4, wear: 0.02, price: 26000, repair: 10, supply: 2400,
  help: 'A 2,000-gallon-class fuel tank and hose reel. Park beside any machine or truck (even one that has run dry) and press E to run the hose and fill it from the truck. Top the truck up at a pump at one of your yards (E there fills the tank and the supply).',
};
HC.EQUIP.fueltruck.tows = true; HC.EQUIP.fueltruck.hitchOff = 44;

// Tandem dump truck, heavy-haul tractor, wheel loader, deck-over trailer
HC.EQUIP.dumptruck2 = {
  name: 'Tandem-Axle Dump Truck', short: 'Tandem dump', move: 'car', speed: 125, turn: 1.7, r: 20, mass: 12, wheelbase: 5.3,
  fuelCap: 220, fuelUse: 0.5, wear: 0.02, price: 28000, repair: 12, bed: 30,
  help: 'Twin rear axles and a 16 ft box: 30 units in its own bed, and it can still tow a trailer. E at the county brush dump (or the sawmill, for logs) unloads it.',
};
HC.EQUIP.semiHD = {
  name: 'Heavy-Haul Tractor (tri-axle)', short: 'Heavy tractor', move: 'car', speed: 128, turn: 1.3, r: 22, mass: 10, wheelbase: 6.4, heavyHaul: true, power: 1.5,
  fuelCap: 300, fuelUse: 0.7, wear: 0.02, price: 42000, repair: 14,
  help: 'A long-hood tri-axle tractor built for heavy hauling. Pulls the lowboy and every other trailer, and keeps its speed with a big machine aboard.',
};
HC.EQUIP.semi.heavyHaul = true;
HC.EQUIP.loader = {
  name: 'Wheel Loader (rubber tire)', short: 'Loader', move: 'tank', artic: true, wheelbase: 3.3, speed: 62, turn: 1.0, r: 22, mass: 16, heavy: true, cap: 10,
  fuelCap: 260, fuelUse: 0.55, wear: 0.03, price: 58000, repair: 16,
  help: 'Articulated loader with a 3 yd bucket. Lower the bucket (hold G), drive into a push pile or loose debris and press E to scoop up to 10 pieces at once. Raise it (hold T) beside a dump truck or trailer and press E to dump. Rides the lowboy.',
};
for (const k of ['dumptruck2', 'semiHD']) HC.EQUIP[k].tows = true;
HC.EQUIP.dumptruck2.hitchOff = 48; HC.EQUIP.semiHD.hitchOff = 36;
HC.TRAILERS.deckover = { name: 'Deck-Over Trailer (25 ft, 14 t)', len: 80, r: 22, deck: [-30, 68, 14], slots: [48, 6], hd: true, price: 11000 };

// Farm tractor with a 3-point rotary cutter ("bush hog"), and the bush hogging job
HC.EQUIP.tractor = {
  name: 'Utility Tractor (110 hp, cab, loader)', short: 'Tractor', move: 'car', speed: 78, turn: 2.4, r: 18, mass: 5.5, wheelbase: 2.7, pto: true, cap: 6,
  fuelCap: 160, fuelUse: 0.3, wear: 0.02, price: 32000, repair: 9,
  help: 'A cab tractor with a front-end loader, a rear three-point hitch and PTO. Loader: G lowers the bucket, E scoops up to 6 pieces of brush, logs or mulch, T raises it and E dumps into a trailer or truck. Back up square to the bush hog and press Q to hook it on; hold left click to cut. Tows trailers too (R).',
};
HC.EQUIP.tractor.tows = true; HC.EQUIP.tractor.hitchOff = 26;
HC.EQUIP.tractor.rides = true; // a wheeled machine that loads onto trailers like the tracked ones
HC.RIDES = (k) => HC.EQUIP[k] && (HC.EQUIP[k].move === 'tank' || HC.EQUIP[HC.EQUIP[k].base || k].rides);
HC.EQUIP.bushhog = {
  name: 'Bush Hog (7 ft rotary cutter)', short: 'Bush hog', noUnit: true, price: 3800, attachTo: 'tractor',
  help: 'A 7 ft three-point rotary cutter for the tractor. Cuts tall grass, briars and saplings up to about 2" in one pass. Hook it on with Q from the tractor seat.',
};
HC.EQUIP.mulcher.attachTo = 'skid';
HC.JOBS.bush_hog = { name: 'Bush Hogging', color: '#9a8a2a', needs: ['tractor', 'bushhog'],
  blurb: 'Cut the overgrown field: tall grass, briars and small saplings. Keep the cutter off the trees and the fence.' };
HC.REQUESTS.bush_hog = ['The back pasture is waist high and full of briars. Can you bush hog it?',
  'Haven\'t cut the field in three years. Little pines are coming up everywhere.',
  'Need the field knocked down before hunting season. Watch the fence line.'];

// Mulch: a tracked horizontal grinder turns brush and logs into mulch; a landscape supply yard buys it
HC.EQUIP.grinderHG = {
  name: 'Horizontal Mulch Grinder (tracked)', short: 'Mulch grinder', move: 'tank', speed: 20, turn: 0.7, r: 26, mass: 24, heavy: true,
  fuelCap: 420, fuelUse: 0.5, work: 0.9, wear: 0.03, price: 78000, repair: 22,
  help: 'Feed brush and logs into the hopper at the back with the skid steer, excavator or loader. It grinds them into mulch and the discharge conveyor drops it into a dump trailer or dump truck parked under the end, or onto a pile. Sell mulch at the landscape supply yard. Rides the lowboy.',
};
HC.LOAD.mulch = 1;
HC.MULCH_PRICE = 34; // per load unit at the landscape supply

// Wood chips: chippers blow chips into a chip truck's box (or a dump body under the chute, or a pile); the landscape supply buys them
HC.EQUIP.chiptruck = {
  name: 'Chip Truck (enclosed 14 yd box)', short: 'Chip truck', move: 'car', speed: 135, turn: 2.0, r: 18, mass: 7, wheelbase: 4.4,
  fuelCap: 180, fuelUse: 0.4, wear: 0.02, price: 24000, repair: 10, bed: 40, chipBox: true,
  help: 'A 1-ton-and-a-half chassis with a tall enclosed chip box. Hitch a chipper behind it (R) and run the chipper: the chute blows the chips straight into the box (40 units). X tips the box to dump. Sell chips at the landscape supply.',
};
HC.EQUIP.chiptruck.tows = true; HC.EQUIP.chiptruck.hitchOff = 44;
HC.LOAD.chips = 1;
HC.CHIP_PRICE = 20; // per load unit at the landscape supply

// Starter machine: a stand-on mini track loader with a grapple (3 pieces). The skid steer is now bought (5 pieces).
HC.EQUIP.skid.start = false; HC.EQUIP.skid.grab = 5;
HC.EQUIP.miniskid = Object.assign({}, HC.EQUIP.skid, { reach: 15, shop: true, // the grapple is that much closer in on the mini
  base: 'skid', name: 'Mini Track Loader (stand-on)', short: 'Mini', start: true, price: 5200, grab: 3, speed: 40, turn: 2.2, r: 11, mass: 1.6,
  fuelCap: 60, fuelUse: 0.2, repair: 5,
  help: 'A stand-on mini track loader with a grapple. Small and nimble, it carries 3 pieces at a time. Hold T/G to raise and lower the arms; lower to grab (E), raise to dump into a trailer or chipper (E). The full-size skid steer carries 5.',
});
{ // list it right after the skid steer so it gets a low number key
  const e = HC.EQUIP, order = Object.keys(e).filter((k) => k !== 'miniskid'), at = order.indexOf('skid') + 1, copy = {};
  order.splice(at, 0, 'miniskid');
  for (const k of order) { copy[k] = e[k]; delete e[k]; }
  Object.assign(e, copy);
}
HC.ownsKind = (k) => Object.keys(HC.EQUIP).some((q) => HC.company.owned[q] && (q === k || HC.baseOf(q) === k)); // e.g. the mini counts as a skid steer for job needs

// Bigger tanks: every machine and truck holds twice the fuel it used to (the saw too)
for (const k in HC.EQUIP) if (HC.EQUIP[k].fuelCap) HC.EQUIP[k].fuelCap = Math.round(HC.EQUIP[k].fuelCap * 2);

// ================= Chainsaws: no ground crew any more. You run the saw yourself, and buy one in the shop =================
HC.CHAINSAWS = {
  s35: { name: 'Top-handle saw', spec: '35cc, 14" bar', cc: 35, bar: 14, top: true, price: 280, cut: 0.6, desc: 'An arborist\'s light top-handle saw. Fine for limbs and brush, slow on trunks.' },
  s50: { name: 'Farm saw', spec: '50cc, 18" bar', cc: 50, bar: 18, price: 420, cut: 0.8, desc: 'A tough all-rounder for small trees and firewood.' },
  s60: { name: 'Pro saw', spec: '60cc, 20" bar', cc: 60, bar: 20, price: 800, cut: 1.0, desc: 'The everyday tree-service saw. Fells and bucks at a good clip.' },
  s70: { name: 'Felling saw', spec: '70cc, 25" bar', cc: 70, bar: 25, price: 1250, cut: 1.3, desc: 'More power and a longer bar: 30% faster than the pro saw.' },
  s90: { name: 'Big-bar saw', spec: '90cc, 32" bar', cc: 90, bar: 32, price: 1900, cut: 1.6, desc: 'A logger\'s saw for the biggest oaks. 60% faster than the pro saw.' },
  s120: { name: 'Monster saw', spec: '120cc, 42" bar', cc: 120, bar: 42, price: 2900, cut: 2.0, desc: 'The biggest saw made. Twice as fast as the pro saw, and you can feel the weight.' },
};
Object.assign(HC.EQUIP.saw, { name: 'Chainsaw', short: 'Chainsaw', noUnit: true, start: false, hidden: true,
  help: 'Get out on foot (F), pick up the saw (G), walk up to a tree, aim with the mouse and hold left click to fell. Hold click on a downed tree to buck it.' });
HC.sawSpec = () => HC.CHAINSAWS[(HC.company && HC.company.sawKind) || 's60'] || HC.CHAINSAWS.s60;

// one-line shop descriptions (the full controls stay under "How to use")
HC.BLURB = {
  skid: 'The workhorse. Grapple grabs 5 logs or brush piles; takes the mulcher head.', grinder: 'Walk-behind stump grinder. Rides the equipment trailer.',
  chipper: 'Tow-behind disc chipper for brush. Shoots chips into a chip truck.', truck: 'Crew-cab pickup. Tows the equipment and dump trailers.',
  mower: 'Zero-turn mower for tall grass jobs.', land: 'A landscaping hand: sod, shrubs, pavers and bed mulch.',
  mulcher: 'Forestry mulcher head for the skid steer. Grinds brush where it stands.', truck2: 'A second pickup, so two rigs can run at once.',
  dually: 'Lifted 1-ton dually. Pulls the deck-over and heavy trailers.', excavator: '20 t excavator with a thumb: grabs 5, loads trucks, rips stumps fast. Lowboy only.',
  fmulcher: 'Dedicated tracked mulcher: twice as fast as the skid head.', chipper2: 'Big whole-tree chipper. Eats brush and logs.',
  dumptruck: 'Single-axle dump truck, 18 units.', logtruck: 'Log truck with its own knuckleboom crane, 30 units of logs.',
  bucket: '60 ft bucket truck for trees over houses and lines.', semi: 'Road tractor for the lowboy and log trailer.',
  miniex: '3.5 t mini excavator. Grabs 3, pulls stumps, fits the equipment trailer.', dozerS: 'Compact dozer: shoves piles and strips ground.',
  dozerL: 'D6-class dozer: big blade, pushes over small trees.', harvester: 'Fells, delimbs and cuts trees to length in one go.',
  forwarder: 'Hauls 24 units of logs out of the woods.', fueltruck: 'Brings fuel to machines on the job with a hose.',
  dumptruck2: 'Tandem dump truck, 30 units.', semiHD: 'Tri-axle heavy-haul tractor for the biggest lowboy loads.',
  loader: 'Rubber-tire loader: scoops 10 off a dozer pile at once.', tractor: '110 hp tractor with a loader (6) and a rear hitch for the bush hog.',
  bushhog: '7 ft rotary cutter for the tractor. Mows brush and tall grass.', grinderHG: 'Tracked horizontal grinder: turns brush and logs into mulch.',
  chiptruck: 'Enclosed chip truck, 40 units. Pulls a chipper and catches its chips.',
};

// ================= Crawler track loader: a dozer with a bucket =================
HC.EQUIP.trackloader = {
  name: 'Track Loader (crawler, 27 t)', short: 'Track loader', move: 'tank', speed: 24, turn: 0.9, r: 33, mass: 27, heavy: true, blade: 39, cap: 12, pushSlow: 3,
  fuelCap: 240, fuelUse: 0.6, work: 0.7, wear: 0.03, price: 54000, repair: 15,
  help: 'With the bucket down (G) it works like a dozer: drive into logs, brush, stumps and rocks to shove them into a pile, and hold left click to cut the bucket in and strip the ground. It leans on standing trees too, but it is much slower to push them over than a dozer. E scoops up to 12 pieces (a whole push pile in one or two bites); raise the bucket (T) beside a dump truck or trailer and press E to load it. Rides the lowboy.',
};
HC.BLURB.trackloader = 'A big 27 t crawler loader: pushes piles like a dozer, then scoops 12 at a time. Slow at pushing trees over.';

// the bigger chip truck: tandem rear axles under a 20 yd box
HC.EQUIP.chiptruck2 = {
  name: 'Tandem Chip Truck (enclosed 20 yd box)', short: 'Big chip truck', move: 'car', speed: 125, turn: 1.6, r: 22, mass: 11, wheelbase: 5.6,
  fuelCap: 240, fuelUse: 0.5, wear: 0.02, price: 38000, repair: 13, bed: 64, chipBox: true, tows: true, hitchOff: 57,
  help: 'Twin rear axles and a long enclosed chip box: 64 units. Hitch a chipper behind it (R) and the chute blows the chips in through the open back. X tips the box to dump. Sell chips at the landscape supply.',
};
HC.BLURB.chiptruck2 = 'Tandem-axle chip truck with a bigger box: 64 units. Pulls a chipper.';

// people who own the woodland tracts out on the timber roads
HC.LANDOWNERS = ['Pike Timber Co.', 'Haddix Family Trust', 'Cobb Land & Cattle', 'Tolliver Woodlot', 'Abernathy Heirs', 'Kettle Creek Hunting Club',
  'Marsh Forest Holdings', 'Webb Brothers', 'Lyle Family Farm', 'County Parks Dept.', 'Purvis Timberland', 'Dunn Estate'];

// ================= More kinds of work =================
Object.assign(HC.JOBS, {
  timber_harvest: { name: 'Timber Harvest', color: '#6b4a2b', needs: ['saw', 'skid'], tract: true,
    blurb: 'Out in the woods: fell the marked timber, buck it, and skid the logs to the landing (or haul them to the sawmill to sell).' },
  woodland_clear: { name: 'Woodland Clearing', color: '#8a6d2f', needs: ['dozerS'], tract: true,
    blurb: 'Turn a scrubby woodlot into open ground: push over the saplings, grub out the brush and stumps, and pile it all.' },
  storm_cleanup: { name: 'Storm Cleanup', color: '#4a6a8a', needs: ['saw', 'skid'],
    blurb: 'Last night\'s storm put trees down across the yard. Buck them up and clear the wood and brush.' },
  brush_chipping: { name: 'Brush Chipping', color: '#9a7a3a', needs: ['chipper', 'skid'],
    blurb: 'The customer piled their own brush. Run it all through a chipper.' },
});
Object.assign(HC.REQUESTS, {
  timber_harvest: ['We\'re selling {n} marked trees off the back forty. Skid the logs to the landing by the road.',
    'Forester marked {n} trees for a thinning. Leave everything without paint.', 'Got a timber sale on our woodlot: {n} trees. Logs go to the landing.'],
  woodland_clear: ['Want to turn this scrub woods into pasture. Push it all out and pile it.', 'The hunting club wants a food plot opened up. Clear the scrub, leave the big oaks.'],
  storm_cleanup: ['The wind laid {n} trees across my yard last night. Can you come today?', 'Storm took down {n} trees. One is right across the drive.'],
  brush_chipping: ['I cut a bunch of brush and piled it. About {n} piles. Can you chip it?', 'Spring cleanup: {n} piles of limbs in the side yard need chipping.'],
});
// a dozer job takes any dozer or the track loader
HC.KIND_ALIAS = { dozerS: ['dozerS', 'dozerL', 'trackloader'], // a job's "needs" can be met by any of these
  chipper: ['chipper', 'chipper2'], mulcher: ['mulcher', 'fmulcher'], grinder: ['grinder', 'excavator', 'miniex'] };
{
  const own = HC.ownsKind;
  HC.ownsKind = (k) => (HC.KIND_ALIAS[k] ? HC.KIND_ALIAS[k].some((q) => own(q)) : own(k));
  HC.needLabel = (k) => ({ dozerS: 'Dozer or track loader', chipper: 'Chipper (either)', mulcher: 'Mulcher head or tracked mulcher', grinder: 'Stump grinder or excavator' })[k] || (HC.EQUIP[k] && HC.EQUIP[k].name) || k;
}

// the biggest dump truck: three rear axles
HC.EQUIP.dumptruck3 = {
  name: 'Tri-Axle Dump Truck', short: 'Tri-axle dump', move: 'car', speed: 120, turn: 1.5, r: 24, mass: 15, wheelbase: 6.4,
  fuelCap: 280, fuelUse: 0.6, wear: 0.02, price: 39000, repair: 14, bed: 44, tows: true, hitchOff: 66,
  help: 'Three rear axles and a 20 ft box: 44 units in its own bed, and it still tows a trailer. X tips the box anywhere; E at the county brush dump (or the sawmill, for logs) unloads it.',
};
HC.BLURB.dumptruck3 = 'The big one: tri-axle dump truck, 44 units, still tows a trailer.';

// how far each machine reaches ahead of / behind its centre in metres (bucket, blade, grapple), for loading on decks
for (const [k, e] of Object.entries({ tractor: [3.7, 2.0], skid: [2.3, 1.4], miniskid: [1.45, 1.1], trackloader: [5.7, 3.0], loader: [4.6, 3.5], dozerS: [2.4, 1.6],
  dozerL: [3.15, 2.3], fmulcher: [3.4, 2.3], excavator: [3.0, 2.0], miniex: [2.5, 1.45], grinder: [1.6, 1.4], mower: [1.0, 0.9], harvester: [4.2, 3.0], forwarder: [3.6, 3.6], grinderHG: [4.5, 4.5] })) if (HC.EQUIP[k]) HC.EQUIP[k].ext = e;

// ================= Mowers: deck width decides how many passes a strip of tall grass takes =================
Object.assign(HC.EQUIP.mower, { name: 'Residential Zero-Turn (48")', deck: 1.22, mowerStyle: 'res' });
Object.assign(HC.EQUIP, {
  mowerZT: { name: 'Commercial Zero-Turn (61")', short: 'Pro mower', move: 'tank', speed: 62, turn: 3.4, r: 13, mass: 0.6, deck: 1.55, mowerStyle: 'pro',
    fuelCap: 60, fuelUse: 0.22, wear: 0.02, price: 4800, repair: 5,
    help: 'A heavy commercial zero-turn with a 61" deck and big rear tyres. Faster than the 48" and cuts a wider swath. Drive over tall grass; the chute throws clippings out the side.' },
  mowerSO: { name: 'Stand-On Mower (52")', short: 'Stand-on', move: 'tank', speed: 56, turn: 3.8, r: 11, mass: 0.5, deck: 1.32, mowerStyle: 'stand',
    fuelCap: 45, fuelUse: 0.18, wear: 0.02, price: 3900, repair: 4,
    help: 'Compact stand-on mower: turns on a dime and fits on the equipment trailer with room to spare.' },
  mowerWA: { name: 'Out-Front Mower (96")', short: 'Wide mower', move: 'tank', speed: 50, turn: 2.2, r: 18, mass: 1.4, deck: 2.44, mowerStyle: 'wide',
    fuelCap: 90, fuelUse: 0.35, wear: 0.02, price: 13500, repair: 8,
    help: 'An out-front rotary mower: big front drive wheels, rear-wheel steering and a 96" deck out ahead where you can see it. Mows a whole field in a few passes. Rides the equipment trailer.' },
});
HC.KIND_ALIAS.mower = ['mower', 'mowerZT', 'mowerSO', 'mowerWA'];
Object.assign(HC.BLURB, { mower: 'Starter 48" zero-turn for lawns and tall grass.', mowerZT: 'Orange commercial 61" zero-turn: faster, wider cut.',
  mowerSO: 'Nimble 52" stand-on mower.', mowerWA: '96" out-front rotary mower for big lawns and fields.' });
for (const k of ['mowerZT', 'mowerSO']) HC.EQUIP[k].ext = [HC.EQUIP[k].deck * 0.9 + 0.3, 1.0];
HC.EQUIP.mowerWA.ext = [2.0, 1.55];
HC.EQUIP.mower.ext = [1.0, 0.9];

HC.BLURB.miniskid = 'Stand-on mini track loader with a grapple: carries 3. Small, nimble and cheap.';

// ================= A fresh start: cash in the bank and an empty yard. You buy everything yourself. =================
HC.START_MONEY = 30000;
for (const k in HC.EQUIP) if (k !== 'op') HC.EQUIP[k].start = false;

// ================= Skid steer brush cutter, and a grapple skidder =================
HC.EQUIP.brushcut = { name: 'Skid Steer Brush Cutter (72")', short: 'Brush cutter', noUnit: true, price: 4200, attachTo: 'skid',
  help: 'An open-front rotary brush cutter for the skid steer: tall grass, briars and saplings up to 3" go down to mowed ground. Swap heads with Q at the yard; lower it (G) and hold left click to cut.' };
HC.EQUIP.skidder = {
  name: 'Grapple Skidder (bogie tracks)', short: 'Skidder', move: 'tank', artic: true, wheelbase: 3.2, speed: 44, turn: 1.0, r: 26, mass: 19, heavy: true, cap: 4,
  fuelCap: 300, fuelUse: 0.6, wear: 0.03, price: 58000, repair: 18,
  help: 'Drags whole trees out of the woods. Back the grapple up to the butts of felled trees and press E to grab up to four, then drag them to the landing and press E to drop them. Buck them up there with the saw. T/G raise and lower the arch. Rides the lowboy.',
};
HC.EQUIP.skidder.ext = [3.4, 3.9];
Object.assign(HC.BLURB, { brushcut: 'Rotary brush cutter for the skid steer: grass, briars and saplings.', skidder: 'Grapple skidder: drags four whole trees at a time to the landing.' });
HC.KIND_ALIAS.bushhog = ['bushhog', 'brushcut'];
HC.KIND_ALIAS.tractor = ['tractor', 'skid'];
for (const k of ['brushcut', 'skidder']) { if (HC.EQUIP[k].start === undefined) HC.EQUIP[k].start = false; }

// ================= Firewood: a towable processor, a yard with a roadside stand, and the supply buys the rest =================
HC.EQUIP.fwproc = {
  name: 'Firewood Processor (27 t splitter)', short: 'Processor', move: 'tow', speed: 0, r: 18, mass: 3,
  fuelCap: 120, fuelUse: 0.3, work: 0.4, wear: 0.02, price: 32000, repair: 10, start: false,
  help: 'A towable firewood processor: log deck, saw, 6-way wedge splitter and a 10 ft belt conveyor. Load logs onto the side deck with the grapple, loader or excavator; it cuts and splits them and the conveyor drops firewood into a dump trailer or truck parked under its end, or onto a pile. Stock your firewood stand with it, or sell it at the landscape supply.',
};
HC.TRAILERS.fwproc = { name: 'Firewood processor', len: 46, r: 20, solid: true };
HC.LOAD.firewood = 1;
HC.FIREWOOD_SUPPLY = 28;            // per unit at the landscape supply
HC.FIREWOOD_STAND = [50, 70];       // per unit, what customers pay at your stand
HC.STAND_CAP = 60;
HC.YARDS.firewood = { name: 'Firewood Yard', price: 12000 };
HC.BLURB.fwproc = 'Red towable firewood processor: logs in, split firewood out the conveyor.';

// ================= What happens to the debris: every job says so, and leaving it behind is illegal dumping =================
HC.DISPOSAL = {
  haul: { short: 'Haul away', text: 'Haul it away: every log, limb and stump has to leave the property (logs to the sawmill, brush and stumps to the county brush dump). Anything left on the property is illegal dumping and gets fined.' },
  pile: { short: 'Pile on site', text: 'Push it into piles on site: the piles stay. No need to haul anything.' },
  place: { short: 'Leave in place', text: 'Cut material stays where it falls (mulched or mowed). Nothing to haul.' },
  landing: { short: 'Logs to the landing', text: 'Skid the logs to the landing by the road; tops and limbs (slash) can stay in the woods.' },
  chip: { short: 'Chip it', text: 'Run the brush through a chipper; the chips can stay on site or go in a chip truck to sell.' },
};
for (const [k, d] of Object.entries({ tree_removal: 'haul', lot_clearing: 'haul', stump_grinding: 'place', mulching: 'place', sod_planting: 'haul', hardscape: 'haul',
  bush_hog: 'place', timber_harvest: 'landing', woodland_clear: 'pile', storm_cleanup: 'haul', brush_chipping: 'chip' })) if (HC.JOBS[k]) HC.JOBS[k].disposal = d;
HC.DUMPING_FINE = 40; // per piece of debris left on a haul-away job, or tipped out somewhere it doesn't belong

// ================= Camera modes (Settings, or C to cycle) =================
HC.CAM_MODES = {
  auto: { name: 'Auto', text: 'Swings in behind trucks at road speed; otherwise stays where you put it.' },
  follow: { name: 'Follow behind', text: 'Always straightens out behind you: walking, driving or running a machine.' },
  free: { name: 'Free', text: 'Never turns on its own. Right-drag to look around.' },
  top: { name: 'Overhead', text: 'Straight down, north up. Good for planning a job.' },
};
HC.CAM_ORDER = ['auto', 'follow', 'free', 'top'];
HC.camMode = () => ((HC.company && HC.company.prefs) || {}).cam || 'auto';

// ================= Gooseneck trailers: ball in the bed of the flatbed pickups =================
// len = coupler (the gooseneck ball) to the middle axle, px. deck = [rear, front, half-width] px along the trailer.
HC.TRAILERS.gndump = { name: 'Gooseneck Dump Trailer (16 ft, high sides)', len: 56, r: 22, solid: true, gooseneck: true, cap: 18, deck: [-17, 34, 12], slots: [10], price: 16500 };
HC.TRAILERS.gnflat = { name: 'Gooseneck Flat Deck (32 ft, 3-axle)', len: 80, r: 22, gooseneck: true, hd: true, deck: [-35, 55, 15], slots: [36, 4], price: 13500 };
for (const [k, off, h] of [['truck', 19, 1.15], ['truck2', 19, 1.15], ['dually', 17, 1.55]]) Object.assign(HC.EQUIP[k], { gooseneck: true, gnOff: off, gnBall: h });

// ================= Disposal: the sawmill buys logs, the county brush dump takes the rest; yards only store debris =================
HC.DUMP_FEES = { brush: 30, stump: 12, rock: 12, log: 0 }; // $ per load unit at the county dump (logs are taken free; the mill pays for them)
HC.dumpFee = (c) => (HC.DUMP_FEES[c.kind] ?? HC.DUMP_FEE) * (HC.LOAD[c.kind] || 1);
HC.MILL_PRICE = 1.3;   // the sawmill pays 30% over the old pad price for logs
HC.FUEL_BURN = 0.55;   // everything burns fuel at 55% of the old rate

// ================= Excavators: more muscle =================
Object.assign(HC.EQUIP.excavator, { speed: 40, turn: 1.15, cap: 5, reach: 54 });
Object.assign(HC.EQUIP.miniex, { speed: 30, turn: 1.5, cap: 3, reach: 40 });

// ================= A bigger, stronger compact track loader (white and orange, cab with a door) =================
HC.EQUIP.skidXL = Object.assign({}, HC.EQUIP.skid, {
  base: 'skid', shop: true, name: 'Large Track Loader (110 hp CTL)', short: 'Big skid', start: false, price: 16500, grab: 7, reach: 28,
  speed: 54, turn: 1.75, r: 16, mass: 5.2, heavy: true, power: 1.45, fuelCap: 140, fuelUse: 0.42, repair: 11,
  help: 'A big 110 hp compact track loader: 7 pieces in the grapple, 45% more push behind the mulcher head and brush cutter, faster on the tracks. Too heavy for the 20 ft equipment trailer: it rides the deck-over, the gooseneck flat deck or the lowboy. Takes every skid steer attachment (Q).',
  ext: [2.65, 1.6],
});
HC.BLURB.skidXL = 'Big 110 hp track loader: grabs 7, mulches and cuts 45% faster. Rides the deck-over or gooseneck.';

// the firewood processor is installed for good at the Firewood Yard (it can't be hitched or moved)
HC.EQUIP.fwproc.fixed = true;
HC.EQUIP.fwproc.help = 'A firewood processor installed at your Firewood Yard: log deck, saw, 6-way wedge splitter and a belt conveyor. Bring logs to the yard and load them onto the side deck with the grapple, loader or excavator; it cuts and splits them and the conveyor drops firewood into a dump trailer or truck parked under its end, or onto a pile. Stock your firewood stand with it, or sell it at the landscape supply.';
HC.BLURB.fwproc = 'Firewood processor, installed for good at your Firewood Yard: logs in, split firewood out the conveyor.';
// the 40 ft gooseneck flat deck: room for three small machines
Object.assign(HC.TRAILERS.gnflat, { name: 'Gooseneck Flat Deck (40 ft, 3-axle)', len: 104, deck: [-45, 79, 15], slots: [58, 20, -18] });
HC.PALLET_DECKS_GN = 10;

// ================= Payload: every flat deck (and a flatbed's bed) has a rated load in tonnes =================
for (const [k, t] of Object.entries({ equip: 5, deckover: 10, gnflat: 13.5, gndump: 6, lowboy: 40 })) if (HC.TRAILERS[k]) HC.TRAILERS[k].payload = t;
HC.BED_PAYLOAD = 2.5;     // a 1-ton flatbed pickup's bed
HC.PALLET_T = { sod: 1.1, shrub: 0.5, paver: 1.5 }; // full pallet, tonnes
HC.ATT_T = { grapple: 0.3, mulcher: 1.2, brushcut: 0.6, forks: 0.15, bushhog: 0.6 };
HC.massOf = (k) => (HC.EQUIP[k] && (HC.EQUIP[k].mass || HC.EQUIP[HC.baseOf(k)].mass)) || 3;
// what's riding on a trailer deck (or a truck's bed), in tonnes
HC.deckLoad = (S, host, isTruck) => {
  const id = isTruck ? 'truck:' + host.kind : host.id;
  let t = 0;
  if (!isTruck) for (const k in S.units) { const u = S.units[k]; if (u.on && u.on.id === host.id) t += HC.massOf(k); }
  for (const p of (HC.company.pallets || [])) if (p.ride && (isTruck ? p.ride.u === host.kind : p.ride.t === host.id)) t += (HC.PALLET_T[p.mat] || 1) * (p.qty / ((HC.PALLETS[p.mat] || {}).per || 10));
  for (const a of (S.attachments || [])) if (a.on === (isTruck ? id : 'trailer:' + host.id)) t += HC.ATT_T[a.kind] || 0.4;
  return Math.round(t * 10) / 10;
};
HC.payloadOf = (host, isTruck) => (isTruck ? HC.BED_PAYLOAD : (HC.TRAILERS[host.kind] || {}).payload || 99);
// the flatbed's bed is out of use while a gooseneck is hitched in it
HC.bedBlocked = (S, truck) => S.trailers.some((t) => t.hitch === truck.kind && HC.TRAILERS[t.kind] && HC.TRAILERS[t.kind].gooseneck);

// ================= A big self-propelled 4x4 stump grinder (after the reference: yellow, boom-mounted wheel, rear control station) =================
HC.EQUIP.grinderXL = Object.assign({}, HC.EQUIP.grinder, {
  base: 'grinder', shop: true, name: 'Self-Propelled Stump Grinder (4x4, 55 hp)', short: 'Big grinder', price: 14500,
  speed: 34, turn: 1.5, r: 15, mass: 3.3, power: 2.4, reachG: 26, artic: true, wheelbase: 1.5, fuelCap: 90, fuelUse: 0.35, repair: 9, ext: [2.1, 1.6],
  help: 'A 55 hp four-wheel-drive stump grinder with the cutter wheel on a swinging boom out front. Grinds about two and a half times as fast as the walk-behind, and reaches bigger stumps. Hold left click with the wheel over a stump. Rides the deck-over or the gooseneck flat deck (3.3 t).',
});
HC.BLURB.grinderXL = '55 hp 4x4 stump grinder: grinds 2.4x faster than the walk-behind.';

// ================= Price audit: line the fleet up so bigger and more capable costs more, and pays back from the jobs it opens =================
for (const [k, p] of Object.entries({
  truck2: 8500,       // same truck as the first one
  grinder: 3200, grinderXL: 12500, mulcher: 6500,
  miniex: 11000, excavator: 26000, dozerS: 22000,
  tractor: 24000, bucket: 24000, fwproc: 24000,
})) if (HC.EQUIP[k]) HC.EQUIP[k].price = p;
for (const [k, p] of Object.entries({ deckover: 9000, gnflat: 10500, gndump: 11500, lowboy: 15000 })) if (HC.TRAILERS[k]) HC.TRAILERS[k].price = p;

// the gooseneck dump stretched to a 20 ft box: more load, and two small machines when it's empty
Object.assign(HC.TRAILERS.gndump, { name: 'Gooseneck Dump Trailer (20 ft, high sides)', len: 69, cap: 26, deck: [-17, 46, 12], slots: [30, 0], payload: 8 });

// the firewood processor is part of the Firewood Yard: it comes with the yard and isn't sold on its own
HC.EQUIP.fwproc.price = 0;
HC.YARDS.firewood.price = 30000;
HC.BLURB.fwproc = 'Firewood processor: part of the Firewood Yard.';

HC.TRAILERS.equip.price = HC.TRAILERS.equip.price || 4500; HC.TRAILERS.dump.price = HC.TRAILERS.dump.price || 2400;
// ================= Everything about 10% dearer (machines, trucks, attachments, trailers, saws), rounded to the nearest $100 =================
for (const e of Object.values(HC.EQUIP)) if (e.price) e.price = Math.round(e.price * 1.1 / 100) * 100;
for (const t of Object.values(HC.TRAILERS)) if (t.price) t.price = Math.round(t.price * 1.1 / 100) * 100;
for (const c of Object.values(HC.CHAINSAWS)) if (c.price) c.price = Math.round(c.price * 1.1 / 10) * 10;

// ================= more kinds of work =================
Object.assign(HC.JOBS, {
  lawn_mowing: { name: 'Lawn Mowing', color: '#5aa83f', needs: ['mower'], disposal: 'place', blurb: 'An overgrown lawn, front and back. Mow it all.' },
  hazard_tree: { name: 'Hazard Tree', color: '#b0452a', needs: ['saw'], disposal: 'haul', blurb: 'Dead trees leaning toward the house. Drop them safely (a bucket truck helps) and haul the wood away.' },
  firewood_delivery: { name: 'Firewood Delivery', color: '#a8743c', needs: ['fwproc'], disposal: 'place', blurb: 'Bring split firewood from your Firewood Yard and dump it in the marked spot beside the drive.' },
  mulch_delivery: { name: 'Mulch Delivery', color: '#5b3b24', needs: ['skid'], disposal: 'place', blurb: 'Bring mulch (bought at the landscape supply or ground yourself) and dump it in the marked spot.' },
  rock_picking: { name: 'Field Rock Picking', color: '#8b8e93', needs: ['skid'], disposal: 'haul', blurb: 'Pick the rocks off the field with a grapple or loader and haul them away (the quarry buys them if you own it).' },
  fence_line: { name: 'Fence Line Clearing', color: '#6d7d2a', needs: ['mulcher'], disposal: 'place', blurb: 'The back fence line has grown up in brush and saplings. Cut it back with a mulcher head or brush cutter.' },
});
Object.assign(HC.REQUESTS, {
  lawn_mowing: ['We were away all summer and the yard is a hayfield. Can you mow it?', 'Grass is up to my knees. Front and back, please.', 'Renters moved out and left the lawn a jungle. Need it cut.'],
  hazard_tree: ['There\'s a dead tree leaning right at my bedroom. Please hurry.', 'Two dead ash trees by the house. I lie awake when it\'s windy.', 'Arborist says the dead one by the garage could go any day.'],
  firewood_delivery: ['Need {n} units of firewood for the winter, stacked by the drive.', 'Can you drop off {n} units of split hardwood?', 'Woodstove season: {n} units, please.'],
  mulch_delivery: ['Need {n} units of mulch dumped by the driveway. We\'ll spread it.', 'Garden club order: {n} units of mulch beside the drive.'],
  rock_picking: ['Plowed the back field and turned up {n} rocks. Can you pick them and haul them off?', 'Want to seed this side lot but it\'s all rocks. About {n} of them.'],
  fence_line: ['The fence along the back is buried in brush. Can you clear it out?', 'Can\'t even see my back fence anymore. Brush and little trees all along it.'],
});
HC.KIND_ALIAS.mulcher = ['mulcher', 'fmulcher', 'brushcut'];

// ================= No more "bigger dump trailer" upgrade: buy the bigger trailer instead =================
delete HC.UPGRADES.trailer;
HC.TRAILERS.dump18 = { name: 'Tandem Dump Trailer (16 ft)', len: 48, r: 20, solid: true, cap: 18, price: 4200 };

// logs ride log trucks, the log trailer and the forwarder one spot apiece (bunks are built for them)
HC.LOG_CARRIERS = ['logbed', 'logtrailer', 'fwdbed'];
HC.loadOf = (c, t) => (c.kind === 'log' && t && HC.LOG_CARRIERS.includes(t.kind) ? 1 : HC.LOAD[c.kind] || 1);

// ================= Firewood and mulch pay better =================
HC.MULCH_PRICE = 48;            // the supply buys your mulch (was $34)
HC.MULCH_PRICE = 62;            // grinding pays: a log ground into 2 mulch ($124) beats the sawmill (~$45-85 a log)
HC.MILL_PRICE = 1.15;           // the sawmill pays a bit less for logs
HC.EQUIP.grinderHG.price = 64000; // and the grinder costs less
HC.FIREWOOD_SUPPLY = 45;        // the supply buys leftover firewood (was $28)
HC.FIREWOOD_STAND = [70, 95];   // drive-by customers at your stand (was $50-70)
// the tractor a bit cheaper, the skid steers dearer
Object.assign(HC.EQUIP.tractor, { price: 23500 });
Object.assign(HC.EQUIP.skid, { price: 13500 });
Object.assign(HC.EQUIP.skidXL, { price: 22500 });
// stone is worth more, and costs more to get rid of
HC.ROCK_PRICE = 75;           // per rock at your quarry (was $45)
HC.DUMP_FEES.rock = 22;       // per load unit at the county dump: $66 a rock (was $36)

// the knuckleboom log truck carries 20 logs; the grapple upgrade is gone (machines carry what they're built for)
HC.EQUIP.logtruck.bed = 20;
HC.EQUIP.logtruck.help = HC.EQUIP.logtruck.help.replace('30 units', '20 logs');
delete HC.UPGRADES.grapple;
HC.BLURB.logtruck = HC.BLURB.logtruck.replace('30 units of logs', '20 logs').replace('30 units', '20 logs');

HC.JOBS.bush_hog.blurb = 'An overgrown field: tall grass, briars and thin saplings. A tractor and bush hog mows it all down.';
HC.JOBS.mulching.blurb = 'Thick brush and bigger saplings, too heavy for a bush hog. A forestry mulcher grinds it all, stumps included, and leaves a mulch carpet.';

// ================= Balance: give the wheel loader and the tractor clear jobs to do =================
Object.assign(HC.EQUIP.loader, { price: 44000, cap: 16, speed: 84,
  help: 'Articulated wheel loader on rubber tires: it drives itself down the road to the job (no lowboy needed) and its 3 yd bucket scoops up to 16 pieces at once, so it fills a tri-axle dump truck in a few passes and clears a storm or lot-clearing mess fast. Lower the bucket (hold G), drive into a push pile or loose debris and press E to scoop; raise it (hold T) beside a truck or trailer and press E to dump.' });
HC.BLURB.loader = 'Rubber-tired loader: drives to the job on its own, scoops 16 at a time, fills trucks fast.';
Object.assign(HC.EQUIP.tractor, { price: 19500, cap: 9, speed: 92,
  help: 'Cab tractor: drives to the job at road speed and tows a dump or equipment trailer behind it, runs the bush hog off its PTO (the only machine that can), and its front-end loader scoops 9 pieces (clamp-on forks lift pallets). G lowers the bucket, E scoops, T raises it and E dumps into a trailer or truck. Back up square to the bush hog and press Q to hook it on; hold left click to cut.' });
HC.BLURB.tractor = 'Road-speed tractor: tows a trailer, runs the bush hog, loader scoops 9, takes pallet forks.';

// the field service truck (its work is in realism.js)
  HC.EQUIP.servicetruck = {
  name: 'Service Truck (crane, compressor, tool body)', short: 'Service', move: 'car', speed: 140, turn: 2.0, r: 18, mass: 6,
  fuelCap: 150, fuelUse: 0.35, wear: 0.02, price: 39000, repair: 9, tows: true, hitchOff: 40, wheelbase: 4.4, service: true,
  help: 'A crew-cab service truck with a tool body, air compressor and a knuckle crane. Park it beside a machine and press E: it gets a broken-down machine running again, does the oil change and grease, and repairs wear at shop prices, right on the job. It winches stuck machines out of the mud, and tows any bumper-pull trailer (not goosenecks or the lowboy).',
};
HC.BLURB.servicetruck = 'Field service truck: repairs, oil and grease on site, winches machines out of the mud, tows bumper-pull trailers.';

// ---------- seasons: snow on a lot to plow, salted pavement, fallen leaves to clean up ----------
HC.T.SNOW = 15; HC.T.SALT = 16; HC.T.LEAVES = 17;
// firewood balance: a log split into ~3 units still beats the sawmill (~$65 a log), but by less, and fall/winter demand (seasons.js) pushes it up 35-50%
HC.FIREWOOD_SUPPLY = 40; HC.FIREWOOD_STAND = [62, 86];

// ---------- a squatted show truck: a lifted, raked half-ton crew cab on big polished wheels. Quick and loud, but it only pulls light trailers ----------
HC.EQUIP.squat = {
  name: 'Squatted Show Truck (crew cab, 24s)', short: 'Show truck', move: 'car', speed: 178, turn: 2.2, r: 17, mass: 3,
  fuelCap: 100, fuelUse: 0.34, wear: 0.025, price: 46000, repair: 9, tows: true, hitchOff: 36, wheelbase: 3.68, lightTow: true, showLights: true,
  help: 'A lifted, squatted half-ton crew cab on polished 24s and mud tires, with LED grille bars and rock lights (press L at night). It\'s the fastest thing you own on the road, but the rake and the lift mean it only pulls light bumper-pull trailers: the dump trailer, chippers and the log splitter. No goosenecks, no equipment trailer, no lowboy.',
};
HC.BLURB.squat = 'Raked, lifted crew cab on chrome 24s with rock lights. Fast, flashy, light trailers only.';
