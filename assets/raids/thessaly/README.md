# Thessaly, the Plague Warden

`arena-storm.png` is the live painterly arena, generated and edited with
built-in ImageGen using the user's storm-woman and undead landscape references.
Thessaly is a storm given a female body, bound to the dead pits beneath the
old plague wards. Her pale face and flowing silver hair rise above a cloud
body; broad ruined wall masses and quiet uneven paving preserve the courtyard.
Distant architecture is suggested through dark teal mist. There are no painted
raiders or lightning bolts. `prompts-storm.json` records the generation and
edits. `arena.png` and `prompts.json` retain the earlier hooded concept; that
painting is excluded from the release. The game supplies its own party/state.

Four fresh transparent assets were generated with built-in ImageGen:
`storm-clouds.png`, `courtyard-mist.png`, `body-clouds.png` (four distinct
formations each in a 2×2 atlas), and `hair-wisps.png` (one silver wind sweep).
`prompts-atmosphere.json` records their complete prompts. These are new shapes,
not crops of the background or reused Ashmaw smoke. Original RGBA files are
preserved; the renderer caches smaller alpha sprites with feathered cell edges.

`ThessalyArenaRenderer.js` animates those clouds and mist, spores and small
spectral wisps at the eyes and hands. A slight linked waist/shoulder rig sways
the new body clouds by less than a degree. Connected strips bend the new hair
sweep from fixed roots to moving tips; fourteen fine trails extend the silver
ribbons into the wind. Her face, hands and terrain stay fixed.
Separately drawn seeded lightning branches
crackle outward around her silhouette, with short faded bursts and no full
scene flash. Lightning can be disabled in the preview or with `lightning:false`.
The upper sky drifts slowly in one direction and fades before each hidden
reset. The banks are spread apart at roughly half their original opacity, with a broader
sky mask that excludes the ward tower; no scenery is used as moving texture. Mist
banks vary in aspect, tint, drift direction and pace:
low ground haze, heavier pit billows and thin spectral wisps are staggered
with seeded phase offsets instead of synchronized repeated puffs.
Custom courtyard mist is clipped to a softened colour mask of the painting's
green haze. Low clouds and curling wisps follow the broken ledges and pits
without covering every paving slab; `courtyardMist:false` disables that layer.
A deterministic 16-second phase closes the loop, including a bolt spanning
the boundary. Native combat hazards remain disabled. `bodyClouds`, `hairMotion`
and `spectralWisps` can be disabled separately, beneath the `bossMotion` toggle.

`ThessalyScene.js` mounts the pointer-transparent artwork beneath native Guild
raid controls, caps live rendering at 1440 × 720, honours reduced motion,
pauses while hidden/offscreen and releases buffers/listeners on cleanup. A
missing atmosphere asset is optional; a missing painting restores native art.

`npm run preview:thessaly` writes `output/thessaly-arena/` for the existing
workspace preview server. Ownership, encounter transitions, loop continuity
and lifecycle checks run in `npm test`. The unpacked-extension browser suite
also checks native controls and responsive raid layout for both bosses.
