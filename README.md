# Gesture Deck

**Present PDF or image decks hands-free.** Reach to change slides, point for a laser pointer. It runs entirely in your browser, in one HTML file, with no build step.

Source-available and free for non-commercial use, under the [PolyForm Noncommercial License](#license).

## What it does

- Opens a **PDF** (export PowerPoint, Keynote or Pages to PDF first) or **several images** as slides, full screen. Neighbouring slides are rendered ahead of time so changing slides is instant.
- Your **webcam tracks your hand** ([MediaPipe](https://ai.google.dev/edge/mediapipe)) so you can present without touching the keyboard:
  - **Reach right or left** to go to the next or previous slide, then come back to the middle and reach again. You never have to lower your hand between slides.
  - **Point with one finger** and a glowing laser pointer follows your fingertip across the slide.
- A small **camera preview** shows your hand skeleton, the reach zones and a plain-language status ("Ready · reach ‹ or ›"), so you can see what the camera sees.
- **Keyboard shortcuts** for navigation, fullscreen and the guide; a slide counter and progress bar; and a built-in gesture guide (press `?`).
- The camera is **never started automatically**. You click *Enable camera* yourself.

## Try it in a minute

1. **Get the files**: click *Code → Download ZIP* on GitHub and unzip, or `git clone` the repository.
2. **Double-click `index.html`.** It needs Google Chrome. If your computer opens another browser, right-click the file and choose *Open With → Google Chrome*, or drag the file onto a Chrome window. You need an internet connection the first time (see [Privacy](#privacy-and-network)).
3. Click **Choose file** and pick [`sample/sample-deck.pdf`](sample/sample-deck.pdf), or drop in your own PDF or images.
4. Click **Enable camera** (bottom right) and allow access.
5. Try the gestures below. Press `?` any time for the guide.

**Host it yourself (optional):** in your copy of the repository go to *Settings → Pages → Build and deployment*, choose *Deploy from a branch*, select `main` and `/ (root)`, and save. The app is then served at `https://<your-username>.github.io/<repo-name>/`. Camera access works there because GitHub Pages uses HTTPS. (Pages on a private repository needs a paid GitHub plan; on the free plan the repository must be public.)

## Gestures

| Gesture | How to do it | What happens |
| --- | --- | --- |
| ✋ **Arm** | Palm toward the camera, fingers up, near the middle of the camera view. Hold still for about a fifth of a second. | The dot on your palm in the preview turns blue and the status reads *Ready · reach ‹ or ›*. |
| ✋→ **Reach right** | From the middle, move your hand right, a little more than one palm-length. | **Next slide.** |
| ←✋ **Reach left** | From the middle, move your hand left. | **Previous slide.** |
| ✋ **Return** | Come back to the shaded middle of the preview. | Nothing changes; you're ready to reach again. |
| ☝️ **Point** | Extend your index finger (any direction, other fingers curled). | A glowing **laser pointer** appears after about 0.06 s and follows your fingertip. Lower your finger and it fades out. |

```
   what the camera preview shows (mirrored, like a mirror)
┌───────────────┬───────────────────────┬───────────────┐
│    < PREV     │      start here       │    NEXT >     │
│ reach into it │   hold still to arm   │ reach into it │
└───────────────┴───────────────────────┴───────────────┘
```

Details that keep it from misfiring:

- Reaching only works after you **deliberately show your palm and hold it still**, and the armed state switches itself off after 4 seconds without a reach. That makes accidental slide changes unlikely, but not impossible: a still, upright palm followed by a fast sideways sweep can still change the slide. Lower your hand when you're not using it.
- After a slide change the **opposite direction stays locked** until your hand has rested in the middle for 0.2 s, so swinging back can't undo the change.
- The reach distance **scales with the size of your palm in the picture**, between a minimum and a maximum (`NAV_ENTER_MIN` / `NAV_ENTER_MAX`), so it adapts as you move closer or further away. Far from the camera, the minimum applies.
- If the camera loses your hand or jumps to a different hand, the app disarms instead of guessing.
- For pointing, the middle of the camera view is stretched over the **whole slide** (the dashed box in the preview), so you don't have to reach the edge of the camera's view.

### Keyboard

| Keys | Action |
| --- | --- |
| `→` `Space` `Page Down` | Next slide |
| `←` `Page Up` | Previous slide |
| `Home` / `End` | First / last slide |
| `F` | Fullscreen (`Esc` to leave) |
| `?` | Gesture guide |

You can also click the left or right edge of the slide. The top bar (move the mouse to reveal it) has buttons for loading a different deck, the gesture guide, the camera and fullscreen.

## Privacy and network

- **The app's own code sends nothing anywhere.** No video, image or slide is uploaded, and there is no analytics. Hand tracking runs locally in your browser (WebAssembly).
- It does download things. pdf.js loads when the page opens (its worker file loads when you open your first PDF). MediaPipe and an ~8 MB hand-tracking model load the first time you enable the camera. They come from `cdn.jsdelivr.net` and `storage.googleapis.com`, so those services can see your IP address as with any website.
- **You need internet whenever the browser's cache is cold.** The pinned library files are cached for a long time. The hand model is cached for only one hour by default, so the app also tries to keep a local copy of it (in IndexedDB) for later sessions. That local copy could not be tested when this was built, so treat offline use as unverified.
- The camera preview is part of the page. If you share your browser window on a call, it appears in the share whenever your hand is up. Crop the share, or leave the camera off.

## Requirements

- **Google Chrome** (a recent version) on a computer with a webcam. It runs from a local file (`file://`) and from HTTPS. Other browsers are untested.
- Internet access whenever the browser cache is cold (see above).
- Reasonable, front-facing light. A bright window *behind* you makes tracking worse.

## Troubleshooting

| You see | Try |
| --- | --- |
| *Camera blocked* | Click the camera icon in Chrome's address bar, choose *Allow*, and click Enable camera again. |
| Still blocked after allowing it | Your operating system may be blocking Chrome. On a Mac: *System Settings → Privacy & Security → Camera → turn on Google Chrome*. On Windows: *Settings → Privacy → Camera*. On a work computer, browser policy may block camera access for local files. Run `python3 -m http.server 8000` in the project folder and open `http://localhost:8000`, or use the GitHub Pages link. |
| *No camera found* | Plug in or enable a webcam, and check that another program isn't hiding it. |
| *The camera is in use by another app* / *isn’t sending any video* | Close Zoom, Meet, Teams and other apps using the camera, then click the camera button off and on. |
| *Hand tracking failed to load* | Check your internet connection and try again. A failed download doesn't need a page reload. |
| The dot never turns blue | Palm toward the camera, fingers up and spread, hand roughly in the middle, held still. A hanging or sideways hand doesn't arm on purpose. |
| A reach does nothing | Look at the status text in the preview. *Back to the middle, then reach* means finish returning to the shaded middle first. |
| Slides change when you didn't want them to | Lower your hand when you're not using it. Adjust the values in [Tuning](#tuning). |
| The laser is offset from your finger | It maps the dashed box in the preview to the whole slide. Point inside that box. |
| The page is blank or buttons don't work | You were offline on first load; connect and reload. |
| Red lines in DevTools such as *INFO: Created TensorFlow Lite XNNPACK delegate*, or a warning about a *fake worker* | Harmless. MediaPipe logs information as errors, and pdf.js falls back to the main thread when its worker can't start. |

## Tuning

Most thresholds live in the *Gesture engine* section near the top of the `<script>` in [`index.html`](index.html). A few rendering constants, such as `POINTER_TRAIL_MS`, are further down. Change a number, reload, try again.

| Constant (default) | What it controls | If you change it |
| --- | --- | --- |
| `NAV_ENTER_PER_PALM` (1.3) | Reach distance, in palm-lengths | Lower: shorter reach, more accidental slide changes. Higher: more arm travel. |
| `NAV_ENTER_MIN` / `NAV_ENTER_MAX` (0.10 / 0.22) | Limits on the reach, as a fraction of the camera width | Raise the maximum if you sit very close. |
| `NAV_ARM_DWELL_MS` (200) | How long you hold still to arm | Lower: arms faster, but everyday gestures are more likely to arm it. |
| `NAV_ARM_STILLNESS` (0.035) | How still your palm must be to arm | Raise it if arming feels fussy. |
| `NAV_ARM_TIMEOUT_MS` (4000) | The armed state expires after this long without a reach | Raise it for slower talks. |
| `NAV_REACH_WINDOW_MS` (450) | A reach has to leave the middle this fast (unless you are still pushing) | Raise to accept slower, more careful reaches. |
| `NAV_LOCK_RELEASE_MS` (200) | Rest in the middle needed before the opposite direction unlocks | Lower for faster back-and-forth. |
| `POINTER_REGION` (`x 0.18–0.82`, `y 0.12–0.76`) | The part of the camera view that maps to the whole slide | Widen it to move your hand less; narrow it for finer control. |
| `POINTER_EMA_TAU_MS` (115) | Laser smoothing | Higher: steadier but laggier. |
| `POINTER_ENTER_MS` / `POINTER_GRACE_MS` (60 / 200) | Time to show / to hide the laser | Raise the grace to make it stickier. |
| `POINTER_TRAIL_MS` (350) | Length of the fading trail | |
| `GESTURE_CONFIDENCE_MIN` (0.5) | How sure MediaPipe must be about its own gesture label | Lower: more permissive for tilted hands. |
| `FINGER_OPEN_RATIO` / `POINT_MIN_RATIO` (1.25 / 1.2) | How straight a finger must be to count as extended | Lower: a relaxed hand starts counting as open. |

After any change run the tests (below). If a change should alter behaviour on purpose, update the matching test in the same commit.

## How it works

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

The camera preview (zones, skeleton, palm marker, status text) is drawn from the same frames.

The gesture logic is written as **pure functions with no DOM access**: landmarks and timestamps go in, decisions come out. That's why the tests can run without a camera or a browser. [`Guide/GUIDE.md`](Guide/GUIDE.md) explains the design, the bugs found along the way, and how to rebuild or extend it with an AI agent.

```
gesture-deck/
├── index.html            the whole app (HTML, CSS and JavaScript)
├── sample/
│   └── sample-deck.pdf   a six-slide deck that explains the gestures
├── tests/
│   └── engine.test.mjs   unit tests for the gesture logic
├── Guide/
│   └── GUIDE.md          stack, rebuilding it with an AI agent, use cases
├── README.md
├── LICENSE
├── package.json          only for `npm test`
└── .gitignore
```

## Development and tests

There is no build step: edit `index.html`, reload the page.

```bash
npm test
```

(Or `node --test tests/engine.test.mjs`.) The tests were written and run on Node 22; Node 18 or newer should work. They extract the gesture engine from `index.html` (between the `@engine:begin` and `@engine:end` comments) and run it against synthetic hand landmarks and timelines, so they test the code that ships, not a copy. They cover reaching, hand movements that shouldn't change slides, hand loss and hand switching, tracking at 15 fps, pose detection and the laser pointer. The rendering and camera code is not covered; see the [guide](Guide/GUIDE.md#test-without-a-camera) for how to test it with a fake webcam.

## Known limitations

- Tested in Chrome only; tracks one hand at a time.
- Needs light, a camera facing you, and an internet connection whenever the browser cache is cold.
- The hand model is loaded from Google's `latest` URL, so Google could change it later. To pin it, download a copy and point `GESTURE_MODEL_URL` at it. That only works when the page is served over http(s) (for example GitHub Pages or `python3 -m http.server`), not when you double-click the file, because Chrome won't let a page fetch a local file.
- Reads PDF and images only; export PowerPoint, Keynote or Pages to PDF first. There are no speaker notes or presenter view.
- Not evaluated with users, and not tested for accessibility with assistive technology.

## Built with

- [pdf.js](https://github.com/mozilla/pdf.js) 6.3.289 (`pdfjs-dist`, Apache-2.0), to render PDFs.
- [MediaPipe Tasks Vision](https://www.npmjs.com/package/@mediapipe/tasks-vision) 0.10.35 (Apache-2.0), for hand tracking and the Gesture Recognizer, using Google's `gesture_recognizer.task` model ([model card](https://storage.googleapis.com/mediapipe-assets/gesture_recognizer/model_card_hand_gesture_classification_with_faireness_2022.pdf); check it for the model's terms).
- Written with [Claude Code](https://claude.com/claude-code) and reviewed by independent AI reviewers, then tested and adjusted with a real webcam. The guide describes the process and includes prompts to repeat it.

These libraries are loaded from public CDNs when the app runs; they are not included in this repository and keep their own licenses.

## License

Licensed under the **[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)**, a ready-made, lawyer-drafted license for software that anyone may use for **non-commercial purposes only**. The full, unmodified text is in [LICENSE](LICENSE).

- **Allowed:** personal use, hobby projects, private study and research, and use by schools, universities, charities, public research bodies and government organisations. You may also change it and share it, as long as the license text (or its link) and the `Required Notice:` lines from [LICENSE](LICENSE) go with it.
- **Not allowed without my written permission:** commercial use.
- **Using it as part of your job at a company:** the license text doesn't say either way. My intent is that this counts as commercial use, so please ask first.
- **How to ask:** open an issue on the original repository (the one this copy came from).

This is *source-available*, not open source: the Open Source Definition doesn't allow limits on commercial use. GitHub labels the license "Other" because it only recognises a short list of licenses and none of the non-commercial ones are on it. The label doesn't change the terms.

Much of the code was written with an AI assistant under my direction, and the license applies to whatever copyright exists in it. pdf.js, MediaPipe and the hand-tracking model are loaded from public CDNs and keep their own terms.
