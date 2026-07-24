# Digital Table Habits: What TTS Players Actually Do With Their Hands

*An exploration of Tabletop Simulator's fidget culture, the mechanics that enable it, and
tactile-joy lessons from other digital card games — as input for unbrewed's 3D interactions.*
*Research date: 2026-07-24. Three parallel research passes: TTS mechanics, TTS player culture, cross-game juice.*

---

## 1. The headline insights

1. **The fidget layer is player-demanded, not designed.** TTS's table flip was never planned —
   developer Kimiko: it was "never something we were going to add in, but the public spoke";
   community members call it "quite literally the most requested feature." Hearthstone built 33+
   boards full of clickable toys for the stated reason that **players of physical games fiddle with
   something between turns**. If you don't build the fidget layer, players will ask for it — or
   worse, the table will feel dead.

2. **Gesture carries emotion; the game state doesn't care.** The purest example: conceding a pot in
   TTS poker, you can "neatly stack a pool of poker chips to be handed over to the victor, or you can
   flick each one individually." Identical outcome, opposite mood — gracious vs. passive-aggressive.
   Joy lives in having *physically distinct ways to do the same thing*.

3. **Players choose effortful gestures over efficient ones when the gesture feels right.** TTS has an
   R hotkey to roll dice — and players still "gather the dice, shake the mouse back and forth and
   then release the dice across the table." A roll whose animation doesn't look like a legitimate
   tumble "doesn't count" emotionally, even when it's fair. Never remove the slow way just because a
   fast way exists.

4. **Hands are body language.** Players read each other's cursors like faces: "Gameplay gets smoothed
   out as you know what other people are looking at during games as people's hands hover over
   important cards." The same signal is also a tell players want to suppress ("I don't always want my
   opponent(s) to see what I'm mousing over"). Visible hands = co-presence; make hiding them an option.

5. **Every beloved fidget needs an off-switch.** The same action is delight or vandalism depending on
   consent. TTS's whole mitigation stack exists because of this: per-player flip permission, object
   Lock, semi-lock at rest, undo/rewind arrows, host physics options. "Serious" tables turn the toys
   off as standard setup practice.

6. **Automate the chores of physicality, preserve the pleasures.** What players are glad to lose:
   shuffling a 200-card deck, scoring, setup/teardown. What they mourn: handling, at-a-glance table
   layout, table presence. Failed adaptations automate both.

---

## 2. The habit catalog — what TTS players actually do

### Emotional rituals
- **Table flip as sanctioned tantrum.** Official marketing: "the only simulator where you can let
  your aggression out by flipping the table!" Achievements ritualize it (Rage Quit = 100 flips,
  Ultimate Rage = 1000+). It's a punchline for losing, and players farm it as a joke they commit to.
- **First-session flip spree.** Steam reviewer: "I bought it, flipped the table over and over, and
  threw stuff around, then closed it out after 30 minutes." The physics toybox IS the onboarding.
- **Theatrical move-making.** "Cards can be individually flung across the table. Chess pieces can be
  picked up, knocked over, or tossed aside." The gesture carries the attitude, not just the state change.
