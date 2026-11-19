# Hollow Creek: Land & Timber

A 3D open-world forestry, land clearing and landscaping business sim, with machines and trucks modeled
to real-world dimensions (1 tile = 3 m).
Plain HTML, CSS and JavaScript, with Three.js for 3D and Web Audio for sound. All art is built in code
and there are no outside assets.

**To play, open `index.html` in a browser.** Keep the `lib/`, `js/` and `css/` folders next to it.
It works from `file://` with no internet (the fonts fall back to system fonts when offline).

## How it plays

You run a tree and land outfit out of an equipment yard in the town of Hollow Creek: curving roads,
a creek with crossings, a pond, rolling hills, forest and wildflower meadows, and nine customer properties.

1. **Customers call in** through the day. Press **J** for your phone. Each call is a work order with
   the customer's request, their offer and a par time. **Accept**, or **counter** at +20% (a better
   rating makes them more likely to agree; a "no" means they hire someone else).
2. **You're one operator.** Only the machine you're sitting in can drive or run its tool; parked
   machines sit empty. Press a machine's number key and you're in its seat (the one you left shuts off).
   Press **F** to climb out and walk around, and **F** beside any machine to climb back in.
3. **Load up. Nothing teleports.** Everything starts parked in your yard's bays and shed.
   * In a truck, back the hitch up to a trailer's coupler and press **R** to hitch it (R again drops it;
     the equipment trailer's ramps come down when dropped).
   * Drive a machine up onto the equipment trailer or lowboy deck, stop, and press **E** to strap it down.
     **E** again releases it.
   * Walk a crew to a truck and press **E** to ride along. Press their number key to let them out.
4. **Drive to the orange pin.** The job clock starts when your first piece of equipment arrives.
5. **Do the work**, then **haul debris** in a dump trailer, the dump truck or the log truck to the log &
   dump pad at your home yard and press **E**. Logs sell; brush, rock and stumps cost dump fees.
6. **Invoice** when the checklist is done. Equipment stays where you left it. Bring it home: the shop
   only fuels and repairs machines parked at a yard you own, and machines left out overnight in the
   rain lose condition.

Customers pay 15% more than they used to and allow half again as long. Four- and five-star jobs often come with a tip.

Money is in dollars: customers and log sales pay you; fuel, dump fees, damages, repairs, wages,
equipment, trailers, yards and crew cost you.

## Jobs

