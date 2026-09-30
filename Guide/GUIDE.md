# Project guide

What Gesture Deck is made of, how to build something like it with Claude or another AI agent (with copy-paste prompts), and what each hand gesture is good for.

The use cases below assume non-commercial use; see [LICENSE](../LICENSE) for what that means.

- [What we used](#what-we-used)
- [How it is built](#how-it-is-built)
- [Rebuild it with an AI agent](#rebuild-it-with-an-ai-agent)
- [Test without a camera](#test-without-a-camera)
- [Bugs we hit and what fixed them](#bugs-we-hit-and-what-fixed-them)
- [Use cases for each hand function](#use-cases-for-each-hand-function)
- [Ideas to extend it](#ideas-to-extend-it)

---

## What we used

| Part | Choice | Why |
| --- | --- | --- |
| App shell | Plain JavaScript (ES modules) in **one HTML file**, no build step, no framework | Runs by double-clicking; easy to share, read and tweak. |
| PDF rendering | [pdf.js](https://github.com/mozilla/pdf.js) via `pdfjs-dist@6.3.289` from jsDelivr | Renders each page to a canvas at the screen's pixel density; neighbouring pages are rendered ahead. |
| Hand tracking | [MediaPipe Tasks Vision](https://www.npmjs.com/package/@mediapipe/tasks-vision) `@0.10.35`, **GestureRecognizer** | One model gives both the 21 hand landmarks and canned gestures (`Open_Palm`, `Pointing_Up`, ...), so a single pass covers navigation and pointing. |
| Model | `gesture_recognizer.task` (float16, about 8 MB) from Google's storage | Downloaded when you first enable the camera. The browser caches it for only an hour, so the app also tries to keep a local copy in IndexedDB (untested). |
| Runtime | WebAssembly, GPU delegate with an automatic CPU retry | The SDK has no silent fallback, so the app retries on the CPU itself. |
| Camera | `getUserMedia` at 640×480, frames driven by `requestVideoFrameCallback` | Detection runs at the camera's frame rate, not the screen's. |
| Drawing | Canvas 2D: the slide, the camera HUD and the laser (laser on `requestAnimationFrame`) | No dependencies; the laser glides at the display's refresh rate. |
| Tests | Node's built-in `node:test`, running the shipped engine code | No packages to install. |
| How it was made | **Claude Code** (Claude models), with several independent AI reviewers trying to break the gesture logic | See [Rebuild it with an AI agent](#rebuild-it-with-an-ai-agent). |

**Pin exact versions.** The pdf.js and MediaPipe URLs name exact versions. The model URL uses Google's `latest` path, which is the one thing that can change under you. When you build something similar, have the agent confirm that each URL loads and exports what you expect *before* it writes code that depends on it.

## How it is built

```
         webcam → <video> → requestVideoFrameCallback
                               │
                               ▼
                  MediaPipe GestureRecognizer
       21 hand landmarks + MediaPipe's own gesture label
                               │
                               ▼
          classifyPose  →  'open' | 'point' | 'other'
        (label if confident, finger geometry otherwise)
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
        stepNavMachine                stepPointerMachine
         (reach zones)                      (laser)
               │                               │
    navigate(±1, 'gesture')          requestAnimationFrame
               │                               │
               ▼                               ▼
       slide + feedback               glow + fading trail
```

The ideas that made it work:

1. **Pure gesture engine.** `classifyPose`, `isArmPose`, `stepNavMachine` and `stepPointerMachine` never touch the page. They take landmarks and timestamps and return decisions, which makes them testable with synthetic data.
2. **One coordinate convention.** MediaPipe reports un-mirrored coordinates, but the preview is shown mirrored like a mirror. Everything the engine sees is `1 − x`, so "right" always means the presenter's own right. Anything that draws the preview flips the same way.
3. **Zones with a spring-back middle, not a swipe.** The first version measured hand *velocity*. It worked for one slide, then needed the hand pulled out of frame, because the return stroke looked like another swipe. The replacement fixes a middle where your palm settles; only the reach *out* fires, and returning is free.
4. **Separate "a hand is tracked" from "the classifier said gesture X".** Landmarks are steady; the per-frame gesture label flickers, especially in motion. Position and timing state survive a flickery label, and only the moment of firing requires a confident pose.
5. **Hysteresis and grace on every threshold.** Separate enter and exit levels, minimum dwell times, lock-outs after an action, and short grace periods after a lost hand.
6. **Frame-rate-independent smoothing.** Webcams drop to about 15 fps in dim rooms. Smoothing uses a time constant instead of a fixed per-frame factor.
7. **Scale-aware reach.** The reach distance is measured in palm-lengths (between a minimum and a maximum), so it adapts as you move closer or further away.
8. **Honest camera lifecycle.** A generation counter cancels stale work, every failure path releases the camera, there are timeouts on the steps that can hang (starting playback, downloading the model), a watchdog warns if frames stop, and the UI only says "on" once the video is really playing.

## Rebuild it with an AI agent

You can reproduce this, or build a different gesture-controlled tool, with Claude Code or any coding agent that can edit files and run commands. It works best if the agent can also drive a browser and start sub-agents, but neither is required.

### Ground rules that made the difference

1. **Work in phases with a check-in after each.** Viewer first, then hand tracking and navigation, then the pointer and polish. You try each phase on your real webcam before the next starts.
2. **Make the agent verify libraries before coding.** "Confirm each URL and export in a real browser" removes a whole class of confident-but-wrong code.
3. **Ask for pure logic.** Gesture rules with no page access can be tested without a camera.
4. **Give feedback as observations, not solutions.** "I reach right and nothing happens, the dot is amber" beats "increase the threshold".
5. **Use independent reviewers.** A second agent that is told to *break* the code, and has to run it to prove each claim, found the worst bugs in this project (including the likely reason the camera looked "on" but never tracked anything).
6. **Keep a human test at the end.** No synthetic test tells you whether a reach *feels* right. Expect a few rounds of tuning.

### Master prompt (fill in the `{{...}}`)

Replace every `{{...}}`. Where it lists options separated by slashes, pick one. The library names in braces are what this project used; keep them or swap in your own. Paste this prompt **once** at the start, then send the phase prompts below **one at a time**, trying the result on your webcam between them.

```text
I want to build a gesture-controlled {{presentation viewer / photo gallery / recipe reader}} as ONE
self-contained HTML file called {{filename}}.html that runs by double-clicking it in Chrome. No build
step. Libraries come from CDNs with exact pinned versions.

What it does
- I load {{a PDF / several images}} and it shows them full screen, using {{pdf.js}}. It renders the
  neighbouring items ahead of time so changing item is instant.
- My webcam tracks my hand with {{MediaPipe Tasks Vision GestureRecognizer}} so I can control it
  without touching the keyboard:
  - {{Gesture 1 -> action. Example: reach right or left from a neutral middle to go to the next or
    previous slide. There must be a spring-back middle so I can do it again and again without
    lowering my hand.}}
  - {{Gesture 2 -> action. Example: point with my index finger and a glowing laser pointer follows my
    fingertip, smoothed, with a soft fading trail. It hides about 200 ms after I stop pointing.}}
- A small mirrored camera preview with a hand-skeleton overlay and plain-language status text.
  An explicit "Enable camera" button (never prompt automatically). Keyboard shortcuts for everything.
  A slide counter, a progress bar, a clean dark presenter look, fullscreen, and a "?" button that
  opens a guide explaining every gesture.

Rules
1. Before writing code that depends on a library, verify every CDN URL, exact version and API name
   in a real browser or by fetching it. Do not rely on memory. Tell me exactly what you pinned.
2. Keep all gesture logic in pure functions with no DOM access (landmarks and timestamps in,
   decisions out) so it can be unit-tested with synthetic data. Wrap that logic in
   `// @engine:begin` and `// @engine:end` comments, and write node:test tests that extract it
   from the HTML file instead of copying it, so the tests run the code that ships.
3. Mirroring: the preview is CSS-mirrored. Use 1 - x for anything that maps hand position to
   left/right or to screen position.
4. Every gesture threshold needs hysteresis, and a cooldown or grace period. Smoothing must be
   frame-rate independent (use a time constant, not a per-frame factor).
5. Never trust a single frame: a lost hand, a flickering gesture label, or a landmark jumping to the
   other hand must not trigger an action.
6. Camera lifecycle: no double loops when I toggle the camera quickly, release the camera on every
   failure path, use timeouts, and never show "camera on" unless frames really arrive.

Process
- Work in phases and stop for my check-in after each: 1) the viewer, 2) hand tracking and
  navigation, 3) the pointer and polish.
- You cannot see my hand. Test with synthetic landmark data and a fake webcam, and tell me plainly
  what you could not test.
- Before you call a gesture phase done, run an adversarial review (I will give you the prompt).
```

### Phase prompts

**Phase 1: the viewer**

```text
Build phase 1 only: the viewer. Load a PDF (or several images, natural-sorted by filename) by
drag-and-drop or a file picker and render it full screen with {{pdf.js}} at the screen's pixel
density. Pre-render the next and previous two slides. Add keyboard navigation (arrows, Space,
PageUp/PageDown, Home/End, F for fullscreen), a slide counter, a progress bar and a dark presenter UI
whose chrome fades when the mouse is idle. No camera yet. Test it with a generated multi-page PDF and
a set of generated images. When you finish, tell me what you tested and how I should try it.
```

**Phase 2: hand tracking and navigation** (this is where the design choice matters)

```text
Phase 2: hand tracking and navigation. Use {{MediaPipe GestureRecognizer}}: it must give me both
the landmarks and the gesture labels. Create the model with the GPU delegate and retry on the CPU if
that fails. Drive detection from requestVideoFrameCallback with a generation token so toggling the
camera can never stack two loops.

If my master prompt already fixes the navigation design, skip this comparison and implement that
design. Otherwise, BEFORE coding the navigation gesture, propose 2 or 3 designs (for example: velocity swipe, tilt
left/right, and reach zones with a spring-back middle) and compare them for false triggers, fatigue
and whether I can change many slides without lowering my hand. Recommend one, wait for my answer,
then implement it as a pure state machine that returns 'next', 'prev' or nothing. Add the camera
preview with the skeleton and a status line that always says what the app is waiting for. Add the
"?" guide. Unit-test the state machine with synthetic timelines: normal use, talking with my
hands, the hand leaving and returning, tracking at 15 fps, and a landmark jumping for one frame.
```

**Phase 3: the pointer and polish**

```text
Phase 3: the laser pointer and polish. When I point with my index finger, show a glowing dot that
follows the index fingertip (landmark 8). Map a central region of the camera view onto the whole
slide so I never need to reach the camera's edges. Smooth the position with a time constant. It must
appear only after about 60 ms of continuous pointing, stay for about 200 ms after I stop (also
through a short tracking dropout), and the dot must hold still, not follow my hand away, once I stop
pointing. Draw it on requestAnimationFrame with a soft fading trail, mapped to the slide's rendered
rectangle so it never drifts into the letterbox bars. Then polish: clear error messages for every
camera failure, a cancellable "starting camera" state, and on-screen feedback when a gesture
changes the slide.
```

### Adversarial review prompt

Run this before you trust the gesture logic, ideally in a fresh session or with sub-agents so the reviewers have not seen your reasoning.

```text
Review {{filename}}.html adversarially. Start three independent reviewers, each with one lens:
1. the gesture state machines and pose classification (false triggers while I talk with my hands,
   missed gestures, getting stuck, hand switching, low frame rates);
2. the laser pointer, the camera preview and the drawing code;
3. the camera lifecycle, timers, the slide render cache, deck loading and the keyboard.

Every reviewer must extract and RUN the real code against synthetic input, and report only findings
they can demonstrate: the exact sequence of inputs (with numbers), what goes wrong and why (cite the
function), how likely it is in real use, and a minimal fix. They should say explicitly when they
find nothing in an area. No style opinions.

Then: fix the confirmed issues, add a regression test for each one, re-run every test, and give me
a short list of what changed and anything you decided not to fix, with the reason.
```

### Tuning prompt

```text
Here is what happens on my real webcam. When I {{do X}}, the app {{does Y}}, but I expected
{{Z}}. Conditions: {{distance from the camera, lighting, which hand, sitting or standing}}.
First reproduce it as a synthetic timeline and add it as a FAILING test. Then make the smallest
change that fixes it (prefer adjusting one named constant over new logic), keep every existing test
passing, and tell me which constants you touched and what would get worse if I pushed them further.
```

### Prompt for adding or changing a gesture

```text
Add a new gesture: {{closed fist held for half a second}} -> {{toggle a black screen}}.
Follow the existing pattern: extend the pose classification, add a small pure state machine with a
hold time, hysteresis and a cooldown, show it in the camera preview's status line and in the "?"
guide, and add unit tests (including "does not fire while I am talking with my hands" and
"does not fire when the tracker jumps to my other hand").
```

## Test without a camera

You (or your agent) can exercise the whole app, including the real MediaPipe model, without a webcam or a hand. Paste this into the browser console after the page has loaded (or run it through a browser-automation tool), then drive the app by setting `window.__fake`.

```js
// 1) Fake webcam: a canvas stream. Return a FRESH stream on every call, like real getUserMedia.
const cam = document.createElement('canvas'); cam.width = 640; cam.height = 480;
setInterval(() => { const c = cam.getContext('2d'); c.fillStyle = `rgb(${Math.random() * 40 | 0},30,40)`; c.fillRect(0, 0, 640, 480); }, 33);
Object.defineProperty(navigator, 'mediaDevices', {
  configurable: true,
  value: { getUserMedia: async () => cam.captureStream(30) },
});

// 2) Scripted hands: wrap the real recognizer. The real model still runs on the fake frames, but the
//    app sees whatever you put in window.__fake. Import the SAME url the app uses so the class is shared.
const mp = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs');
const real = mp.GestureRecognizer.prototype.recognizeForVideo;
mp.GestureRecognizer.prototype.recognizeForVideo = function (video, ts) {
  real.call(this, video, ts);
  if (!window.__fake) return { landmarks: [], gestures: [], handedness: [] };      // no hand
  return {
    landmarks: [window.__fake.landmarks],                                           // 21 points, x/y in 0..1, NOT mirrored
    gestures: [[{ categoryName: window.__fake.name, score: 0.9 }]],                 // e.g. 'Open_Palm', 'Pointing_Up', 'None'
    handedness: [[{ categoryName: 'Right', score: 0.95 }]],
  };
};

// 3) Load a deck first (the camera button lives on the slide screen), click "Enable camera", wait for
//    the preview, then move a synthetic hand:
//    window.__fake = { landmarks: /* 21 points */, name: 'Open_Palm' };
//    Change landmark x in ~30 ms steps to "reach". Raw x = 1 - (what you see in the mirrored preview),
//    so "Next" means raw x DEcreasing (about -0.3) and "Previous" means raw x increasing.
```

Practical notes:

- Build a synthetic hand from a flat array of 21 `{x, y, z}` points; the tests in [`tests/engine.test.mjs`](../tests/engine.test.mjs) contain a small articulated-hand builder you can copy.
- Chrome may refuse to paste into the DevTools console until you type `allow pasting` and press Enter.
- If the browser tool's window is **hidden**, `window.innerWidth` is 0 and `requestAnimationFrame` stops. Shim it with `window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16)`. In some headless browsers `requestVideoFrameCallback` also never fires; shim `HTMLVideoElement.prototype.requestVideoFrameCallback` with a timer that calls the callback about every 33 ms.
- The prototype patch in step 2 applies to the first import of the MediaPipe module only. If a failed download makes the app retry, it imports the same file with `?retry=N` appended, which is a separate copy the patch doesn't cover.
- To test loading a deck, put a `File` in a `DataTransfer`, assign it to the file input's `files` and dispatch a `change` event.
- To unit-test just the gesture logic, run `npm test`. It extracts the engine from `index.html`, so any change to the engine is tested immediately.
- **Always tell the agent to report what it could not test.** Synthetic data cannot tell you whether a reach feels natural, whether your lighting is good enough, or how a specific camera behaves. Only a real webcam can.

## Bugs we hit and what fixed them

These are worth knowing whatever you build, because AI-written gesture code fails in the same ways.

| Symptom | Cause | Fix |
| --- | --- | --- |
| Camera "on" but no skeleton, no gestures, no error | `<video autoplay>` raced an explicit `play()`; the resulting rejection was swallowed | Remove `autoplay`, `await play()` with a timeout, surface every failure. |
| Slides changed only once, then the hand had to leave the frame | Velocity swipe: the return stroke counted as a swipe, or reset the state | Reach zones with a fixed middle; only the reach out fires. |
| A real swipe sometimes did nothing | One frame where the gesture label wasn't `Open_Palm` wiped the motion history | Track the hand from landmarks; require the label only at the moment of firing. |
| A single glitchy frame flipped a slide | One landmark jumped, so smoothed velocity crossed the threshold | Require the palm to stay in the zone briefly, smooth the position, and treat a sudden jump as a different hand. |
| Talking with your hands changed slides | Arming was too easy and never expired | Arm only on a deliberate upright, camera-facing palm held still; expire after 4 s. |
| A slide flipped when the tracker picked up the other hand | One hand is tracked, so it silently switched after a dropout | Watch the handedness label and sudden jumps; disarm. |
| The laser slid off after the finger lowered | Position kept following the hand during the grace period | Update position only while pointing. |
| The laser flashed for a moment | One misread frame counted as pointing | Require about 60 ms of continuous pointing. |
| Sluggish laser in a dim room | Smoothing factor was per frame; the camera dropped to 15 fps | Smooth with a time constant. |
| Blank slides after restoring a minimized window | The window reported 0×0 and a zero-size bitmap was cached | Fall back to the screen size and re-fit when the window becomes visible. |
| Holding an arrow key froze the app and used lots of memory | A render was queued for every skipped slide and cached | Cancel far-away renders and only cache slides near the current one. |
| "Enable camera" kept failing after one bad network request | Chrome remembers a failed dynamic `import()` | Retry with a different query string on the URL. |
| Stuck on "Starting camera" forever | A camera granted access but never sent frames | Timeouts, a frame watchdog, and a cancel button. |
| `doc.destroy is not a function` | pdf.js 6 has no `destroy()` on the document proxy | Use `doc.loadingTask.destroy()`. |
| DevTools shows a red "Refused to cross-origin redirects of the top-level worker script" line and a "fake worker" warning | The worker script can't start as a real Worker in some contexts (seen on `file://`) | pdf.js falls back to the main thread. Harmless, though very large decks may feel slightly less smooth. |

## Use cases for each hand function

### ✋ Reach to change slides

Good for:

- **Talks where you walk around**, or where the laptop is a few steps away and the clicker is missing or flat.
- **Recorded lessons and screencasts**: no keyboard clicks in the audio, and no reaching off-camera.
- **Workshops, labs and demos where your hands are busy or dirty**: flip a deck of instructions without touching the device.
- **Someone who finds keyboards or clickers hard to use** may prefer a gesture. (This has not been evaluated with users.)

Less good for: dark rooms, standing side-on to the camera, crowded frames with several people, or when you gesture a lot during questions (lower your hand, or press a key).

### ☝️ Point for a laser

Good for:

- **Highlighting a chart, a line of code or part of a diagram** with your other hand free.
- **Screen-shared calls**: share the browser window and the audience sees the laser, which a physical pointer could never show. The camera preview is part of the page too, so it appears in the share whenever your hand is up; crop the share or keep the camera off if you don't want that.
- **Screens where a physical pointer is hard to see**, such as glossy or LED displays.
- **In-person talks on a projector or large display** where a red dot is hard to see.
- **Demo booths and kiosks** where visitors can point without touching the screen.

Less good for: tiny targets (tracking jitter and smoothing limit precision), and windows where the slide isn't visible in the browser.

### ⌨️ Keyboard and the `?` guide

The safety net. Navigation, fullscreen and the guide all work from the keyboard, and the guide explains the gestures to a new user in one screen. Use them when the camera is in a bad spot or a room is too dark.

### Putting them together

A typical talk: the camera comes on at the start, you raise a palm near the middle, reach to move forward, point to underline a figure, lower your hand while answering questions, and use the keyboard if the lighting changes.

## Ideas to extend it

These are not implemented; the prompts above are a good starting point.

- **Page-turner for musicians**: the same reach zones on a score viewer, with a longer hold time to avoid false page turns.
- **Recipe or manual viewer** for messy hands.
- **Photo or museum gallery kiosk**: next / previous plus the laser as a "look here".
- **More gestures** using MediaPipe's other labels: a closed fist to blank the screen, a thumbs-up to start a timer, a victory sign to open the overview.
- **Presenter extras**: a timer, speaker notes, a second-screen presenter view, zoom with a pinch.
- **Left- and right-hand presets**, or a calibration step that measures your comfortable reach.