- **Chip flicking vs. stacking** (see headline insight #2) — concession as expression.
- **Dice superstition.** Players re-roll for feel, object to rolls that look wrong ("It's a little
  disconcerting when the die goes up without rotating and comes down"), and press R multiple times
  "for additional randomization."

### Social/teasing gestures (the lockdown-era love language)
- **Throwing components AT people, not the board.** "throw my poker chips at whomever I please";
  "grab his figurines from his side of the board and throw them back at him." One reviewer credits
  exactly this with closing emotional distance during remote play — physical banter with no body in the room.
- **Snatching a card from an opponent's hand and revealing it** — the real-world taboo you can only
  do because it's a sandbox; social violation as play.
- **Sharpie graffiti.** "taking a sharpie to the board and drawing profanities all over my claimed
  Catan tiles." TTS caps drawing at 10,000 lines *per player* — a cap that exists because people draw that much.
- **Escalation bits.** Resizing dice "to be as big as the table, which knocked over all of our
  pieces when rolled"; setting the gravity slider to zero as a group joke. Breaking the game as a bit.

### Idle fidgeting
- **Solo chaos with no audience:** "I tried to play one game solo… and just ended up throwing cards
  all over the table." The fidget urge fires even alone.
- **Flick tool as skill-shot toy** — pull back, watch the force line, release. A whole Workshop genre
  grew around it: tabletop bowling, pool, air hockey, Jenga, curling, marble runs — mods whose entire
  content is the physics, no rules layer at all.
- **Cursor hovering while thinking** — the unconscious fidget that doubles as a tell (headline insight #4).

### Anti-patterns (the same coin, other face)
- Friends spam-flipping the table until the host disables it ("I'm sick of them throwing the table around").
- The flick tool feared as "the favorite tool for trolls." Dev response: host options, permissions, sandbox stays sandbox.
- Serious buyers repelled by chaos-first marketing; guides list "prevent people from flipping the
  table" among the standard setup fixes.
- Physics wrecking legitimate play: default dice rolls crash into the board and knock over pieces
  until physics settings are tuned. The critique crowd ("I don't want a physics simulator, I want a
  dang board game") notes drag-heavy manipulation is also an ergonomic strain cost.

---

## 3. The verbs — TTS mechanics worth stealing (curated)

The full pass catalogued ~70 interactions; these are the ones with the highest joy-per-effort for a 3D client:

| Gesture | Effect | Real-life analogue |
|---|---|---|
| Hold + move fast, release | Object flung with momentum | Tossing a piece |
| Shake held deck | Shuffles it | Riffling a deck in your hands |
| RMB-tap held deck on table | Shuffle + "square it up" sound | Tapping the deck square |
| Shake + release dice | Physics tumble roll | Cupped-hands cast |
| RMB while holding | Gentle "tap down" placement (vs. drop) | Tapping a card down, MTG-style |
| Long-press stack | Grab the whole pile | Scooping with your hand |
| Sticky (default on) | Tokens ride along when you lift the card under them | Lifting a card with its counters |
| Auto-raise (default on) | Held objects lift over obstacles | Carrying your hand above the board |
| ALT+SHIFT peek | Look at underside — **and other players are alerted** | Sneaking a look, visibly |
| ALT hover | Hold card up close (zoom preview) | Bringing a card to your face |
| N-key nudge | Push pieces away from pointer | Brushing pieces aside with the back of your hand |
| U key | Slide object *under* another | Tucking a card under a mat |
| Ghost preview | Shows where a held piece will land before release | Hovering over a square before committing |
| Snap points + grid | Held piece gravitates to legal spots | Printed card slots guiding placement |
| Esc while holding | Object returns exactly where grabbed | Undo a mis-grab |
| Knocked off table | Piece floats back at the table edge (no void) | Picking it up off the floor |
| Per-object physics material | Drag/friction/bounciness — metal feels like metal | Component weight |
| Flick tool | Pull-back force line, crokinole-style | Flicking a disc |
| Single-click ping | Rotating arrow in player color + chime | Pointing at the board |
| Blindfold (B) | Black out own view, logged in chat | Closing your eyes during hidden setup |
| v11.1 grab polish | Pieces *smooth-rotate* into orientation on grab, never snap | A piece settling naturally into your hand |

Full mechanics catalog with sources: kb.tabletopsimulator.com (basic/advanced controls, tools, physics pages).

---

## 4. Lessons from the rest of the genre

- **Balatro** (2025 Apple Design Award for *Delight and Fun*): hover tilt toward cursor, spring
  wobble on settle (±3° overshoot), two lift tiers (hover vs. selected), neighbors pushed aside with
  inertia when reordering, screen shake tiered by score magnitude, audio pitch synced to number
  rolls. Thesis from the analyses: **feedback is the product, not the polish** — strip it and you
  have a spreadsheet. LocalThunk tunes by feel: a picture frame that *feels* level beats one that is.
- **Hearthstone**: cards waver in hand; they *slam* onto the board; boards are covered in clickable
  fidget toys (catapults, shatterable eggs, a 1/10,000 golden vegetable) built explicitly because
  players fiddle between turns; hidden ordered-click secrets give the toy layer a discovery ceiling;
  bounce/over-rotation is a house-wide UI physics rule, not a card feature.
- **Inscryption**: all game state lives on physical props (scales that tip, teeth as weights,
  candles); you can stand up and leave the table — the ability to stop playing and touch something
  else IS the fidget layer. Fans built physical replica box sets — reverse-engineering digital props
  back into objects is the strongest tactility compliment there is.
- **Solitaire**: the win cascade — trivial physics (constant x-velocity, gravity, damped bounce),
  known to 400M+ people, now cultural shorthand for "win." A terminal state converted into a toy
  that plays itself.
- **Slay the Spire**: the critical counterweight — **fully interruptible animations**. Play as fast
  as you want; the juice runs behind you. Juice must never gate input.
- **Marvel Snap**: the entire progression economy is denominated in card *physicality* (flat → frame
  break → 3D parallax → animated). Players grind for feel itself. Mobile rare cards tilt with the
  physical device — the player's actual hand is the input.
- **MTG Arena (cautionary)**: heavy animations that obscure board state — "you lose the total
  overview." Juice that hurts legibility is a regression.
- **Wingspan (cautionary)**: the "lost tactility" complaint was really lost *at-a-glance parallel
  information* — a wide table replaced by deep scrollable views. Screens are deep; tables are wide.
  Solve legibility before feel.

### Implementation nuggets (from an itch.io Unity write-up + web-animation practice)
- **Rotate around the grab point, not the card center** — the single highest-leverage detail
  separating "sprite following mouse" from "paper held between fingers."
- Spin from cursor velocity × lever arm from grab point; framerate-independent exponential damping
  (`exp(-damping·dt)`).
- Springs, not lerps: `cubic-bezier(0.34, 1.56, 0.64, 1)` for state transitions; real JS/engine
  physics (velocity handoff, snap notches) for held objects — CSS easing can't fake mass under drag.
- Flick-to-throw: past a velocity threshold, release becomes a throw with rotation from drag direction.
- Holographic/foil shaders are cheap: mask texture + UV-scrolled noise + time/position hue rotation.
- Sound carries the material: card flip = short swish + cardstock snap; shuffle = layered
  micro-transient "waterfall." Close-mic'd per-gesture audio does as much tactile work as any shader.
- Hit-stop (1–3 frame freeze on impact) is underused in card games specifically.
- Swink's game-feel budget: input-to-first-visible-response under **100ms**, always.

---

## 5. What this suggests for unbrewed's 3D interactions

Ranked roughly by joy-per-effort, phrased as candidate behaviors (not commitments):

**Tier 1 — the physics of holding (foundation, mostly shader/spring math, no networking changes)**
1. Grab-point pivot + inertia + spring settle on card drag. The "held paper" feel.
2. Release velocity matters: fast release = toss with tumble; card slam sound scaled to drop velocity.
3. Hover tilt + two lift tiers (hover/selected), shadow deepening with elevation.
4. Neighbors in hand shift aside with inertia when you reorder; damped magnetic snap into the gap.
5. Per-gesture sound: cardstock snap on place, transient waterfall on shuffle, felt thud for tokens.

**Tier 2 — expressive gestures (the ritual layer)**
6. Shake-to-shuffle (with the button alternative kept — effortful path *and* efficient path).
7. Tap-the-deck-to-square gesture with the satisfying sound.
8. Dice thrown by gesture, tumble physics that *looks* legitimate (the emotional-legitimacy rule).
9. A visible peek gesture — tilting a face-down card up — that other players can see happening.
10. Ping (point at the board, colored arrow + chime) and a scribble/marker layer.

**Tier 3 — co-presence (multiplayer joy)**
11. Visible opponent hands/cursors with idle micro-motion — the "I can tell you're thinking" signal —
    plus an option to suppress your own hover (the tell problem).
12. Flicking/tossing tokens at each other — banter physics — host-gated.
13. One sanctioned catharsis gesture (your equivalent of the table flip; even a small one — scattering
    your own hand, tipping your own chair) with undo. It will end up in every clip and review.

**Tier 4 — the fidget toys**
14. One or two non-functional touchables on the table/board that animate and make sound. Include one
    discoverable secret. (Hearthstone's stated between-turns rationale.)
15. Forgiveness affordances everywhere: ghost placement preview, Esc-returns-to-origin, pieces never
    fall into the void, host undo arrows.

**Guardrails (from every anti-pattern in the corpus)**
- Every expressive/chaotic gesture ships with a consent switch (host toggle or per-player permission).
- Juice never gates input — animations interruptible, speed slider available.
- Legibility beats feel: never let an effect obscure board state; keep the table "wide," not "deep."
- Physics never wrecks legitimate play: snap/settle states are authoritative; fidgets act on visuals
  or undoable state only.
- Ethical footnote: skeuomorphic tactility measurably inflates players' illusion of control over
  random outcomes — worth remembering anywhere randomness meets stakes.

---

## Source notes

- TTS mechanics: kb.tabletopsimulator.com (basic/advanced controls, flick/joint/line/zone/gizmo
  tools, physics, player hands), tabletopsimulator.com patch notes (v11.1, v12.4), Steam store page.
- TTS culture: Steam Community discussions & reviews, CGMagazine ("TTS closes the gap of social
  distancing"), Shelfside review, Meeple Mountain ("I don't want a physics simulator…" + comments),
  Entro Games guides, TTS knowledge base. Reddit was crawler-blocked this pass; the player-voice
  quotes above come from Steam and review-site comments instead.
- Cross-game juice: Balatro design analyses (blakecrosley.com, wavebeem.com, Medium), LocalThunk
  interview (rogueliker), Hearthstone design history (wiki.gg, outof.games board-interaction
  hypothesis, ToughArcade pack-opening interview), Inscryption (DiGRA "horrific remediation" paper,
  reviews), Slay the Spire UI analysis (cloudfallstudios), Marvel Snap (Second Dinner interviews,
  seasonedgaming, attackofthefanboy), GDC: "Juice It or Lose It" (2012), "The Art of Screenshake"
  (Nijman), "Don't Juice It" counter-talk, Steve Swink's *Game Feel*, Dislocated Boardgames paper
  (doi:10.3390/mti3040072), itch.io UI-physics drag-drop write-up.