| Job | Typical equipment |
| --- | --- |
| Tree removal (flagged trees; grinding the stumps pays a bonus) | Chainsaw, skid steer or excavator, dump trailer |
| Lot clearing (everything inside the tape, including brush and rocks) | Chainsaw, skid steer/excavator, chipper, dump trailer |
| Stump grinding | Stump grinder, or the excavator to rip stumps out whole |
| Forestry mulching (brush and saplings; keep off the keeper trees) | Skid steer + mulcher head, or the tracked mulcher |
| Sod and planting | Mower, pallet forks (plus the sod, shrubs and mulch it lists) |
| Hardscape patio (pull the rocks, lay the pavers) | Skid steer, pallet forks (plus the pavers it lists) |
| Bush hogging (cut an overgrown field: tall grass, briars, saplings) | Tractor + bush hog |
| Timber harvest, out on a woodland tract (fell the marked timber, buck it, skid the logs to the landing) | Chainsaw or harvester, skid steer or forwarder |
| Woodland clearing, on a tract (push over saplings, grub out brush and stumps, pile it all) | Any dozer or the track loader |
| Storm cleanup (trees already blown down across a yard) | Chainsaw, skid steer, dump trailer |
| Brush chipping (the customer's own brush piles) | Chipper (feed it by hand: stand at the infeed and hold click), skid steer |
| State storm contracts (see below) | Chainsaw, loader or grapple, dump truck |

**A fresh start.** A new company starts with $30,000 and an empty yard: you buy your own truck, trailers, machines
and chainsaw. (Older saves keep what they own.)

**Used equipment marketplace.** The shop's *Used* tab lists five to seven second-hand machines, trucks and trailers,
usually 15–70% under the new price but worn (the shop repairs them). A new batch comes in every four game hours, and
a good deal can be gone by then.

**The big map.** Click the minimap (bottom right) to open a big labelled map: road names, yards, the job, co-op
friends. Click it again or press Esc to close.

**Storms and state contracts.** After a stormy or windy night, big roadside trees come down across two or three
stretches of county road. The state DOT takes bids for the cleanup for two hours: the state's estimate is shown,
the rival outfits' bids aren't, and the lowest bid wins. Win, and you have eight hours to buck the trees and get
every log and limb off the pavement; the state pays your bid (docked 40% if you're late). Lose, and the other
outfit cleans it up later that day. The phone (J) lists open contracts; red X marks on the map show the damage.

**Chainsaws.** There's no ground crew any more: you are the one on foot. Buy a saw in the shop (six sizes, from a
35cc top-handle to a 120cc, 42" big-bar saw); bigger saws cut faster. Climb out of a machine with F and press G to
pick up the saw. Buying a new saw trades in the old one for 40% of its price.

**Mowing.** Each 3 m tile of tall grass is a 3 × 3 grid of 1 m patches, drawn as real 3D grass near the camera. A
deck cuts the patches it passes over, so a 48" deck takes about three passes down a strip and the 96" wide-area
mower one. Thick grass slows the mower; clippings blow out the side chute.

## The fleet

Number keys follow your owned fleet in order (shown on the HUD bar); **[ ]** cycle through it.

| Equipment | Notes | Moves on |
| --- | --- | --- |
| **Chainsaw** (an item) | You hold it on foot and fell and buck; six sizes in the shop. **G** picks it up / sets it down. To fuel it, carry it to a truck or a pump at a yard you own and press **E** | Carried |
| **Mowers** | 48" residential zero-turn (starter price), 61" commercial zero-turn, 52" stand-on, 96" wide-area with wings | Equipment trailer |
| **Track loader** (crawler, 27 t) | Bucket down: pushes like a dozer and strips ground. E scoops 12 pieces. Slow to push trees over | Lowboy |
| **Tri-axle dump truck** | 44 units, still tows a trailer | Drives |
| **Tandem chip truck** | 64-unit enclosed chip box; pulls a chipper | Drives |
| **Mini track loader** (stand-on, starter) | Small grapple loader you start with: carries 3 pieces. Same controls as the skid steer | Equipment trailer or lowboy |
| Skid steer (CTL, bought) | Carries 5 pieces with the grapple. Removable attachments: **Q** drops the one on the quick-attach or locks onto one in front. Grapple: lower the arms (**G**) to grab, raise them (**T**) to dump into a load | Equipment trailer or lowboy |
| Mulcher head (attachment) | Open toothed rotor, push bar. Lower it to the ground and hold click | Rides the skid steer, or sits on the ground / a trailer deck |
| Stump grinder (tracked) | Hold click over a stump | Equipment trailer or lowboy |
| Zero-turn mower | Drive over tall grass | Equipment trailer or lowboy |
| Mini excavator (3.5 t) | 2 pieces, shorter reach, slower stump pulls | Equipment trailer |
| **Excavator with thumb** (13 t, heavy) | 3 pieces, long reach, rips stumps out whole. Boom is manual (T/G): low to grab or dig, high to dump | Lowboy only |
| **Compact dozer (D3)** / **Crawler dozer (D6)** (heavy) | Pushes over everything in its path (trees of any size, brush, stumps, logs, rocks) into one **push pile**. Back up to leave the pile, then load it piece by piece with a grapple. The D3 strains on big trees. Hold click to cut the blade in | Lowboy only |
| **Wheeled harvester** (heavy) | Fells, delimbs and cuts a tree to length in one cycle, with almost no spread | Lowboy only |
| **Forwarder** (heavy) | E cranes logs onto its bunks (24 units); E at a log truck, the log trailer or the pad unloads | Lowboy only |
| **Tracked forestry mulcher** (heavy) | About 2× the skid steer head, wider swath | Lowboy only |
| Disc chipper / **18" whole-tree chipper** | Tow-behind; a crew member feeds it (big one takes logs too, 2× speed). Makes **wood chips**: into the chip truck it's hitched to, a dump body under the chute, or a pile | Hitched to a truck |
| Crew truck, second truck | Tow any trailer except the lowboy | Drives |
| **Fuel & service truck** | Carries 2,400 units of fuel and a hose reel: park beside any machine or truck (even one that ran dry) and press E to run the hose. Refill it at an owned pump | Drives |
| **Tandem-axle dump truck** | 30-unit box, still tows a trailer | Drives |
| **Heavy-haul tractor** | Tri-axle; pulls the lowboy and keeps its speed with a big machine aboard | Drives |
| **Utility tractor with loader** | Front-end loader (G lower, E scoop 6 pieces, T raise, E dump) and a rear three-point hitch for the **bush hog** (Q hooks it, hold click to cut). Drives up the ramps and straps down (E) on the equipment trailer, deck-over or lowboy | Drives, or rides a trailer |
| **Wheel loader** | Articulated, scoops up to 10 pieces of a push pile at once into trucks and trailers | Lowboy only |
| **Chip truck** | White cab-and-chassis with a tall enclosed 40-unit chip box. Hitch a chipper behind it: the chute blows chips straight into the box. X tips the box | Drives |
| **Horizontal mulch grinder** | Feed brush and logs into the hopper; mulch rides the conveyor into a dump trailer or truck parked under it (or piles up) | Lowboy only |
| **Lifted dually pickup** | Built to a 2000 1-ton SuperCab long-bed dually (6.76 m long, 4.01 m wheelbase, 2.44 m over the fenders), white over tan, 35" mud tires on polished wheels. Tows any trailer except the lowboy, crews ride along | Drives |
| **Dump truck** | Own 18-unit bed and a hitch | Drives |
| **Knuckleboom log truck** | E cranes logs aboard (30 units, logs only) | Drives |
| **Bucket truck** | Parked by a tree: felling spread −75%, hazard trees can't let go early | Drives |
| **Semi tractor** | The only rig that can pull the lowboy | Drives |

Trailers: equipment trailer (2 small machines), dump trailer, **25 ft deck-over** (two small machines or one up to 9 t, any truck tows it), **lowboy**, second dump trailer, **log trailer** for the semis (40 units, logs only).
**Selling equipment.** The Shop's yard services list has a Sell button on every machine parked at your yard (about half the new price, less when worn); trailers and attachments sell from their own list. Press Sell, then Confirm.
**Buying more than one.** Every machine and trailer card has a *Buy another* button; extras become
"Skid Steer #2", "Lowboy #2" and so on, each with its own fuel, condition, parking spot and key.

Yards: Home Yard (office, repair shop, equipment compound with pole shed and bays, log & dump pad,
pump) and **Ridge Yard** for sale across town. The Home Yard can be **expanded twice** (more trailer bays, then a second pole barn).
**Hollow Creek Landscape Supply** (east end of Hollow Creek Rd) buys mulch ($34/unit) and wood chips ($20/unit) on its sales pad.
**Stone Creek Quarry**, a terraced open pit with a crusher, screener, conveyor and stockpiles, is for
sale too: own it and rocks unloaded on its sales pad earn $45 each instead of costing a dump fee.

**Felling.** The cone on the ground shows where a tree can land: green is clear, amber means part of the
cone hits something, red means the aimed line does. Wind widens cones; a climber hire or the bucket
truck narrows them. Hitting a house, fence, power line, keeper tree or your own crew costs money and quality.

**Moving parts.** Every wheel rolls with the distance travelled (outer wheels faster in a turn), road vehicles' front wheels steer, track links run around the sprockets, the harvester, forwarder and wheel loader bend at a centre hinge, and the loader arms, booms and three-point hitch follow T/G.

**Physics.** People accelerate and face where they walk; machines accelerate by weight (trucks also by
trailer and load), steer with a real turning radius, slow on hills, in tall grass, mud and rain, and a
hard hit stops you and costs condition. Real top speeds: skid steer ~15 km/h, big iron 10-13 km/h. On foot you walk at a brisk ~17 km/h and Shift sprints at about 30 km/h. Fuel tanks are generous: every machine holds twice what it used to.

**Debris rules.** Every job card says what happens to the debris: *Haul away*, *Pile on site*, *Leave in
place*, *Logs to the landing* or *Chip it*. On haul-away jobs anything still lying on the property at the
invoice (even if you dumped it back out) is illegal dumping: $40 a piece and a hit to the rating. Tipping
logs, brush, stumps or rocks out anywhere other than the job, your own yard or a pad is fined on the spot.
Products (firewood, mulch, chips) can go anywhere.

**Where debris goes.** Logs sell at **Hemlock Hollow Sawmill** (timber country, 30% over the old pad price).
Brush, stumps and rock go to the **County Brush & Stump Dump** on Bottom Rd: brush $30 a unit, stumps and
rock $12 a unit; logs are taken free there. Press E on either pad, or tip the load out (X) on it: same
thing. Anything left lying on a pad is taken in. Your yards no longer buy debris: each has a **debris
storage** area where you can tip loads for free and come back for them later. Dumped loads land as
separate pieces, spread out behind the box.

**Landscaping materials.** There's no landscaping crew any more. Buy sod, shrubs and pavers on pallets, and
bulk mulch by the unit, in the shop (Landscape supply); it all waits in the pickup area at the landscape
supply. Pallets need **pallet forks** (skid steer, mini skid, or clamp-on forks for the tractor's loader) and
ride on flat deck trailers or the flatbed pickups' beds (never dump trailers). Mulch loads with a grapple or
loader into a dump trailer or truck. Every sod and hardscape job card lists exactly what to buy and bring.
On the job, park near the marked tiles, climb out (saw down) and hold click on each tile.

**Mowing.** Contract lawns no longer grow tall grass right against houses, porches, trunks or fences, and the
grass that still needs cutting on the job glows yellow.

**Firewood.** Buy the Firewood Yard on Hemlock Hollow Rd and the firewood processor, which is installed there for good. Load logs on its
side deck with a grapple, loader or excavator; it saws and splits them and the conveyor drops firewood into a
dump trailer or truck parked under it (or a pile). Back the load up to the roadside stand to stock it (60
max): drive-by customers buy a bundle or three now and then for $50–70, busiest around lunch and late
afternoon. Leftovers sell at the landscape supply for $28.

**Gooseneck trailers.** The flatbed pickups and the dually have a ball in the bed. The 16 ft gooseneck dump
(high sides, 18 units) slides its ramps out from under the box when it's empty, so one small machine can
ride in it; it takes no load while a machine is aboard. The 40 ft gooseneck flat deck on three axles carries
three small machines, or one up to 9 t plus a small one.

**Due dates and a second job.** Every job you take has a generous due date (two working days, plus a day for
every five hours of par), shown on the job card and the checklist. Run past it and the customer won't pay and
leaves a 1-star review. With any hired help you can book a second job: its site is set up right away and it
waits on hold; drive onto that property (or press *Work this one now*) and it becomes your current job, with
its checklist and clock where you left them.

**Co-op job board.** Everyone in a co-op game sees the host's job board. When anyone takes a job it comes off
the board for everybody.

**More jobs.** Lawn mowing, hazard tree removal (dead trees leaning at the house), firewood delivery, mulch
delivery, field rock picking and fence line clearing (mulcher head or brush cutter).

**Trailers.** The gooseneck dump is now a 20 ft box (26 units, 8 t, two small machines when empty). A 16 ft tandem
dump trailer holds 18. The old "bigger dump trailer" upgrade is gone (refunded). Logs take one spot on log
trucks, the log trailer and the forwarder. Loads in dump boxes are heaped like the real thing. Attachments set
down near a trailer deck (at any arm height) land on the deck. Yards have three-bay concrete-block bins in their
debris storage. The firewood processor comes with the Firewood Yard ($30,000). Equipment prices are about 10% higher.

**Loading limits.** Every flat trailer has a rated payload and won't take more: 20 ft equipment trailer 5 t,
deck-over 10 t, 40 ft gooseneck flat deck 13.5 t, gooseneck dump 6 t (one machine, empty box), lowboy 40 t.
Machines, pallets and attachments all count, and the towing hint shows the load. A flatbed pickup's bed holds
2.5 t of pallets or attachments (raise the arms and press Q to set an attachment on it), but not while a
gooseneck is hitched in the bed, and a gooseneck won't hitch until the bed is clear.

**Bigger stump grinder.** A 55 hp articulated 4x4 stump grinder with the wheel on a boom: grinds about 2.4x as
fast as the walk-behind; the operator stands at the rear console.

**Also new.** A large 110 hp track loader (grabs 7, mulches and cuts 45% faster, rides the deck-over or a
gooseneck). Excavators are stronger (the big one grabs 5, the mini 3; faster swing, boom and stump pulling)
and their arms bend at the boom, stick and bucket. Fuel lasts nearly twice as long. In co-op, buy extra
chainsaws and more than one of any attachment. Name your save slots on the title screen (Rename) or in
Company > Game; the version number shows on the title screen. Camera modes: C or Company > Game.

**Systems.** Fuel (trucks carry it; pumps at owned yards), wear and repairs, weather (sun, overcast,
wind, rain, storms), an 8 AM–6 PM day with wages, ratings and tiers, upgrades, crew hires, and saving to
localStorage, including where every machine and trailer is parked.

## The town

About 1.1 km × 825 m, with timber country to the east and south (Pine Knob, Cedar Bluff and Hemlock Hollow
roads lined with woodland tracts, each with a skid trail and a log landing): eight paved roads (7.2 m pavement, edge lines, 3 m / 9 m centre dashes, gravel
shoulders), gravel logging roads, a creek with bridges, two ponds, farm fields, forest and meadows, and
20+ customer homes in six styles (ranch, colonial, Cape Cod, farmhouse, log cabin, modern), some with
attached garages. Fences run on tile centres so corners close.

## Co-op with friends

On the title screen, **Host co-op** opens your company (the selected save slot) and shows a 5-letter room code.
Friends type their name and the code, pick which of their own save slots to bring, and press **Join**. Up to 4 players.

* **Everyone has their own company** by default: their own yard (Yard B, C or D on the host's map), machines,
  jobs, bank, invoices and save. Each player's computer runs their own company; the world is shared, so you
  see each other's machines, and trees cut, brush cleared, ground worked and job sites show up for everybody.
  Two companies can't take a job on the same property.
* **Working together.** A friend can press *Work for the host* in the co-op box (the host says yes), or the host
  can *Invite* them. Then they use the host's machines, take the host's jobs, buy from the host's shop with the
  host's bank, and see the same invoices; two people can ride in one machine. *Back to my company* returns them
  to their own company, which was saved and waits for them.
* **Paying each other.** The co-op box has a *Pay* button beside each player. The host can pay a friend who works for them (it goes into that friend's own saved company), and companies can pay each other.
* Connections go through PeerJS, a free public WebRTC service, so co-op needs an internet connection. Some strict
  school or work networks block it.
* Everyone must have the same version of the game: after an update, all players reload the latest copy.

## Save slots

The title screen has three save slots. Each card shows the bank, day, jobs, rating and fleet size, with Play, New and Delete (Delete and overwriting ask first). *Continue* picks up the slot you played last. A save from before slots existed appears as slot 1.

## Shop extras

* Every machine and trailer listing shows a rendered preview of it.
* **Codes** (top of the Shop tab): `BIGBUCKS` adds $1,000,000. `HOLLOWADMIN` unlocks every machine,
  truck, trailer, yard, upgrade and crew hire, top-tier work and $250,000, for testing.
* Company tab: turn cartoon outlines on or off (off by default for the realistic look).

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Walk (camera-relative) or drive (S reverses) |
| Mouse | Aim felling direction and tools |
| Hold left click | Use the tool |
| 1–9, 0 · [ ] | Jump into a machine (or take control of a crew) · cycle the fleet |
| E | Interact: grapple, strap down/release, ride along, refuel, unload at the pad, crane logs |
| R | Hitch or drop a trailer (in a truck) |
| X | Tip the load out of a dump truck or dump trailer. On a log & dump pad it's unloaded and paid like E; elsewhere it makes a pile (debris off the job and away from your yard is fined) |
| C | Camera: Auto, Follow behind, Free, Overhead (also in Company > Game) |
| G | Pick up or set down the chainsaw (on foot) |
| F | Climb out of the machine you're in, or into the one you're standing beside |
| Q | Drop / pick up an attachment (grapple, mulcher, brush cutter, forks, bush hog) |
| T / G | Raise / lower arms or boom (G on foot picks up the chainsaw) |
| Shift | Sprint on foot |
| J (or Tab) | Phone: calls, shop & yard, company |
| Right-drag / wheel | Turn / zoom the camera |
| Esc / M | Pause / mute |

## File structure

```
hollow-creek/
  index.html        canvases, HUD containers, script tags (load order matters)
  lib/three.min.js  Three.js r149 (MIT), bundled so the game runs offline
  css/style.css     HUD, phone, shop, invoices
  js/util.js        HC namespace, math and geometry, seeded random
  js/audio.js       Web Audio: synthesized one-shots and engine/saw/grinder loops
  js/data.js        Tables: trees, equipment, upgrades, crew, weather, jobs, customer requests
  js/save.js        Company state, upgrade lookups, localStorage save/load
  js/lot.js         Builds one property: house, drive, fence, power line, scenery
  js/world.js       The open world: spline roads, creek, pond, heightmap, forest, lots on both sides of the road, equipment yards
  js/units.js       Movement models, collisions, towing/hitching, strapping to decks, crews riding, saw crew and skid steer
  js/equipment.js   Grinder, chippers, all trucks (beds, log crane, bucket), excavator, tracked mulcher, mower, landscaping crew
  js/game.js        World session: accepting jobs, arrival, felling physics, penalties, hauling, calls, day clock, invoicing
  js/jobs.js        The other five job types: estimates, generators, checklists; counter-offers
  js/render.js      Three.js renderer: toon shading with outlines, merged low-poly models, camera, weather, lighting
  js/ui.js          Title, phone, HUD, minimap, invoices
  js/net.js         Co-op: host/guest networking (PeerJS), state sync
  js/main.js        Input and the main loop
```

## Architecture

* **The simulation is 2D; the view is 3D.** Everything moves on a ground plane in pixel units
  (32 per tile). The renderer maps that to Three.js at one world unit per tile. Felling, collisions
  and damage checks are 2D geometry; the 3D tree topples around its base toward the same angle.
* **One world, many jobs.** `world.js` draws Catmull-Rom roads and a creek, builds distance fields, places
  lots facing the road on either side (south-side lots are mirrored), adds the yards, forest, meadows,
  boulders and power lines, then a heightmap that is flat at roads and lots and dips under the water. A parcel's house and fence come from a fixed seed, so a property looks the same
  every visit. Accepting a job regenerates only that parcel's contents.
* **Look.** Models are built in metres from published dimensions (compact track loader ~2.1 m tall,
  12" disc chipper ~5 m long, 13-ton excavator ~2.5 m wide, 35-ton lowboy with a 22" deck, people 1.8 m),
  merged into one mesh each with vertex colours and drawn with physically based materials, ACES filmic
  tone mapping, soft shadows and a sky dome. Optional outlines are a back-face copy pushed out along
  per-part normals. Trees and shed roofs between the camera and you fade out.
* **Roads** are Catmull-Rom splines; branches are trimmed to end on the centre line of the road they join,
  and all roads are painted together in layers so intersections merge, with no centre dashes inside them.
* **Logistics.** Trailers are objects with a coupler; a truck's hitch drags the coupler and the trailer
  follows (with a jackknife limit and snagging on trees, houses and water). Machines strapped to a deck
  ride a slot; crews in a truck ride with it. Dump and log trucks carry a fixed "bed" trailer.
* **State.** `HC.company` (saved) holds money, rating history, equipment, trailers, yards, fuel, condition,
  upgrades, crew, the job board, the active job and the position of every machine and trailer. `HC.session` is the live world.
